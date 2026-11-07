// ===== Fitness Exclusive - Central Server =====
// One server + one database for every branch, kiosk, gate screen, turnstile and the member app.
// No npm packages needed. Requires Node.js 22.13+ (uses the built-in node:sqlite).
//   Start:  node server/server.js        Open: http://localhost:3000
const http=require("http"), fs=require("fs"), path=require("path"), vm=require("vm"), crypto=require("crypto"), os=require("os");
const ROOT=path.join(__dirname,"..");
const PORT=Number(process.env.PORT||3000);
const BACKUP_DIR=path.join(__dirname,"backups");

// ---------- shared business logic (same file the browser uses) ----------
const ctx={console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,"data.js"),"utf8"),ctx,{filename:"data.js"});
// top-level const/let are not properties of the context, so expose the ones the server needs
vm.runInContext("Object.assign(globalThis,{PLANS,PASS_TYPES,memberById,today,money,addDays,daysUntil})",ctx);
const L=ctx; // L.processTap, L.renewMember, L.seed, L.db ...

// ---------- storage: SQLite (fallback: JSON file) ----------
let store;
try{
  const {DatabaseSync}=require("node:sqlite");
  const sq=new DatabaseSync(path.join(__dirname,"fitness.db"));
  sq.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL, updated INTEGER);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, user TEXT, action TEXT, detail TEXT);
    CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);`);
  try{ sq.exec("ALTER TABLE audit ADD COLUMN screen TEXT"); }catch(e){ /* column already exists */ }
  const all=sq.prepare("SELECT k,v FROM kv"), put=sq.prepare("INSERT INTO kv(k,v,updated) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated");
  const aud=sq.prepare("INSERT INTO audit(ts,user,action,detail,screen) VALUES(?,?,?,?,?)");
  store={kind:"SQLite (server/fitness.db)",load:()=>all.all(),put:(k,v)=>put.run(k,v,Date.now()),
    audit:(u,a,d,s)=>aud.run(Date.now(),String(u||""),String(a||""),String(d??"").slice(0,1000),String(s||"")),
    audits:(f={})=>{ const w=[],p=[];
      if(f.from){ w.push("ts>=?"); p.push(Number(f.from)); } if(f.to){ w.push("ts<=?"); p.push(Number(f.to)); }
      if(f.user){ w.push("user=?"); p.push(f.user); } if(f.q){ const q="%"+f.q+"%"; w.push("(user LIKE ? OR action LIKE ? OR detail LIKE ? OR screen LIKE ?)"); p.push(q,q,q,q); }
      return sq.prepare(`SELECT ts,user,action,detail,screen FROM audit ${w.length?"WHERE "+w.join(" AND "):""} ORDER BY id DESC LIMIT ${Math.min(Number(f.limit)||1000,5000)}`).all(...p); },
    users:()=>sq.prepare("SELECT DISTINCT user FROM audit ORDER BY user LIMIT 300").all().map(r=>r.user)};
}catch(e){
  console.warn("node:sqlite not available ("+e.message+"). Using JSON file storage. Upgrade to Node.js 22.13+ for SQLite.");
  const F=path.join(__dirname,"fitness.json"); let data={kv:{},audit:[]}; try{ data=JSON.parse(fs.readFileSync(F,"utf8")); }catch{}
  const flush=()=>fs.writeFileSync(F,JSON.stringify(data));
  store={kind:"JSON (server/fitness.json)",load:()=>Object.entries(data.kv).map(([k,v])=>({k,v})),put:(k,v)=>{data.kv[k]=v;flush();},
    audit:(u,a,d,s)=>{data.audit.unshift({ts:Date.now(),user:String(u||""),action:String(a||""),detail:String(d??"").slice(0,1000),screen:String(s||"")}); data.audit.length=Math.min(data.audit.length,20000); flush();},
    audits:(f={})=>data.audit.filter(r=>(!f.from||r.ts>=f.from)&&(!f.to||r.ts<=f.to)&&(!f.user||r.user===f.user)&&(!f.q||(r.user+" "+r.action+" "+r.detail+" "+r.screen).toLowerCase().includes(String(f.q).toLowerCase()))).slice(0,Math.min(Number(f.limit)||1000,5000)),
    users:()=>[...new Set(data.audit.map(r=>r.user))].sort()};
}

// ---------- load state ----------
const last={}; let accounts={}, sessions={};
(function load(){
  const rows=store.load(); const state={};
  for(const r of rows){ if(r.k==="__accounts") accounts=JSON.parse(r.v); else if(r.k==="__sessions") sessions=JSON.parse(r.v); else state[r.k]=JSON.parse(r.v); }
  if(!Object.keys(state).length){ Object.assign(state,L.seed()); console.log("New database created with sample data."); }
  L.db=L.migrate(state);
  for(const k in state){ const s=JSON.stringify(state[k]); last[k]=s; store.put(k,s); }
  if(!Object.keys(accounts).length){
    for(const [u,name,role,pw] of [["owner","Owner","Owner","owner123"],["frontdesk","Front Desk 1","FrontDesk","desk123"],["coach","Coach Mark","Trainer","coach123"]]) accounts[u]=mkAccount(name,role,pw);
    saveAccounts(); console.log("Default accounts created: owner/owner123, frontdesk/desk123, coach/coach123  (CHANGE THESE!)");
  }
})();
function mkAccount(name,role,pw){ const salt=crypto.randomBytes(16).toString("hex"); return {name,role,salt,hash:crypto.scryptSync(pw,salt,32).toString("hex")}; }
function checkPw(a,pw){ const h=crypto.scryptSync(String(pw),a.salt,32); return crypto.timingSafeEqual(h,Buffer.from(a.hash,"hex")); }
function saveAccounts(){ store.put("__accounts",JSON.stringify(accounts)); }
function saveSessions(){ const now=Date.now(); for(const t in sessions) if(sessions[t].exp<now) delete sessions[t]; store.put("__sessions",JSON.stringify(sessions)); }

// persist changed collections + notify all screens
function commit(from){
  const keys=[];
  for(const k in L.db){ const s=JSON.stringify(L.db[k]); if(s!==last[k]){ last[k]=s; store.put(k,s); keys.push(k); } }
  if(keys.length) broadcast({keys,from});
  return keys;
}
const audit=(user,action,detail,screen)=>store.audit(user,action,detail,screen);
const staffName=s=>`${s.name} (${s.role})`;
const pick=keys=>Object.fromEntries(keys.map(k=>[k,L.db[k]]));

// ---------- real-time events (Server-Sent Events) ----------
const clients=new Set();
function broadcast(msg){ const s=`data: ${JSON.stringify(msg)}\n\n`; for(const c of clients) c.write(s); }
setInterval(()=>{ for(const c of clients) c.write(": ping\n\n"); },25000);

// ---------- helpers ----------
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon",".webmanifest":"application/manifest+json",".md":"text/plain; charset=utf-8"};
function send(res,code,obj,headers={}){ res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store",...headers}); res.end(JSON.stringify(obj)); }
function body(req){ return new Promise((ok,bad)=>{ let n=0; const ch=[]; req.on("data",c=>{ n+=c.length; if(n>8e6){ bad(Object.assign(new Error("Payload too large"),{code:413})); req.destroy(); } else ch.push(c); });
  req.on("end",()=>{ if(!ch.length) return ok({}); try{ ok(JSON.parse(Buffer.concat(ch).toString())); }catch{ bad(Object.assign(new Error("Invalid JSON"),{code:400})); } }); }); }
function newToken(data,days){ const t=crypto.randomBytes(24).toString("hex"); sessions[t]={...data,exp:Date.now()+days*86400000}; saveSessions(); return t; }
function auth(req,url){
  const h=req.headers.authorization||""; const t=h.startsWith("Bearer ")?h.slice(7):url.searchParams.get("token");
  const s=t&&sessions[t]; if(!s||s.exp<Date.now()) return null; return {...s,token:t};
}
const fails={};
function limited(ip){ const f=fails[ip]; return f&&f.n>=10&&Date.now()-f.t<15*60000; }
function fail(ip){ const f=fails[ip]||{n:0,t:Date.now()}; if(Date.now()-f.t>15*60000){f.n=0;f.t=Date.now();} f.n++; fails[ip]=f; }
const STAFF_ROLES=["Owner","FrontDesk","Trainer"];

// member-facing view (no PIN / face data)
function memberView(m){ const {pin,face,...r}=m; return {...r,status:L.memberStatus(m),hasFace:!!face}; }
function memberBundle(m){
  return {me:memberView(m),plans:L.PLANS,packageTypes:L.db.packageTypes,
    settings:{gymName:L.db.settings.gymName,refReward:L.db.settings.refReward,refDiscount:L.db.settings.refDiscount},
    inside:!!L.db.inside["member:"+m.id],
    classes:L.db.classes.map(c=>({id:c.id,name:c.name,trainer:c.trainer,time:c.time,cap:c.cap,booked:c.booked.length,mine:c.booked.includes(m.id),wait:c.wait.indexOf(m.id)})),
    courts:L.db.courts.map(c=>({name:c.name,price:c.price,slots:Object.fromEntries(Object.entries(c.slots).map(([t,id])=>[t,id===m.id?"mine":"taken"]))})),
    tournaments:L.db.tournaments.map(t=>({name:t.name,sport:t.sport,teams:t.teams,matches:t.matches})),
    logs:L.db.logs.filter(l=>l.mid===m.id||(m.rfid&&l.uid===m.rfid)).filter(l=>!l.seed).slice(0,30),
    payments:L.db.payments.filter(p=>p.name===m.name).slice(0,20)};
}
// charge a member (GCash/Maya are simulated here; connect PayMongo/Xendit for real payments)
function charge(m,amount,cat,method,promo){
  let disc={amount,discount:0};
  if(promo){ disc=L.applyPromo(promo,amount,cat); if(disc.error) throw Object.assign(new Error(disc.error),{code:400}); }
  if(!["GCash","Maya","Wallet","Card"].includes(method)) throw Object.assign(new Error("Invalid payment method"),{code:400});
  if(method==="Wallet"){ if(m.wallet<disc.amount) throw Object.assign(new Error("Insufficient wallet balance"),{code:400}); m.wallet-=disc.amount; }
  if(disc.code) L.usePromo(disc.code);
  return {amount:disc.amount,extra:disc.discount?{discount:disc.discount,promo:disc.code}:{}};
}

// ---------- API ----------
async function api(req,res,url){
  const p=url.pathname, M=req.method, ip=req.socket.remoteAddress, from=req.headers["x-client"]||"", scr=String(req.headers["x-screen"]||"").slice(0,20);
  const a=auth(req,url);
  const staff=a&&a.type==="staff"?a:null, member=a&&a.type==="member"?L.memberById(a.memberId):null;
  const need=(cond,code=401,msg="Please log in")=>{ if(!cond) throw Object.assign(new Error(msg),{code}); };

  // --- staff auth ---
  if(p==="/api/login"&&M==="POST"){
    if(limited(ip)) return send(res,429,{error:"Too many attempts. Try again in 15 minutes."});
    const b=await body(req); const acc=accounts[String(b.username||"").toLowerCase()];
    if(!acc||!checkPw(acc,b.password||"")){ fail(ip); audit(String(b.username||"?"),"Login failed","Wrong username or password · "+ip,scr); return send(res,401,{error:"Wrong username or password"}); }
    const token=newToken({type:"staff",username:String(b.username).toLowerCase(),name:acc.name,role:acc.role},30);
    audit(`${acc.name} (${acc.role})`,"Login","IP "+ip,scr); return send(res,200,{token,me:{username:b.username,name:acc.name,role:acc.role}});
  }
  if(p==="/api/logout"&&M==="POST"){ if(a){ if(staff) audit(staffName(staff),"Logout","",scr); delete sessions[a.token]; saveSessions(); } return send(res,200,{ok:true}); }
  if(p==="/api/password"&&M==="POST"){ need(staff); const b=await body(req); const acc=accounts[staff.username];
    if(!checkPw(acc,b.old||"")) return send(res,400,{error:"Current password is wrong"});
    if(String(b.new||"").length<6) return send(res,400,{error:"New password must be at least 6 characters"});
    accounts[staff.username]=mkAccount(acc.name,acc.role,b.new); saveAccounts(); audit(staffName(staff),"Changed own password","",scr); return send(res,200,{ok:true}); }

  // --- state sync (staff screens: admin, kiosk, gate) ---
  if(p==="/api/state"&&M==="GET"){ need(staff); const keys=url.searchParams.get("keys");
    return send(res,200,{state:keys?pick(keys.split(",").filter(k=>k in L.db)):L.db,me:{username:staff.username,name:staff.name,role:staff.role},storage:store.kind}); }
  if(p==="/api/state"&&M==="PUT"){ need(staff); const b=await body(req); const ch=b.changes||{};
    for(const k in ch){ if(!(k in L.db)||k.startsWith("__")) return send(res,400,{error:"Unknown collection "+k}); }
    const who=staffName(staff);
    for(const k in ch){ let old=null; try{ old=last[k]?JSON.parse(last[k]):null; }catch(e){} for(const c of L.describeChanges(k,old,ch[k])) audit(who,c.action,c.detail,scr); }
    for(const n of (Array.isArray(b.notes)?b.notes:[]).slice(0,50)) audit(who,String(n.action||"Note").slice(0,80),n.detail,scr);
    Object.assign(L.db,ch); const keys=commit(from); return send(res,200,{ok:true,keys}); }
  if(p==="/api/tap"&&M==="POST"){ need(staff); const b=await body(req);
    const result=L.processTap(String(b.uid||""),b.device,b.mode||"auto",String(b.snap||"").slice(0,20000));
    audit(staffName(staff),String(b.uid||"").toUpperCase().startsWith("FACE:")?"Face tap":"RFID tap",`${result.who?result.who.name:b.uid} · ${result.action} · ${result.device.name}${result.ok?"":" · "+result.msg}`,scr);
    const keys=commit(from); return send(res,200,{result,state:pick(keys)}); }
  if(p==="/api/events"&&M==="GET"){ need(staff);
    res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive"}); res.write("retry: 3000\n\n");
    clients.add(res); req.on("close",()=>clients.delete(res)); return; }

  // --- owner tools ---
  if(p==="/api/users"&&M==="POST"){ need(staff&&staff.role==="Owner",403,"Owner only"); const b=await body(req);
    const u=String(b.username||"").toLowerCase().trim(); if(!/^[a-z0-9._-]{3,30}$/.test(u)) return send(res,400,{error:"Username: 3-30 letters/numbers"});
    if(accounts[u]) return send(res,400,{error:"Username already exists"}); if(!STAFF_ROLES.includes(b.role)) return send(res,400,{error:"Invalid role"});
    if(String(b.password||"").length<6) return send(res,400,{error:"Password must be at least 6 characters"});
    accounts[u]=mkAccount(b.name||u,b.role,b.password); saveAccounts(); L.db.users.push({username:u,name:b.name||u,role:b.role});
    commit(from); audit(staffName(staff),"Added staff account",`${b.name||u} · ${u} · ${b.role}`,scr); return send(res,200,{ok:true}); }
  if(p==="/api/users"&&M==="DELETE"){ need(staff&&staff.role==="Owner",403,"Owner only"); const u=String(url.searchParams.get("username")||"").toLowerCase();
    if(!accounts[u]) return send(res,404,{error:"Account not found"});
    if(u===staff.username) return send(res,400,{error:"You cannot delete your own account"});
    if(accounts[u].role==="Owner"&&Object.values(accounts).filter(x=>x.role==="Owner").length<2) return send(res,400,{error:"Keep at least one Owner account"});
    const gone=accounts[u]; delete accounts[u]; saveAccounts(); for(const t in sessions) if(sessions[t].username===u) delete sessions[t]; saveSessions();
    L.db.users=L.db.users.filter(x=>x.username!==u); commit(from); audit(staffName(staff),"Deleted staff account",`${gone.name} · ${u} · ${gone.role}`,scr); return send(res,200,{ok:true}); }
  if(p==="/api/audit"&&M==="GET"){ need(staff&&staff.role==="Owner",403,"Owner only"); const q=url.searchParams;
    return send(res,200,{audit:store.audits({q:q.get("q")||"",user:q.get("user")||"",from:Number(q.get("from"))||0,to:Number(q.get("to"))||0,limit:q.get("limit")}),users:store.users()}); }
  if(p==="/api/backup"&&M==="GET"){ need(staff&&staff.role==="Owner",403,"Owner only"); audit(staffName(staff),"Downloaded backup","",scr);
    return send(res,200,L.db,{"Content-Disposition":`attachment; filename="fitness-backup-${L.today()}.json"`}); }
  if(p==="/api/reset"&&M==="POST"){ need(staff&&staff.role==="Owner",403,"Owner only"); backup("before-reset"); L.db=L.seed(); for(const k in last) delete last[k];
    commit(""); audit(staffName(staff),"RESET all data","A backup was saved first in server/backups",scr); return send(res,200,{ok:true}); }
  if(p==="/api/info"&&M==="GET"){ need(staff); return send(res,200,{storage:store.kind,clients:clients.size,lan:lanIps().map(i=>`http://${i}:${PORT}`),uptime:Math.round(process.uptime())}); }

  // --- turnstile / door controllers (ESP32 etc.) ---
  if(p.startsWith("/api/device/")){
    const key=req.headers["x-device-key"]||url.searchParams.get("key"); const dev=L.db.devices.find(d=>d.key&&d.key===key);
    if(!dev) return send(res,401,{error:"Invalid device key"});
    dev.online=true; dev.lastSeen=Date.now();
    if(p==="/api/device/tap"&&M==="POST"){ const b=await body(req);
      const r=L.processTap(String(b.uid||""),dev.id,b.mode||dev.mode||"auto",""); commit("");
      audit("Device: "+dev.name,"Controller tap",`${r.who?r.who.name:b.uid} · ${r.action}${r.ok?"":" · "+r.msg}`,"Device");
      return send(res,200,{open:r.ok,action:r.action,msg:r.msg,name:r.who?r.who.name:""}); }
    if(p==="/api/device/allowlist"&&M==="GET"){ // for offline mode: controller caches who may enter
      const uids=[...L.db.members.filter(m=>m.rfid&&["Active","Expiring"].includes(L.memberStatus(m))).map(m=>m.rfid),
        ...L.db.trainers.map(t=>t.rfid),...L.db.passes.filter(x=>x.validUntil>Date.now()).map(x=>x.rfid)];
      commit(""); return send(res,200,{device:dev.name,uids,ts:Date.now()}); }
    if(p==="/api/device/sync"&&M==="POST"){ // upload taps made while offline
      const b=await body(req); const taps=(b.taps||[]).slice(0,500); for(const t of taps) L.processTap(String(t.uid),dev.id,t.mode||"auto","");
      commit(""); audit("Device: "+dev.name,"Offline taps uploaded",taps.length+" tap(s)","Device"); return send(res,200,{ok:true}); }
  }

  // --- member app ---
  if(p==="/api/member/login"&&M==="POST"){
    if(limited(ip)) return send(res,429,{error:"Too many attempts. Try again in 15 minutes."});
    const b=await body(req); const id=String(b.id||"").trim().toUpperCase();
    const m=L.db.members.find(x=>x.id===id||(x.phone&&x.phone===String(b.id).trim()));
    if(!m||String(m.pin)!==String(b.pin)){ fail(ip); audit(String(b.id||"?"),"Member login failed","IP "+ip,"Member app"); return send(res,401,{error:"Wrong member ID / mobile or PIN"}); }
    audit(`${m.name} (member ${m.id})`,"Member login","IP "+ip,"Member app");
    return send(res,200,{token:newToken({type:"member",memberId:m.id},60)}); }
  if(p==="/api/member/me"&&M==="GET"){ need(member); return send(res,200,memberBundle(member)); }
  if(p==="/api/member/action"&&M==="POST"){ need(member); const m=member; const b=await body(req); let receipt=null, msg="Done";
    switch(b.type){
      case "bookClass":{ const c=L.db.classes.find(x=>x.id===b.id); need(c,404,"Class not found");
        if(c.booked.includes(m.id)||c.wait.includes(m.id)) return send(res,400,{error:"Already booked"});
        if(c.booked.length<c.cap){ c.booked.push(m.id); msg="Booked: "+c.name; } else { c.wait.push(m.id); msg="Class full. You're #"+c.wait.length+" on the waitlist"; } break; }
      case "cancelClass":{ const c=L.db.classes.find(x=>x.id===b.id); need(c,404,"Class not found");
        c.booked=c.booked.filter(x=>x!==m.id); c.wait=c.wait.filter(x=>x!==m.id);
        if(c.booked.length<c.cap&&c.wait.length){ const nx=L.memberById(c.wait.shift()); c.booked.push(nx.id); L.sendSms(nx.phone,`${L.db.settings.gymName}: A slot opened in ${c.name}. You're booked!`); }
        msg="Booking cancelled"; break; }
      case "bookCourt":{ const c=L.db.courts[b.court]; need(c,404,"Court not found"); if(c.slots[b.slot]) return send(res,400,{error:"Slot already taken"});
        const ch=charge(m,c.price*2,"Courts",b.method,b.promo); c.slots[b.slot]=m.id; receipt=L.addPayment(m.name,`${c.name} ${b.slot} (2h)`,"Courts",ch.amount,b.method,"Paid",ch.extra);
        msg=`${c.name} booked at ${b.slot}`; break; }
      case "renew":{ need(L.PLANS[b.plan],400,"Invalid plan"); m.plan=b.plan; const ch=charge(m,L.PLANS[b.plan].price,"Membership",b.method,b.promo);
        L.renewMember(m,b.method,ch.amount,ch.extra); receipt=L.lastReceipt; msg=`Renewed until ${m.exp}`; break; }
      case "buyPackage":{ const t=L.db.packageTypes[b.idx]; need(t,404,"Package not found"); const ch=charge(m,t.price,"Training",b.method,b.promo);
        receipt=L.buyPackage(m,b.idx,b.method,ch.amount,ch.extra); msg=t.name+" added"; break; }
      case "loadWallet":{ const amt=Number(b.amount); if(!(amt>=100&&amt<=20000)) return send(res,400,{error:"Amount must be ₱100 - ₱20,000"});
        if(!["GCash","Maya","Card"].includes(b.method)) return send(res,400,{error:"Invalid payment method"});
        m.wallet+=amt; receipt=L.addPayment(m.name,"Wallet load","Wallet",amt,b.method); msg="Wallet loaded"; break; }
      case "freeze":{ m.frozen=!m.frozen; msg=m.frozen?"Membership frozen":"Membership active again"; break; }
      case "pin":{ if(!/^\d{4,6}$/.test(String(b.pin||""))) return send(res,400,{error:"PIN must be 4-6 digits"}); m.pin=String(b.pin); msg="PIN changed"; break; }
      default: return send(res,400,{error:"Unknown action"});
    }
    commit(""); audit(`${m.name} (member ${m.id})`,"Member app: "+b.type,msg+(receipt?` · ${receipt.or} · ${L.money(receipt.amount)} · ${receipt.method}`:""),"Member app");
    return send(res,200,{ok:true,msg,receipt,bundle:memberBundle(m)}); }
  if(p==="/api/member/receipt"&&M==="GET"){ need(member); const r=L.db.payments.find(x=>x.or===url.searchParams.get("or")&&x.name===member.name); need(r,404,"Receipt not found");
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}); return res.end(L.receiptHtml(r)); }

  return send(res,404,{error:"Not found"});
}

// ---------- static files ----------
function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname); if(rel==="/") rel="/index.html";
  const file=path.normalize(path.join(ROOT,rel));
  if(!file.startsWith(ROOT+path.sep)||/[\\/](server|\.git|\.kiro|\.agents)([\\/]|$)/i.test(file.slice(ROOT.length))||path.basename(file).startsWith(".")){ res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file,(err,data)=>{ if(err){ res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200,{"Content-Type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"}); res.end(data); });
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://x");
  res.setHeader("X-Content-Type-Options","nosniff"); res.setHeader("Referrer-Policy","same-origin");
  if(!url.pathname.startsWith("/api/")) return serveStatic(req,res,url);
  try{ await api(req,res,url); }
  catch(e){ if(!res.headersSent) send(res,e.code&&e.code>=400&&e.code<600?e.code:500,{error:e.code?e.message:"Server error"}); if(!e.code) console.error(e); }
});

// ---------- automatic backups ----------
function backup(tag="auto"){
  try{ fs.mkdirSync(BACKUP_DIR,{recursive:true});
    fs.writeFileSync(path.join(BACKUP_DIR,`backup-${new Date().toISOString().replace(/[:.]/g,"-")}-${tag}.json`),JSON.stringify(L.db));
    const files=fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith(".json")).sort(); while(files.length>30) fs.unlinkSync(path.join(BACKUP_DIR,files.shift()));
  }catch(e){ console.error("Backup failed",e.message); }
}
backup("startup"); setInterval(()=>backup(),6*3600000);
// mark controllers offline when silent for 2 minutes
setInterval(()=>{ let ch=false; for(const d of L.db.devices){ if(d.lastSeen&&d.online&&Date.now()-d.lastSeen>120000){ d.online=false; ch=true; } } if(ch) commit(""); },30000);

function lanIps(){ return Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==="IPv4"&&!i.internal).map(i=>i.address); }
server.listen(PORT,"0.0.0.0",()=>{
  console.log(`\n Fitness Exclusive central server running`);
  console.log(` Storage: ${store.kind}`);
  console.log(` Admin:      http://localhost:${PORT}/`);
  console.log(` Kiosk:      http://localhost:${PORT}/kiosk.html`);
  console.log(` Gate:       http://localhost:${PORT}/kiosk.html?mode=gate`);
  console.log(` Member app: http://localhost:${PORT}/member.html`);
  for(const ip of lanIps()) console.log(` Other devices on the network: http://${ip}:${PORT}/`);
  console.log("");
});
