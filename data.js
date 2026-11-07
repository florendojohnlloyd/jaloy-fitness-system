// ===== Shared data + business logic =====
// Used by the browser (admin, kiosk, gate) AND by the central server (server/server.js).
// Server mode: data lives in the central SQLite database and syncs in real time.
// Offline demo mode (opening the HTML file directly): data lives in this browser's localStorage.
const IS_NODE = typeof window === "undefined";
const DB_KEY = "fitnessexclusive_db_v3";
const COLORS = ["#f97316","#0ea5e9","#22c55e","#a855f7","#ef4444","#eab308","#14b8a6","#6366f1"];
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (n, from) => { const d = from ? new Date(from) : new Date(); d.setDate(d.getDate()+n); return ymd(d); };
const daysUntil = s => Math.round((new Date(s+"T00:00:00") - new Date(today()+"T00:00:00"))/86400000);
const money = n => "₱" + Number(n||0).toLocaleString();
const fmtTime = ts => new Date(ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const PLANS = {
  Monthly:   {price:1500,  days:30,  areas:["Gym"]},
  Quarterly: {price:4000,  days:90,  areas:["Gym","Courts"]},
  Annual:    {price:15000, days:365, areas:["Gym","Courts"]},
  VIP:       {price:2500,  days:30,  areas:["Gym","Courts","Boxing Area"]},
  Student:   {price:1000,  days:30,  areas:["Gym","Courts"]}
};
const PASS_TYPES = {
  "Day Pass": {price:150, hours:null, areas:["Gym"]},
  "3-Hour Pass": {price:100, hours:3, areas:["Gym"]},
  "Day Pass + Courts": {price:250, hours:null, areas:["Gym","Courts"]}
};

function seed(){
  const list = [
    ["Juan Dela Cruz","Monthly","Gym",30],["Maria Santos","Annual","Badminton",140],
    ["Pedro Reyes","Quarterly","Basketball",3],["Liza Garcia","Monthly","Volleyball",-10],
    ["Carlo Mendoza","VIP","Boxing",200],["Ana Villanueva","Monthly","Yoga",5],
    ["Miguel Torres","Student","Basketball",60],["Jasmine Cruz","Annual","Tennis",-40]
  ];
  const members = list.map((r,i)=>({
    id:"M"+pad3(i+1), rfid:"00045123"+(45+i), name:r[0], plan:r[1], sport:r[2], exp:addDays(r[3]),
    frozen:false, phone:"0917"+(2000000+i*13579), parent:i===6?"09181234567":"", branch:"Main - QC",
    color:COLORS[i%COLORS.length], photo:"", wallet:500+i*150, height:160+i*2, workout:"",
    email:r[0].split(" ")[0].toLowerCase()+"@mail.com", pin:"1234", refCode:makeRefCode(r[0],i), referredBy:"", face:null,
    sessions:i===0?[{name:"Personal Training 10",left:7,total:10,trainer:"Coach Mark"}]:i===4?[{name:"Boxing 5",left:2,total:5,trainer:"Coach Jun"}]:[],
    progress:[{d:addDays(-60),w:82-i,bf:26,mm:30},{d:addDays(-30),w:80-i,bf:24,mm:31},{d:addDays(-3),w:78-i,bf:22,mm:32}],
    lastVisit:addDays(i===3?-25:i===7?-45:-(i%3))
  }));
  const trainers = [
    ["Coach Mark","Strength & HIIT",350],["Coach Ana","Yoga",300],["Coach Jun","Boxing",350],
    ["Coach Ray","Basketball",400],["Coach Liza","Volleyball",380]
  ].map((t,i)=>({id:"T"+pad3(i+1), rfid:"00099900"+(10+i), name:t[0], specialty:t[1], rate:t[2], hours:40+i*6, color:COLORS[(i+3)%COLORS.length], photo:""}));

  // fake attendance history for reports / peak hours
  const logs=[]; const now=new Date();
  for(let d=6; d>=0; d--){
    const n = 20 + Math.floor(Math.random()*25);
    for(let k=0;k<n;k++){
      const hr=[6,6,7,7,8,9,10,12,15,16,17,17,18,18,18,19,19,20,21][Math.floor(Math.random()*19)];
      const t=new Date(now); t.setDate(t.getDate()-d); t.setHours(hr, Math.floor(Math.random()*60));
      if(t>now) continue;
      const m=members[Math.floor(Math.random()*members.length)];
      logs.push({ts:t.getTime(), name:m.name, uid:m.rfid, kind:"member", action:"Time In", device:"Main Turnstile", dur:"", reason:"", snap:"", seed:true});
    }
  }
  logs.sort((a,b)=>b.ts-a.ts);

  let orN=1000;
  const pay=(dOff,name,item,cat,amount,method,status="Paid")=>({or:"OR-"+String(++orN).padStart(6,"0"),ts:new Date(addDays(dOff)+"T10:00:00").getTime(),name,item,cat,amount,method,status,branch:"Main - QC",discount:0});
  return {
    settings:{gymName:"Fitness Exclusive", maxOcc:150, branch:"Main - QC", webcam:false, kioskTimeout:60,
      faceId:false, faceThreshold:0.5, tin:"000-123-456-000", address:"123 Sports Ave., Quezon City", vatRegistered:true,
      refReward:200, refDiscount:10},
    orSeq:1008,
    promos:[
      {code:"WELCOME10",type:"%",value:10,cats:["Membership"],active:true,used:3,max:100,expires:addDays(60),note:"New members"},
      {code:"COURT50",type:"fixed",value:50,cats:["Courts"],active:true,used:1,max:0,expires:"",note:"Court rental discount"},
      {code:"STUDENT20",type:"%",value:20,cats:["Membership","Day Pass"],active:true,used:0,max:0,expires:"",note:"With valid student ID"}
    ],
    packageTypes:[
      {name:"Personal Training 10",sessions:10,price:5000,days:90},{name:"Personal Training 20",sessions:20,price:9000,days:180},
      {name:"Boxing 5",sessions:5,price:2000,days:60},{name:"Basketball Clinic 8",sessions:8,price:2400,days:60}
    ],
    branches:[{name:"Main - QC",addr:"Quezon City"},{name:"Makati",addr:"Makati City"},{name:"Cebu",addr:"Cebu City"}],
    devices:[
      {id:"D1",name:"Main Turnstile",area:"Gym",type:"Turnstile",main:true,online:true,key:randKey()},
      {id:"D4",name:"Boxing Area Door",area:"Boxing Area",type:"Door lock",online:true,key:randKey()},
      {id:"D5",name:"Court Area Door",area:"Courts",type:"Door lock",online:true,key:randKey()},
      {id:"D6",name:"Locker Bank",area:"Lockers",type:"Smart locker",online:false,key:randKey()}
    ],
    members, trainers, logs, inside:{}, passes:[], sms:[],
    users:[{username:"owner",name:"Owner",role:"Owner"},{username:"frontdesk",name:"Front Desk 1",role:"FrontDesk"},{username:"coach",name:"Coach Mark",role:"Trainer"}],
    classes:[
      {id:"C1",name:"HIIT",trainer:"Coach Mark",time:"Mon/Wed 6:00 AM",cap:20,booked:["M001","M005"],wait:[]},
      {id:"C2",name:"Yoga",trainer:"Coach Ana",time:"Tue/Thu 9:00 AM",cap:3,booked:["M002","M006","M008"],wait:["M001"]},
      {id:"C3",name:"Boxing",trainer:"Coach Jun",time:"Daily 5:00 PM",cap:12,booked:["M005"],wait:[]},
      {id:"C4",name:"Basketball Clinic",trainer:"Coach Ray",time:"Sat 8:00 AM",cap:15,booked:["M003","M007"],wait:[]},
      {id:"C5",name:"Volleyball Training",trainer:"Coach Liza",time:"Sun 7:00 AM",cap:14,booked:["M004"],wait:[]}
    ],
    courts:[
      {name:"Basketball Court",price:400,slots:{"8AM":"M003","6PM":"M007"}},
      {name:"Badminton Court 1",price:250,slots:{"10AM":"M002"}},
      {name:"Badminton Court 2",price:250,slots:{}},
      {name:"Tennis Court",price:350,slots:{"4PM":"M008"}},
      {name:"Volleyball Court",price:350,slots:{}}
    ],
    lockers:Array.from({length:24},(_,i)=>({no:i+1,member:[2,5,9].includes(i)?members[i%members.length].id:""})),
    equipment:[
      {item:"Basketball",total:10,fee:50,out:[]},{item:"Badminton Racket",total:12,fee:40,out:[]},
      {item:"Tennis Racket",total:6,fee:60,out:[]},{item:"Volleyball",total:6,fee:50,out:[]},
      {item:"Boxing Gloves",total:8,fee:30,out:[]},{item:"Towel",total:30,fee:20,out:[]}
    ],
    tournaments:[
      {id:"TR1",name:"Inter-Barangay Basketball League",sport:"Basketball",
       teams:[{name:"Team Alpha",w:3,l:1},{name:"Team Bravo",w:2,l:2},{name:"Team Charlie",w:2,l:2},{name:"Team Delta",w:1,l:3}],
       matches:[{a:"Team Alpha",b:"Team Bravo",date:addDays(2),score:""},{a:"Team Charlie",b:"Team Delta",date:addDays(3),score:""}]},
      {id:"TR2",name:"Badminton Open Doubles",sport:"Badminton",
       teams:[{name:"Smash Bros",w:2,l:0},{name:"Net Ninjas",w:1,l:1},{name:"Shuttle Kings",w:0,l:2}],
       matches:[{a:"Smash Bros",b:"Net Ninjas",date:addDays(5),score:""}]}
    ],
    products:[
      {name:"Bottled Water",price:25,stock:80,icon:"💧"},{name:"Sports Drink",price:45,stock:40,icon:"🥤"},
      {name:"Protein Shake",price:120,stock:15,icon:"🥛"},{name:"Protein Bar",price:80,stock:4,icon:"🍫"},
      {name:"Gym Towel",price:250,stock:20,icon:"🧺"},{name:"Fitness Exclusive Shirt",price:450,stock:12,icon:"👕"},
      {name:"Shaker Bottle",price:300,stock:3,icon:"🧴"},{name:"Pre-workout",price:1800,stock:6,icon:"⚡"}
    ],
    payments:[
      pay(0,"Juan Dela Cruz","Monthly Plan","Membership",1500,"GCash"),
      pay(0,"Maria Santos","Court Rental","Courts",250,"Cash"),
      pay(-1,"Pedro Reyes","Quarterly Plan","Membership",4000,"Card","Pending"),
      pay(-1,"Walk-in Guest","Day Pass","Day Pass",150,"Cash"),
      pay(-2,"Carlo Mendoza","Protein Shake x2","POS",240,"Wallet"),
      pay(-3,"Liza Garcia","Personal Training","Training",3000,"Maya","Failed"),
      pay(-4,"Ana Villanueva","Monthly Plan","Membership",1500,"Maya"),
      pay(-5,"Jasmine Cruz","Annual Plan","Membership",15000,"Card")
    ]
  };
}
function pad3(n){return String(n).padStart(3,"0");}
function makeRefCode(name,i){ return (String(name).split(" ")[0].toUpperCase().replace(/[^A-Z]/g,"").slice(0,5)||"FE")+(10+((i*37)%90)); }
function randKey(){ let s="dk_"; for(let i=0;i<24;i++) s+="abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random()*32)]; return s; }

// ===== Storage & central sync =====
var db = null;              // "var" so the server can reach it
var SERVER = false;         // true when connected to the central server
var ME = null;              // logged-in staff account (server mode)
var TOKEN = null;
const CLIENT_ID = Math.random().toString(36).slice(2);
const SCREEN = IS_NODE ? "Server" : /kiosk/.test(location.pathname) ? (/gate/.test(location.search)?"Gate":"Kiosk") : /member/.test(location.pathname) ? "Member app" : "Admin";
let synced = {};
function snapshot(){ synced={}; for(const k in db) synced[k]=JSON.stringify(db[k]); }
// give every product an id so edits/renames are tracked correctly
function migrate(d){ (d.products||[]).forEach((p,i)=>{ if(!p.id) p.id="PR"+String(i+1).padStart(3,"0"); if(!p.cat) p.cat="Others"; }); return d; }

// ===== Audit trail =====
// Every change is described automatically (added / edited / deleted) and stored with who, when and which screen.
var auditNotes=[];
function note(action,detail){ auditNotes.push({action,detail:String(detail??"")}); }
const AUDIT_SKIP=["logs","inside","orSeq","sms","auditLog"];
const COLL_LABEL={members:"member",trainers:"trainer",products:"product",payments:"payment",promos:"promo code",packageTypes:"package type",classes:"class",
  courts:"court",lockers:"locker",equipment:"equipment",tournaments:"tournament",branches:"branch",devices:"device",users:"staff user",passes:"day pass",settings:"settings"};
function itemKey(x){ return x&&typeof x==="object"?(x.or||x.id||x.code||x.username||(x.no!=null?"#"+x.no:null)||x.name||x.item):x; }
function itemLabel(k,x){ if(!x||typeof x!=="object") return String(x); if(x.or) return `${x.or} · ${x.name} · ${x.item} · ${money(x.amount)}`; if(k==="lockers") return "Locker #"+x.no; return x.name||x.code||x.item||x.username||x.id||""; }
function shortVal(v){ if(v==null||v==="") return "(blank)"; if(typeof v==="object") return Array.isArray(v)?v.length+" item(s)":"..."; const s=String(v); return s.length>40?s.slice(0,40)+"...":s; }
function fieldDiff(a,b){
  const out=[];
  for(const f of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){
    const x=a?a[f]:undefined, y=b?b[f]:undefined; if(JSON.stringify(x)===JSON.stringify(y)) continue;
    if(["photo","face","snap"].includes(f)) out.push(f+(y?" updated":" removed"));
    else if(f==="pin") out.push("PIN changed");
    else if(f==="key") out.push("device key regenerated");
    else if(Array.isArray(x)||Array.isArray(y)) out.push(`${f}: ${shortVal(x)} → ${shortVal(y)}`);
    else if(typeof (x??y)==="object") out.push(f+" updated");
    else out.push(`${f}: ${shortVal(x)} → ${shortVal(y)}`);
  }
  return out;
}
function describeChanges(k,a,b){
  if(AUDIT_SKIP.includes(k)) return [];
  const L=COLL_LABEL[k]||k, res=[];
  if(Array.isArray(a)&&Array.isArray(b)){
    const ma=new Map(a.map(x=>[itemKey(x),x])), mb=new Map(b.map(x=>[itemKey(x),x]));
    for(const [id,x] of mb) if(!ma.has(id)) res.push({action:"Added "+L,detail:itemLabel(k,x)});
    for(const [id,x] of ma) if(!mb.has(id)) res.push({action:"Deleted "+L,detail:itemLabel(k,x)});
    for(const [id,x] of mb){ const o=ma.get(id); if(o!==undefined&&JSON.stringify(o)!==JSON.stringify(x)) res.push({action:"Edited "+L,detail:itemLabel(k,x)+(typeof x==="object"?" · "+fieldDiff(o,x).join(", "):"")}); }
    return res.slice(0,60);
  }
  if(a&&b&&typeof a==="object"){ const d=fieldDiff(a,b); return d.length?[{action:"Changed "+L,detail:d.join(", ")}]:[]; }
  return [{action:"Changed "+L,detail:`${shortVal(a)} → ${shortVal(b)}`}];
}
function localAudit(action,detail){ db.auditLog=db.auditLog||[]; db.auditLog.unshift({ts:Date.now(),user:ME?`${ME.name} (${ME.role})`:"Demo user",action,detail:String(detail||""),screen:SCREEN}); if(db.auditLog.length>3000) db.auditLog.length=3000; }
function API(path,opt={}){
  return fetch(path,{...opt,headers:{"Content-Type":"application/json","X-Client":CLIENT_ID,"X-Screen":SCREEN,...(TOKEN?{Authorization:"Bearer "+TOKEN}:{}),...(opt.headers||{})}})
    .then(async r=>{ const j=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(j.error||r.statusText),{status:r.status}); return j; });
}
function applyState(state){ for(const k in state){ db[k]=state[k]; synced[k]=JSON.stringify(state[k]); } }
function loadLocal(){ try{ const s=localStorage.getItem(DB_KEY); if(s) return JSON.parse(s);}catch(e){} const d=seed(); localStorage.setItem(DB_KEY,JSON.stringify(d)); return d; }
async function boot(){
  if(location.protocol.startsWith("http")){
    TOKEN=localStorage.getItem("fe_token");
    try{
      const s=await API("/api/state"); db=migrate(s.state); ME=s.me; SERVER=true; snapshot(); listen(); return;
    }catch(e){
      if(e.status===401){ localStorage.removeItem("fe_token"); location.href="login.html?next="+encodeURIComponent(location.pathname+location.search); return new Promise(()=>{}); }
      console.warn("Central server not reachable, using offline demo mode",e);
    }
  }
  db=migrate(loadLocal()); snapshot();
  // offline demo also needs a staff login
  try{ ME=JSON.parse(localStorage.getItem("fe_local_user")||"null"); }catch(e){ ME=null; }
  if(!ME){ location.href="login.html?next="+encodeURIComponent(location.pathname+location.search); return new Promise(()=>{}); }
  window.addEventListener("storage", e => { if(e.key===DB_KEY && e.newValue){ db=JSON.parse(e.newValue); snapshot(); if(window.onDbChange) window.onDbChange(); } });
}
function listen(){
  const es=new EventSource("/api/events?token="+encodeURIComponent(TOKEN));
  es.onmessage=async e=>{
    const m=JSON.parse(e.data); if(m.from===CLIENT_ID||!m.keys||!m.keys.length) return;
    try{ const s=await API("/api/state?keys="+m.keys.join(",")); applyState(s.state); if(window.onDbChange) window.onDbChange(); }catch(err){ console.warn(err); }
  };
  es.onerror=()=>{ const b=document.getElementById("syncDot"); if(b) b.className="sync off"; };
  es.onopen=()=>{ const b=document.getElementById("syncDot"); if(b) b.className="sync on"; };
}
function save(){
  if(IS_NODE) return;                       // server persists by itself
  if(!SERVER){
    for(const n of auditNotes.splice(0)) localAudit(n.action,n.detail);
    for(const k in db){ if(k==="auditLog") continue; const s=JSON.stringify(db[k]); if(s!==synced[k]){ let old=null; try{ old=synced[k]?JSON.parse(synced[k]):null; }catch(e){} for(const c of describeChanges(k,old,db[k])) localAudit(c.action,c.detail); synced[k]=s; } }
    try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){ alert("Storage full: " + e.message); } return;
  }
  const changes={};
  for(const k in db){ const s=JSON.stringify(db[k]); if(s!==synced[k]){ changes[k]=db[k]; synced[k]=s; } }
  const notes=auditNotes.splice(0);
  if(Object.keys(changes).length||notes.length) API("/api/state",{method:"PUT",body:JSON.stringify({changes,notes})}).catch(e=>alert("Sync failed: "+e.message));
}
function resetDb(){ if(SERVER){ API("/api/reset",{method:"POST"}).then(()=>location.reload()).catch(e=>alert(e.message)); return; } db=seed(); save(); }
// Access decisions go through the central server so every gate/branch sees the same "inside" list.
async function tap(uid,deviceId,mode="auto",snap=""){
  if(!SERVER){ const r=processTap(uid,deviceId,mode,snap); localAudit(String(uid).toUpperCase().startsWith("FACE:")?"Face tap":"RFID tap",`${r.who?r.who.name:uid} · ${r.action} · ${r.device.name}${r.ok?"":" · "+r.msg}`); save(); return r; }
  const r=await API("/api/tap",{method:"POST",body:JSON.stringify({uid,device:deviceId,mode,snap})});
  applyState(r.state); return r.result;
}
function logoutStaff(){
  if(SERVER) return API("/api/logout",{method:"POST"}).finally(()=>{ localStorage.removeItem("fe_token"); location.href="login.html"; });
  localAudit("Logout",""); save(); localStorage.removeItem("fe_local_user"); location.href="login.html";
}

// ===== helpers =====
const memberById = id => db.members.find(m=>m.id===id);
function memberStatus(m){
  if(m.frozen) return "Frozen";
  const d=daysUntil(m.exp);
  if(d<0) return "Expired";
  if(d<=7) return "Expiring";
  return "Active";
}
const STATUS_CLS = {Active:"ok",Expiring:"warn",Expired:"bad",Frozen:"info"};
function avatar(p,size=40){
  if(!p) return `<span class="av" style="width:${size}px;height:${size}px;background:#94a3b8;font-size:${size*.4}px">?</span>`;
  if(p.photo) return `<img class="av" src="${p.photo}" style="width:${size}px;height:${size}px">`;
  const ini=p.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
  return `<span class="av" style="width:${size}px;height:${size}px;background:${p.color||"#64748b"};font-size:${size*.38}px">${esc(ini)}</span>`;
}
function insideCount(){ return Object.keys(db.inside).length; }
var lastReceipt=null;
// Each screen remembers its own branch (multi-branch). The server uses the default branch.
function currentBranch(){ try{ if(!IS_NODE&&localStorage.getItem("fe_branch")) return localStorage.getItem("fe_branch"); }catch(e){} return db.settings.branch; }
// Every payment gets an Official Receipt number (sequential) for BIR.
function addPayment(name,item,cat,amount,method,status="Paid",extra={}){
  db.orSeq=(db.orSeq||1000)+1;
  const p={or:"OR-"+String(db.orSeq).padStart(6,"0"),ts:Date.now(),name,item,cat,amount:Number(amount),method,status,branch:currentBranch(),discount:0,...extra};
  db.payments.unshift(p); lastReceipt=p; return p;
}
function sendSms(to,msg){ db.sms.unshift({ts:Date.now(),to,msg}); }
function currentSlot(){ const h=new Date().getHours(); const s=h-(h%2); if(s<6||s>20) return null; const h12=s%12||12; return h12+(s<12?"AM":"PM"); }
function readPhoto(file,cb){ // resize to keep localStorage small
  const r=new FileReader(); r.onload=()=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement("canvas"); const S=140; c.width=S;c.height=S; const k=Math.min(img.width,img.height); c.getContext("2d").drawImage(img,(img.width-k)/2,(img.height-k)/2,k,k,0,0,S,S); cb(c.toDataURL("image/jpeg",.7)); }; img.src=r.result; }; r.readAsDataURL(file);
}

// ===== Core RFID access decision =====
// deviceId: which reader was tapped. mode: "auto" | "in" | "out" (only used by the main turnstile).
function processTap(uid, deviceId, mode="auto", snap=""){
  uid=String(uid).trim().toUpperCase();
  const dev=db.devices.find(d=>d.id===deviceId)||db.devices[0];
  const viaFace=uid.startsWith("FACE:");
  let who=viaFace?db.members.find(m=>m.id.toUpperCase()===uid.slice(5)):db.members.find(m=>m.rfid&&m.rfid.toUpperCase()===uid), kind="member";
  if(!who){ who=db.trainers.find(t=>t.rfid.toUpperCase()===uid); kind="trainer"; }
  if(!who){ who=db.passes.find(p=>p.rfid.toUpperCase()===uid); kind="pass"; }
  const key = who ? kind+":"+(who.id||who.code) : "";
  const result=(ok,msg,action,dur="")=>{
    db.logs.unshift({ts:Date.now(),name:who?who.name:"Unknown card",uid,mid:kind==="member"&&who?who.id:"",kind,method:viaFace?"Face":"RFID",action:ok?action:"Denied",reason:ok?"":msg,device:dev.name,dur,snap});
    if(db.logs.length>800) db.logs.length=800;
    save();
    return {ok,msg,action:ok?action:"Denied",who,kind,device:dev};
  };
  if(!who) return result(false,viaFace?"Face not registered":`Unknown card (${uid})`);

  // validity
  if(kind==="member"){
    const st=memberStatus(who);
    if(st==="Frozen") return result(false,"Membership is frozen");
    if(st==="Expired") return result(false,"Membership expired, please renew");
  }
  if(kind==="pass" && Date.now()>who.validUntil) return result(false,"Pass has expired");

  // area permission
  const areas = kind==="trainer" ? ["Gym","Courts","Boxing Area","Lockers"]
              : kind==="pass" ? (PASS_TYPES[who.type]||{areas:["Gym"]}).areas
              : PLANS[who.plan].areas.concat(["Lockers"]);
  if(!dev.main){
    if(!db.inside[key]) return result(false,"Please Time In at the main turnstile first");
    if(dev.area==="Courts" && !areas.includes("Courts")){
      const slot=currentSlot(); const booked=slot && db.courts.some(c=>c.slots[slot]===who.id);
      if(!booked) return result(false,"No court booking for this time");
      return result(true,`Court booking ${slot} - door open`,"Door Open");
    }
    if(dev.area==="Lockers"){
      const l=db.lockers.find(x=>x.member===who.id);
      if(kind==="member" && !l) return result(false,"No locker assigned");
      return result(true,l?`Locker #${l.no} unlocked`:"Locker unlocked","Door Open");
    }
    if(!areas.includes(dev.area)) return result(false,`Plan has no access to ${dev.area}`);
    return result(true,`${dev.area} door open`,"Door Open");
  }

  // main turnstile: Time In / Time Out with anti-passback
  const isIn=!!db.inside[key];
  const wantOut = mode==="out" || (mode==="auto" && isIn);
  if(wantOut){
    if(!isIn) return result(false,"No Time In record (anti-passback)");
    const mins=Math.max(1,Math.round((Date.now()-db.inside[key])/60000));
    delete db.inside[key];
    if(kind==="trainer") who.hours=Math.round((who.hours+mins/60)*100)/100;
    if(kind==="member" && who.parent) sendSms(who.parent,`${db.settings.gymName}: ${who.name} timed OUT at ${fmtTime(Date.now())}.`);
    return result(true,"Time Out - see you next time!","Time Out",`${Math.floor(mins/60)}h ${mins%60}m`);
  }
  if(isIn) return result(false,"Already timed in (anti-passback)");
  if(kind!=="trainer" && insideCount()>=db.settings.maxOcc) return result(false,`Gym is full (max ${db.settings.maxOcc})`);
  db.inside[key]=Date.now();
  let msg="Welcome! Time In recorded";
  if(kind==="member"){
    who.lastVisit=today();
    if(who.parent) sendSms(who.parent,`${db.settings.gymName}: ${who.name} timed IN at ${fmtTime(Date.now())}.`);
    const d=daysUntil(who.exp);
    if(d<=7){ msg+=` - membership expires in ${d} day(s)`; sendSms(who.phone,`${db.settings.gymName}: Hi ${who.name}, your ${who.plan} plan expires on ${who.exp}. Renew at the kiosk or front desk.`); }
  }
  return result(true,msg,"Time In");
}

function renewMember(m,method,amount,extra={}){
  const p=PLANS[m.plan]; const base=daysUntil(m.exp)>0?m.exp:today();
  m.exp=addDays(p.days,base+"T00:00:00"); m.frozen=false;
  addPayment(m.name,m.plan+" Plan","Membership",amount??p.price,method,"Paid",extra);
  sendSms(m.phone,`${db.settings.gymName}: Payment received. Your ${m.plan} plan is valid until ${m.exp}. Salamat!`);
  save();
}
function createPass(name,type,method,amount,extra={}){
  const t=PASS_TYPES[type]; const end=new Date();
  if(t.hours) end.setTime(Date.now()+t.hours*3600000); else end.setHours(23,59,59);
  const p={code:"P"+Date.now().toString().slice(-6), id:"", rfid:"TMP"+Math.floor(100000+Math.random()*900000), name:name||"Walk-in Guest", type, validUntil:end.getTime(), color:"#64748b", photo:""};
  p.id=p.code; db.passes.unshift(p);
  addPayment(p.name,type,"Day Pass",amount??t.price,method,"Paid",extra); save(); return p;
}

// ===== Promo codes =====
function applyPromo(code,amount,cat){
  code=String(code||"").trim().toUpperCase(); if(!code) return {amount,discount:0};
  const p=db.promos.find(x=>x.code===code);
  if(!p||!p.active) return {error:"Invalid promo code"};
  if(p.cats&&p.cats.length&&!p.cats.includes(cat)) return {error:"Promo is not valid for "+cat};
  if(p.expires&&daysUntil(p.expires)<0) return {error:"Promo has expired"};
  if(p.max&&p.used>=p.max) return {error:"Promo is fully used"};
  const disc=p.type==="%"?Math.round(amount*p.value/100):Math.min(amount,p.value);
  return {amount:amount-disc,discount:disc,code:p.code};
}
function usePromo(code){ const p=db.promos.find(x=>x.code===code); if(p) p.used=(p.used||0)+1; }

// ===== Referral program =====
function findReferrer(code){ code=String(code||"").trim().toUpperCase(); return code?db.members.find(m=>m.refCode===code):null; }
function rewardReferrer(ref,newName){
  ref.wallet+=Number(db.settings.refReward||0);
  sendSms(ref.phone,`${db.settings.gymName}: Salamat sa referral! ${newName} joined. ${money(db.settings.refReward)} was added to your wallet.`);
}
function newMember(f){
  const i=db.members.length, id="M"+pad3(i+1);
  const m={id,rfid:"",name:f.name,plan:f.plan,sport:f.sport||"Gym",exp:addDays(PLANS[f.plan].days),frozen:false,phone:f.phone||"",parent:f.parent||"",
    branch:currentBranch(),color:COLORS[i%COLORS.length],photo:f.photo||"",wallet:0,height:165,workout:"",progress:[],lastVisit:today(),
    email:f.email||"",pin:f.pin||String(f.phone||"0000").slice(-4),refCode:makeRefCode(f.name,i),referredBy:f.referredBy||"",face:null,sessions:[]};
  db.members.push(m); return m;
}

// ===== Training packages (PT sessions) =====
function buyPackage(m,idx,method,amount,extra={}){
  const t=db.packageTypes[idx];
  m.sessions=m.sessions||[]; m.sessions.push({name:t.name,left:t.sessions,total:t.sessions,trainer:"",exp:addDays(t.days)});
  return addPayment(m.name,t.name+" package","Training",amount??t.price,method,"Paid",extra);
}
function useSession(m,i,trainer){
  const s=m.sessions[i]; if(!s||s.left<=0) return false;
  s.left--; db.logs.unshift({ts:Date.now(),name:m.name,uid:m.rfid,mid:m.id,kind:"member",method:"Staff",action:"Session",reason:"",device:trainer||"Trainer",dur:`${s.name}: ${s.left}/${s.total} left`,snap:""});
  return true;
}

// ===== Receipts & BIR =====
function vatOf(amount){ if(!db.settings.vatRegistered) return {vatable:amount,vat:0}; const vatable=Math.round(amount/1.12*100)/100; return {vatable,vat:Math.round((amount-vatable)*100)/100}; }
function receiptHtml(p){
  const s=db.settings, v=vatOf(p.amount);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${p.or}</title><style>
  body{font-family:ui-monospace,Consolas,monospace;width:300px;margin:20px auto;color:#000;font-size:12.5px}
  h1{font-size:17px;text-align:center;margin:0}.c{text-align:center}.r{display:flex;justify-content:space-between}
  hr{border:none;border-top:1px dashed #000;margin:8px 0}.b{font-weight:700;font-size:15px}
  @media print{button{display:none}}</style></head><body>
  <h1>${esc(s.gymName).toUpperCase()}</h1><div class="c">${esc(s.address)}<br>${esc(p.branch||s.branch)}<br>${s.vatRegistered?"VAT REG":"NON-VAT REG"} TIN ${esc(s.tin)}</div><hr>
  <div class="c b">OFFICIAL RECEIPT</div><div class="r"><span>OR No.</span><span>${p.or}</span></div>
  <div class="r"><span>Date</span><span>${new Date(p.ts).toLocaleString()}</span></div><div class="r"><span>Customer</span><span>${esc(p.name)}</span></div><hr>
  <div>${esc(p.item)}</div>${p.discount?`<div class="r"><span>Discount ${esc(p.promo||"")}</span><span>-${money(p.discount)}</span></div>`:""}
  <hr><div class="r b"><span>TOTAL</span><span>${money(p.amount)}</span></div>
  <div class="r"><span>VATable sales</span><span>${money(v.vatable)}</span></div><div class="r"><span>VAT 12%</span><span>${money(v.vat)}</span></div>
  <div class="r"><span>Paid via</span><span>${esc(p.method)}</span></div><hr><div class="c">Thank you! Salamat po!</div>
  <p class="c"><button onclick="print()">Print</button></p></body></html>`;
}
function printReceipt(p){ if(!p) return; const w=window.open("","_blank","width=380,height=640"); w.document.write(receiptHtml(p)); w.document.close(); }

// USB RFID readers type the UID fast then press Enter. Capture that anywhere on the page.
function attachReader(cb){
  let buf="", last=0;
  document.addEventListener("keydown",e=>{
    const t=e.target, typing=(t.tagName==="INPUT"||t.tagName==="TEXTAREA") && !t.classList.contains("rfid-input");
    if(typing) return;
    const now=Date.now(); if(now-last>60) buf=""; last=now;
    if(e.key==="Enter"){ if(buf.length>=6){ e.preventDefault(); cb(buf); } buf=""; }
    else if(/^[0-9a-zA-Z]$/.test(e.key)) buf+=e.key;
  });
}

// ===== Shared line-icon library (used by admin, kiosk and gate) =====
const ICONS={
  home:'<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  rfid:'<path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="16" r="1.5"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userplus:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  ticket:'<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2.5"/>',
  cart:'<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  whistle:'<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  court:'<rect x="2" y="5" width="20" height="14" rx="1.5"/><path d="M12 5v14"/><circle cx="12" cy="12" r="3"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock:'<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 7.6-1.8"/>',
  box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  trophy:'<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  building:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  logout:'<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h15V8H5"/><circle cx="16" cy="14" r="1.2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  snow:'<path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  dumbbell:'<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  ball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
  racket:'<circle cx="14.5" cy="9.5" r="6"/><path d="M10.3 13.7 4 20M11 7l7 5M12 12.5 17.5 7"/>',
  drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  bottle:'<path d="M10 2h4v3l2 3v13H8V8l2-3zM8 12h8"/>',
  cup:'<path d="M6 4h12l-1.5 17h-9zM5.5 9h13"/>',
  bar:'<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M8 8v8M13 8v8"/>',
  shirt:'<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  towel:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 15h14M5 18h14"/>',
  zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  door:'<path d="M4 21h16M6 21V3h12v18"/><circle cx="14.5" cy="12" r="1"/>',
  back:'<path d="M15 6l-6 6 6 6"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
  cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  crown:'<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>',
  tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  alert:'<path d="M12 3 2 20h20zM12 10v4M12 17v.01"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  printer:'<path d="M6 9V3h12v6M6 18H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
  monitor:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  scan:'<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10"/>',
  cookie:'<path d="M21 12a9 9 0 1 1-9.5-9 3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5A3 3 0 0 0 21 12z"/><path d="M8.5 8.5v.01M16 15.5v.01M12 12v.01M11 17v.01M7 14v.01"/>',
  snack:'<path d="M7 3h10l-1.5 3L17 18l-1 3H8l-1-3 1.5-12z"/><path d="M9.5 11h5M10 14h4"/>',
  apple:'<path d="M12 7.5c-2-2-7.5-1.5-7.5 4 0 4.5 3 9 5.2 9 1 0 1.3-.6 2.3-.6s1.3.6 2.3.6c2.2 0 5.2-4.5 5.2-9 0-5.5-5.5-6-7.5-4z"/><path d="M12 7.5c0-2 1-4 3-4.5"/>',
  coffee:'<path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5v2.5M12 2.5v2.5"/>',
  pill:'<path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  jar:'<rect x="5" y="8" width="14" height="13" rx="2.5"/><rect x="6.5" y="3" width="11" height="5" rx="1.2"/><path d="M9 13h6M9 16.5h6"/>',
  flame:'<path d="M12 22a7 7 0 0 0 7-7c0-4.5-4-7-4.5-11.5C11 6 9 9 9 11.5 8 10.5 7.5 9.5 7.5 8.5 6 10.5 5 12.5 5 15a7 7 0 0 0 7 7z"/>',
  cap:'<path d="M3 16.5a9 7.5 0 0 1 18 0z"/><path d="M21 16.5h1.5M12 9v.01"/>',
  sock:'<path d="M8 2h7.5v10.5l-5 7.5a3.3 3.3 0 0 1-5.6-3.4L8 11z"/><path d="M8 6.5h7.5"/>',
  bag:'<path d="M5 8h14l-1.2 13H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  glove:'<path d="M7 21v-3.5C5 16.5 4 14.5 4 12V8a2.5 2.5 0 0 1 5 0V6a3 3 0 0 1 6 0v5c2.5 0 4 1.7 4 4 0 3-2.5 6-5.5 6z"/><path d="M7 17.5h8.5"/>',
  band:'<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="5" ry="2.2"/>',
  gift:'<rect x="3" y="8" width="18" height="4.5" rx="1"/><path d="M5 12.5V21h14v-8.5M12 8v13M12 8S10.5 3 8 3.5 6.5 8 12 8zm0 0s1.5-5 4-4.5S17.5 8 12 8z"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  heart:'<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'
};
// Icons the user can pick for products
const PRODUCT_ICONS=["drop","bottle","cup","coffee","bar","cookie","snack","apple","pill","jar","zap","flame","shirt","cap","sock","towel","bag","glove","dumbbell","band","ball","racket","gift","star","heart","box","tag"];
const PRODUCT_CATS=["Drinks","Food","Supplements","Apparel","Gear","Others"];
function ic(n,size=20,sw=1.8){ return `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||ICONS.box}</svg>`; }
const icon=n=>ic(n,18);
function cleanName(s){ return String(s).replace(/^[^A-Za-z0-9]+/,"").trim(); }
function courtIcon(n){ n=n.toLowerCase(); return n.includes("badminton")||n.includes("tennis")?"racket":n.includes("ball")?"ball":"court"; }
// Picks the product's chosen icon, or guesses one from the name
function productIcon(p){
  if(p.iconName&&ICONS[p.iconName]) return p.iconName;
  const n=String(p.name||"").toLowerCase(), has=(...w)=>w.some(x=>n.includes(x));
  return has("water")?"drop": has("shaker","drink","gatorade","pocari","juice","soda")?"bottle": has("coffee","tea")?"coffee": has("shake","smoothie")?"cup":
    has("bar")?"bar": has("snack","chips","nuts")?"snack": has("cookie","biscuit","cracker")?"cookie": has("banana","apple","fruit","salad")?"apple":
    has("vitamin","capsule","tablet","pill","creatine")?"pill": has("whey","protein","gainer","tub")?"jar": has("pre","energy")?"zap": has("burn","fat","cutter")?"flame":
    has("shirt","tee","jersey","top")?"shirt": has("cap","hat")?"cap": has("sock")?"sock": has("towel")?"towel": has("bag")?"bag": has("glove","wrap")?"glove":
    has("band","strap")?"band": has("ball")?"ball": has("racket","shuttle")?"racket": has("dumbbell","weight")?"dumbbell": "tag";
}
// Product picture: uploaded photo, otherwise the icon
function productThumb(p,size=26){ return p.photo?`<img class="pimg" src="${p.photo}" alt="">`:`<div class="ti">${ic(productIcon(p),size)}</div>`; }
