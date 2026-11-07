// ===== Admin dashboard =====
// [id, icon, label, group]
const PAGES=[
  ["dash","home","Dashboard","Overview"],["reports","chart","Reports","Overview"],
  ["access","rfid","RFID Access","Front Desk"],["members","users","Members","Front Desk"],["passes","ticket","Day Pass","Front Desk"],
  ["pos","cart","POS","Front Desk"],["payments","card","Payments","Front Desk"],
  ["classes","calendar","Classes","Programs"],["trainers","whistle","Trainers","Programs"],["progress","trend","Progress","Programs"],
  ["courts","court","Courts","Facilities"],["lockers","lock","Lockers","Facilities"],["equipment","box","Equipment","Facilities"],["tournaments","trophy","Tournaments","Facilities"],
  ["notifications","bell","Notifications","System"],["branches","building","Branches","System"],["users","shield","Users & Roles","System"],["settings","gear","Settings","System"],
  ["packages","box","Packages","Programs"],["promos","tag","Promos & Referrals","Sales"],["bir","printer","Receipts & BIR","Reports"],["devices","rfid","Devices & System","System"],
  ["audit","list","Audit Trail","System"]
];
// Sidebar: 8 main items, related pages become tabs inside
const NAV=[
  {label:"Dashboard",icon:"home",pages:["dash"]},
  {label:"RFID Access",icon:"rfid",pages:["access"]},
  {label:"Members",icon:"users",pages:["members","passes"]},
  {label:"Programs",icon:"calendar",pages:["classes","trainers","packages","progress"]},
  {label:"Facilities",icon:"court",pages:["courts","lockers","equipment","tournaments"]},
  {label:"Sales",icon:"cart",pages:["pos","payments","promos"]},
  {label:"Reports",icon:"chart",pages:["reports","bir"]},
  {label:"Settings",icon:"gear",pages:["settings","audit","devices","users","branches","notifications"]}
];
const ROLES={
  Owner:PAGES.map(p=>p[0]),
  FrontDesk:["dash","access","members","passes","classes","packages","courts","lockers","equipment","pos","payments"],
  Trainer:["dash","classes","trainers","packages","progress","tournaments"]
};
let page="dash", role="Owner", lastTap=null, enroll=null, cart=[], posCustomer="", progMember="M001", memberFilter="", gateDev="D1", gateMode="auto", repBranch="All";

const $=id=>document.getElementById(id);
function toast(msg){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(toast.t); toast.t=setTimeout(()=>t.style.display="none",3500); }
function go(p){ page=p; render(); animate(); }
// page transition + count-up numbers
function animate(){
  const c=$("content"); c.classList.remove("anim"); void c.offsetWidth; c.classList.add("anim");
  c.querySelectorAll(".card .value").forEach(el=>{
    const txt=el.textContent, m=txt.match(/[\d,]+(\.\d+)?/); if(!m) return;
    const target=parseFloat(m[0].replace(/,/g,"")); if(!target) return;
    const t0=performance.now(), D=700;
    const step=t=>{ const k=Math.min(1,(t-t0)/D), e=1-Math.pow(1-k,3);
      el.textContent=txt.replace(m[0],Math.round(target*e).toLocaleString()); if(k<1) requestAnimationFrame(step); else el.textContent=txt; };
    requestAnimationFrame(step);
  });
}
// ripple on buttons
document.addEventListener("pointerdown",e=>{
  const b=e.target.closest(".btn"); if(!b) return;
  const r=b.getBoundingClientRect(), s=document.createElement("span");
  s.className="rp"; s.style.left=(e.clientX-r.left)+"px"; s.style.top=(e.clientY-r.top)+"px";
  b.appendChild(s); setTimeout(()=>s.remove(),600);
});
// ---------- confirm dialog + delete helpers ----------
function ask(title,msg,okLabel="Delete",danger=true){
  return new Promise(done=>{
    const ov=document.createElement("div"); ov.className="modal";
    ov.innerHTML=`<div class="modal-box confirm"><div class="del-ico ${danger?"":"neutral"}">${ic(danger?"trash":"alert",26)}</div><h2>${esc(title)}</h2><p class="muted">${esc(msg)}</p>
      <div class="row"><button class="btn sec" data-a="0">Cancel</button><button class="btn ${danger?"danger-solid":""}" data-a="1">${esc(okLabel)}</button></div></div>`;
    ov.addEventListener("click",e=>{ const b=e.target.closest("[data-a]"); if(b||e.target===ov){ ov.remove(); done(!!(b&&b.dataset.a==="1")); } });
    document.body.appendChild(ov); setTimeout(()=>{ const b=ov.querySelector('[data-a="1"]'); if(b) b.focus(); },50);
  });
}
async function del(title,msg,fn){ if(!(await ask(title,msg))) return; if(fn()===false) return; save(); render(); toast("Deleted"); }
const delBtn=(onclick,title="Delete")=>`<button class="btn sm sec icon-btn danger" title="${title}" onclick="event.stopPropagation();${onclick}">${ic("trash",13)}</button>`;
const editBtn=(onclick,title="Edit")=>`<button class="btn sm sec icon-btn" title="${title}" onclick="event.stopPropagation();${onclick}">${ic("edit",13)}</button>`;

function delMember(id){ const m=memberById(id);
  del("Delete member?",`${m.name} (${m.id}) will be removed with their card, face, locker and bookings. Payments stay in the records.`,()=>{
    db.members=db.members.filter(x=>x.id!==id);
    db.lockers.forEach(l=>{ if(l.member===id) l.member=""; });
    db.classes.forEach(c=>{ c.booked=c.booked.filter(x=>x!==id); c.wait=c.wait.filter(x=>x!==id); });
    db.courts.forEach(c=>{ for(const t in c.slots) if(c.slots[t]===id) delete c.slots[t]; });
    db.equipment.forEach(e=>{ e.out=e.out.filter(o=>o.member!==id); });
    delete db.inside["member:"+id];
  }); }
function delPass(code){ const p=db.passes.find(x=>x.code===code); del("Delete day pass?",`${p.code} · ${p.name}`,()=>{ db.passes=db.passes.filter(x=>x.code!==code); delete db.inside["pass:"+code]; }); }
function delClass(id){ const c=db.classes.find(x=>x.id===id); del("Delete class?",`${c.name} · ${c.time}. ${c.booked.length} booking(s) will be cancelled.`,()=>{ db.classes=db.classes.filter(x=>x.id!==id); }); }
function addClass(){ const n=$("ncN").value.trim(), cap=Number($("ncC").value); if(!n||!cap) return toast("Enter class name and capacity");
  db.classes.push({id:"C"+Date.now().toString().slice(-6),name:n,trainer:$("ncT").value,time:$("ncS").value||"TBA",cap,booked:[],wait:[]}); save(); render(); toast("Class added"); }
function delTrainer(id){ const t=db.trainers.find(x=>x.id===id); del("Delete trainer?",`${t.name} · ${t.specialty}. Their RFID card will stop working.`,()=>{ db.trainers=db.trainers.filter(x=>x.id!==id); delete db.inside["trainer:"+id]; }); }
function addTrainer(){ const n=$("ntrN").value.trim(); if(!n) return toast("Enter trainer name"); const i=db.trainers.length;
  db.trainers.push({id:"T"+Date.now().toString().slice(-6),rfid:"",name:n,specialty:$("ntrS").value||"General",rate:Number($("ntrR").value)||300,hours:0,color:COLORS[i%COLORS.length],photo:""}); save(); render(); toast("Trainer added. Click Assign card to give an RFID card."); }
function delCourt(i){ const c=db.courts[i]; del("Delete court?",`${cleanName(c.name)}. All its bookings will be cancelled.`,()=>{ db.courts.splice(i,1); }); }
function addCourt(){ const n=$("nctN").value.trim(), p=Number($("nctP").value); if(!n||!p) return toast("Enter court name and price"); if(db.courts.some(c=>cleanName(c.name)===n)) return toast("Court already exists"); db.courts.push({name:n,price:p,slots:{}}); save(); render(); }
function addLocker(){ const no=Math.max(0,...db.lockers.map(l=>l.no))+1; db.lockers.push({no,member:""}); save(); render(); toast("Locker #"+no+" added"); }
function delLocker(i){ const l=db.lockers[i]; if(l.member) return toast("Release the locker first"); del("Delete locker?",`Locker #${l.no}`,()=>{ db.lockers.splice(i,1); }); }
function addEquip(){ const n=$("neqN").value.trim(), t=Number($("neqT").value); if(!n||!t) return toast("Enter item and quantity"); db.equipment.push({item:n,total:t,fee:Number($("neqF").value)||0,out:[]}); save(); render(); }
function delEquip(i){ const e=db.equipment[i]; if(e.out.length) return toast("Some are still borrowed. Return them first."); del("Delete equipment?",`${e.item} (${e.total} pcs)`,()=>{ db.equipment.splice(i,1); }); }
function delTournament(id){ const t=tour(id); del("Delete tournament?",`${t.name} with ${t.teams.length} team(s) and ${t.matches.length} match(es).`,()=>{ db.tournaments=db.tournaments.filter(x=>x.id!==id); }); }
function delTeam(id,name){ const t=tour(id); if(t.matches.some(m=>m.a===name||m.b===name)) return toast("Delete this team's matches first"); del("Remove team?",name,()=>{ t.teams=t.teams.filter(x=>x.name!==name); }); }
function delMatch(id,j){ const t=tour(id), mt=t.matches[j]; del("Delete match?",`${mt.a} vs ${mt.b} · ${mt.date}${mt.score?" · score "+mt.score+" (standings will be corrected)":""}`,()=>{
  if(mt.score){ const [x,y]=mt.score.split("-").map(Number); const w=t.teams.find(q=>q.name===(x>y?mt.a:mt.b)), l=t.teams.find(q=>q.name===(x>y?mt.b:mt.a)); if(w) w.w=Math.max(0,w.w-1); if(l) l.l=Math.max(0,l.l-1); }
  t.matches.splice(j,1); }); }
function delProg(id,j){ const m=memberById(id), p=m.progress[j]; del("Delete measurement?",`${m.name} · ${p.d} · ${p.w} kg`,()=>{ m.progress.splice(j,1); }); }
function delProduct(i){ const p=db.products[i]; del("Delete product?",`${p.name} · ${money(p.price)} · stock ${p.stock}. Past sales stay in the records.`,()=>{ db.products.splice(i,1); cart=[]; }); }
function delPkgType(i){ const t=db.packageTypes[i]; del("Delete package type?",`${t.name}. Members who already bought it keep their sessions.`,()=>{ db.packageTypes.splice(i,1); }); }
function delSession(id,i){ const m=memberById(id), s=m.sessions[i]; del("Remove package from member?",`${m.name} · ${s.name} · ${s.left} session(s) left`,()=>{ m.sessions.splice(i,1); }); }
function delPromo(i){ const p=db.promos[i]; del("Delete promo code?",`${p.code} · used ${p.used} time(s)`,()=>{ db.promos.splice(i,1); }); }
function delSms(i){ db.sms.splice(i,1); save(); render(); }
function clearSms(){ del("Clear outbox?",`${db.sms.length} message(s) will be removed from the list.`,()=>{ note("Cleared SMS outbox",db.sms.length+" message(s)"); db.sms=[]; }); }
function delBranch(i){ const b=db.branches[i]; if(b.name===db.settings.branch) return toast("This is the main branch. Set another main branch first.");
  const n=db.members.filter(m=>m.branch===b.name).length; del("Delete branch?",`${b.name}${n?` · ${n} member(s) will move to ${db.settings.branch}`:""}`,()=>{ db.members.forEach(m=>{ if(m.branch===b.name) m.branch=db.settings.branch; }); db.branches.splice(i,1); }); }
function delDevice(id){ const d=db.devices.find(x=>x.id===id); del("Delete device?",`${d.name} · ${d.type}. Its device key stops working.`,()=>{ db.devices=db.devices.filter(x=>x.id!==id); if(gateDev===id) gateDev=(db.devices[0]||{}).id; }); }
async function delUser(username,name){
  if(ME&&ME.username===username) return toast("You cannot delete your own account");
  if(!(await ask("Delete staff account?",`${name} (${username}) will no longer be able to log in.`))) return;
  if(SERVER) return API("/api/users?username="+encodeURIComponent(username),{method:"DELETE"}).then(()=>toast("Account deleted")).catch(e=>toast(e.message));
  const u=db.users.find(x=>x.username===username); if(u&&u.role==="Owner"&&db.users.filter(x=>x.role==="Owner").length<2) return toast("Keep at least one Owner account");
  db.users=db.users.filter(x=>x.username!==username); save(); render(); toast("Account deleted"); }
async function voidPayment(i){ const p=db.payments[i]; const reason=prompt(`Void ${p.or} (${money(p.amount)})? Enter the reason:`); if(!reason) return;
  p.status="Void"; p.voidReason=reason; p.voidBy=ME?ME.name:role; p.voidTs=Date.now(); note("Voided payment",`${p.or} · ${money(p.amount)} · ${reason}`); save(); render(); toast(p.or+" voided"); }
async function forceOut(key){ const [kind,id]=key.split(":"); const p=kind==="member"?memberById(id):kind==="trainer"?db.trainers.find(x=>x.id===id):db.passes.find(x=>x.code===id);
  if(!(await ask("Force Time Out?",`${p?p.name:id} will be marked as timed out now.`,"Time Out",false))) return;
  delete db.inside[key]; db.logs.unshift({ts:Date.now(),name:p?p.name:id,uid:"-",mid:kind==="member"?id:"",kind,method:"Staff",action:"Time Out",reason:"",device:"Manual by "+(ME?ME.name:role),dur:"",snap:""});
  note("Forced Time Out",p?p.name:id); save(); render(); }
function unassignCard(kind,id){ const o=kind==="member"?memberById(id):db.trainers.find(t=>t.id===id); if(!o.rfid) return;
  del("Remove RFID card?",`${o.name} · card ${o.rfid}. The card will stop working.`,()=>{ o.rfid=""; }); }
const auditFor=q=>{ auditQ=q; auditData=null; go("audit"); };

function memberOptions(sel=""){ return db.members.map(m=>`<option value="${m.id}" ${m.id===sel?"selected":""}>${esc(m.name)} (${m.id})</option>`).join(""); }
function render(){
  const allowed=ROLES[role]; if(!allowed.includes(page)) page=allowed[0];
  const cur=NAV.find(n=>n.pages.includes(page));
  $("nav").innerHTML=NAV.map(n=>{
    const ps=n.pages.filter(p=>allowed.includes(p)); if(!ps.length) return "";
    return `<a class="${n===cur?"active":""}" onclick="go('${ps[0]}')">${icon(n.icon)}<span>${n.label}</span></a>`;
  }).join("");
  $("title").textContent=cur.label;
  const tabs=cur.pages.filter(p=>allowed.includes(p));
  $("tabs").innerHTML=tabs.length>1?tabs.map(p=>`<a class="${p===page?"active":""}" onclick="go('${p}')">${PAGES.find(x=>x[0]===p)[2]}</a>`).join(""):"";
  $("tabs").style.display=tabs.length>1?"flex":"none";
  $("branchSel").innerHTML=db.branches.map(b=>`<option ${b.name===currentBranch()?"selected":""}>${esc(b.name)}</option>`).join("");
  $("content").innerHTML=VIEWS[page]();
  if(page==="members") renderMemberRows();
}
window.onDbChange=()=>{ const a=document.activeElement; if(!a||!["INPUT","TEXTAREA","SELECT"].includes(a.tagName)) render(); };

// ---------- RFID input routing ----------
attachReader(uid=>{
  uid=uid.toUpperCase();
  if(enroll){
    const taken=db.members.some(m=>m.rfid===uid)||db.trainers.some(t=>t.rfid===uid)||db.passes.some(p=>p.rfid===uid);
    if(taken){ toast("Card already assigned to someone else."); return; }
    enroll.obj.rfid=uid; toast(`Card ${uid} assigned to ${enroll.obj.name}`); enroll=null; save(); render(); return;
  }
  if(page==="pos"){ const m=db.members.find(x=>x.rfid===uid); if(m){ posCustomer=m.id; render(); toast("Customer: "+m.name);} else toast("Unknown card"); return; }
  gateTap(uid);
});
function startEnroll(kind,id){
  const obj = kind==="member"?memberById(id): kind==="trainer"?db.trainers.find(t=>t.id===id): db.passes.find(p=>p.code===id);
  enroll={kind,obj}; toast(`Tap the RFID card now to assign it to ${obj.name}...`);
}
async function gateTap(uid){
  try{ lastTap=await tap(uid,gateDev,gateMode,""); }catch(e){ return toast("Server error: "+e.message); } lastTap.ts=Date.now();
  if(page!=="access") toast(`${lastTap.who?lastTap.who.name:"Unknown"}: ${lastTap.action} (${lastTap.msg})`);
  render();
}
function remoteOpen(id){ const d=db.devices.find(x=>x.id===id); db.logs.unshift({ts:Date.now(),name:(ME?ME.name:"Admin")+" ("+role+")",method:"Remote",uid:"-",kind:"admin",action:"Remote Open",device:d.name,dur:"",reason:"",snap:""}); save(); toast(d.name+" opened remotely"); render(); }

// ---------- VIEWS ----------
const VIEWS={};

VIEWS.dash=()=>{
  const act=db.members.filter(m=>["Active","Expiring"].includes(memberStatus(m))).length;
  const todayTs=new Date(today()+"T00:00:00").getTime();
  const rev=db.payments.filter(p=>p.ts>=todayTs&&p.status==="Paid").reduce((a,b)=>a+b.amount,0);
  const tin=db.logs.filter(l=>l.ts>=todayTs&&l.action==="Time In").length;
  const occ=insideCount(), pct=Math.round(occ/db.settings.maxOcc*100);
  const expiring=db.members.filter(m=>memberStatus(m)==="Expiring");
  const low=db.products.filter(p=>p.stock<=5);
  const inactive=db.members.filter(m=>daysUntil(m.lastVisit)<=-14);
  return `
  <div class="cards">
    <div class="card"><div class="label">Active Members</div><div class="value">${act}</div><div class="trend">${db.members.length} total</div></div>
    <div class="card"><div class="label">Inside Now</div><div class="value">${occ} / ${db.settings.maxOcc}</div><div class="bar" style="margin-top:8px"><div style="width:${pct}%"></div></div></div>
    <div class="card"><div class="label">Time-ins Today</div><div class="value">${tin}</div></div>
    <div class="card"><div class="label">Revenue Today</div><div class="value">${money(rev)}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Peak Hours (today)</h2>${peakChart(todayTs)}</div>
    <div class="card"><h2>Alerts</h2>
      ${expiring.map(m=>`<div class="list-item"><span>${esc(m.name)} expires ${m.exp}</span><span class="badge warn">Expiring</span></div>`).join("")}
      ${low.map(p=>`<div class="list-item"><span>${p.icon} ${esc(p.name)}: ${p.stock} left</span><span class="badge bad">Low stock</span></div>`).join("")}
      ${inactive.map(m=>`<div class="list-item"><span>${esc(m.name)} last visit ${m.lastVisit}</span><span class="badge gray">Inactive</span></div>`).join("")}
      ${db.devices.filter(d=>!d.online).map(d=>`<div class="list-item"><span>${esc(d.name)}</span><span class="badge bad">Offline</span></div>`).join("")}
    </div>
  </div>
  <div class="card"><h2>Recent Access</h2>${logTable(db.logs.slice(0,8))}</div>`;
};
// ===== Charts (pure SVG) =====
let chartSeq=0;
// Smooth area/line chart. pts=[[label,value],...]
function areaChart(pts,{h=200,unit="",fmt=v=>v}={}){
  const W=600,H=h,pl=36,pr=12,pt=16,pb=28, id="g"+(++chartSeq);
  const max=Math.max(1,...pts.map(p=>p[1])), nice=Math.ceil(max/4)*4||4;
  const X=i=>pl+(pts.length<2?0:i*(W-pl-pr)/(pts.length-1)), Y=v=>pt+(H-pt-pb)*(1-v/nice);
  const P=pts.map((p,i)=>[X(i),Y(p[1])]);
  let d=`M${P[0][0]},${P[0][1]}`;
  for(let i=1;i<P.length;i++){ const [x0,y0]=P[i-1],[x1,y1]=P[i], c=(x1-x0)/2; d+=` C${x0+c},${y0} ${x1-c},${y1} ${x1},${y1}`; }
  const area=`${d} L${P[P.length-1][0]},${H-pb} L${P[0][0]},${H-pb} Z`;
  const peak=pts.reduce((b,p,i)=>p[1]>pts[b][1]?i:b,0);
  const grid=[0,1,2,3,4].map(k=>{const v=nice*k/4,y=Y(v); return `<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" class="cg"/><text x="${pl-8}" y="${y+4}" class="cy">${fmt(v)}</text>`;}).join("");
  const step=Math.ceil(pts.length/9);
  const xl=pts.map((p,i)=>i%step===0||i===pts.length-1?`<text x="${X(i)}" y="${H-8}" class="cx">${p[0]}</text>`:"").join("");
  const dots=P.map(([x,y],i)=>`<g class="cp"><rect x="${x-(W-pl-pr)/pts.length/2}" y="${pt}" width="${(W-pl-pr)/pts.length}" height="${H-pt-pb}" fill="transparent"/>
    <line x1="${x}" x2="${x}" y1="${pt}" y2="${H-pb}" class="ch"/><circle cx="${x}" cy="${y}" r="5" class="cd"/>
    <g class="ct" transform="translate(${Math.min(Math.max(x,pl+40),W-pr-40)},${Math.max(y-14,pt+8)})"><rect x="-40" y="-26" width="80" height="24" rx="6"/><text y="-10">${fmt(pts[i][1])}${unit} · ${pts[i][0]}</text></g></g>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dc2626" stop-opacity=".28"/><stop offset="1" stop-color="#dc2626" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#${id})" class="ca"/><path d="${d}" class="cl" pathLength="1"/>
    <circle cx="${P[peak][0]}" cy="${P[peak][1]}" r="5" class="cpk"/>${xl}${dots}</svg>`;
}
// Donut chart. items=[[label,value],...]
function donut(items,{fmt=v=>v,center="Total"}={}){
  const cols=["#dc2626","#0a0a0a","#f87171","#737373","#fecaca","#d4d4d4","#991b1b"];
  const tot=items.reduce((a,b)=>a+b[1],0)||1, R=60, C=2*Math.PI*R; let off=0;
  const segs=items.map(([k,v],i)=>{ const len=v/tot*C, s=`<circle r="${R}" cx="80" cy="80" fill="none" stroke="${cols[i%cols.length]}" stroke-width="22" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" class="dn" style="animation-delay:${i*.08}s"><title>${k}: ${fmt(v)}</title></circle>`; off+=len; return s; }).join("");
  return `<div class="donut"><svg viewBox="0 0 160 160" width="170" height="170"><g transform="rotate(-90 80 80)">${segs}</g>
    <text x="80" y="76" class="dt1">${center}</text><text x="80" y="96" class="dt2">${fmt(tot)}</text></svg>
    <div class="legend">${items.map(([k,v],i)=>`<div><span style="background:${cols[i%cols.length]}"></span>${k}<b>${fmt(v)}</b><em>${Math.round(v/tot*100)}%</em></div>`).join("")}</div></div>`;
}
const kfmt=v=>v>=1000?"₱"+(v/1000).toFixed(v>=10000?0:1)+"k":"₱"+Math.round(v);
function peakChart(fromTs,toTs=Infinity){
  const hrs={}; for(let h=6;h<=22;h++) hrs[h]=0;
  db.logs.filter(l=>l.ts>=fromTs&&l.ts<toTs&&l.action==="Time In").forEach(l=>{const h=new Date(l.ts).getHours(); if(h in hrs) hrs[h]++;});
  return areaChart(Object.entries(hrs).map(([h,v])=>[(h%12||12)+(h<12?"am":"pm"),v]),{unit:" in"});
}
function peakChartOld(fromTs,toTs=Infinity){
  const hrs={}; for(let h=6;h<=22;h++) hrs[h]=0;
  db.logs.filter(l=>l.ts>=fromTs&&l.ts<toTs&&l.action==="Time In").forEach(l=>{const h=new Date(l.ts).getHours(); if(h in hrs) hrs[h]++;});
  const max=Math.max(1,...Object.values(hrs));
  return `<div class="bars">${Object.entries(hrs).map(([h,v])=>`<div style="height:${v/max*100}%"><b>${v||""}</b><span>${(h%12||12)+(h<12?"a":"p")}</span></div>`).join("")}</div>`;
}
function logTable(rows){
  const b={"Time In":"ok","Time Out":"warn","Denied":"bad","Door Open":"info","Remote Open":"gray","Session":"info"};
  return `<table><thead><tr><th>Time</th><th>Snap</th><th>Name</th><th>Device</th><th>Action</th><th>Duration / Reason</th></tr></thead><tbody>
  ${rows.map(l=>`<tr><td>${new Date(l.ts).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
  <td>${l.snap?`<img class="snap" src="${l.snap}">`:"-"}</td><td>${esc(l.name)} <span class="muted">${l.kind==="trainer"?"(trainer)":l.kind==="pass"?"(walk-in)":""}</span></td>
  <td>${esc(l.device)}${l.method==="Face"?' <span class="badge info">Face</span>':""}</td><td><span class="badge ${b[l.action]||"gray"}">${l.action}</span></td><td>${esc(l.dur||l.reason||"-")}</td></tr>`).join("")}</tbody></table>`;
}

VIEWS.access=()=>{
  const t=lastTap; const fresh=t&&Date.now()-t.ts<8000;
  const insideList=Object.entries(db.inside).map(([k,ts])=>{const [kind,id]=k.split(":"); const p=kind==="member"?memberById(id):kind==="trainer"?db.trainers.find(x=>x.id===id):db.passes.find(x=>x.code===id); return {p,kind,ts};}).filter(x=>x.p);
  return `
  <div class="grid2e">
    <div class="card terminal">
      <h2>Gate Terminal</h2>
      <div class="row"><select id="gDev" onchange="gateDev=this.value">${db.devices.map(d=>`<option value="${d.id}" ${d.id===gateDev?"selected":""}>${esc(d.name)} (${d.type})</option>`).join("")}</select>
      <select id="gMode" onchange="gateMode=this.value">${[["auto","Single reader: 1st tap In, 2nd Out"],["in","ENTRANCE reader (Time In)"],["out","EXIT reader (Time Out)"]].map(([v,l])=>`<option value="${v}" ${v===gateMode?"selected":""}>${l}</option>`).join("")}</select></div>
      <div style="margin:14px 0">${fresh?avatar(t.who,110):`<div class="rf-ico">${ic("rfid",42)}</div>`}</div>
      ${fresh?`<div class="big" style="color:${t.ok?"#16a34a":"#dc2626"}">${ic(t.ok?"check":"x",20,2.4)} ${esc(t.who?t.who.name:"Unknown card")} · ${t.action}</div>
        <p class="muted">${esc(t.msg)}${t.who&&t.kind==="member"?` · ${t.who.plan} until ${t.who.exp}`:""}</p>`
        :`<p class="muted">Tap RFID card on the reader...</p>`}
      <hr style="margin:14px 0;border:none;border-top:1px solid #e2e8f0">
      <p class="muted" style="margin-bottom:6px">No reader? Simulate tap. Try 0004512345 (Juan), 0004512348 (expired), 0009990010 (trainer)</p>
      <div class="row"><input id="simUid" placeholder="Card UID"><button class="btn sec" onclick="gateTap($('simUid').value)">Simulate Tap</button></div>
    </div>
    <div class="card"><h2>Inside Now (${insideList.length} / ${db.settings.maxOcc})</h2>
      ${insideList.map(x=>`<div class="list-item"><span class="row" style="flex:0">${avatar(x.p,30)}</span><span style="flex:1">${esc(x.p.name)} <span class="muted">${x.kind}</span></span><span class="muted">in ${fmtTime(x.ts)}</span><button class="btn sm sec" title="Force Time Out" onclick="forceOut('${x.kind}:${x.p.id||x.p.code}')">${ic("logout",13)}</button></div>`).join("")||`<p class="muted">Nobody inside.</p>`}
    </div>
  </div>
  <div class="card"><h2>Devices (Turnstile / Door locks)</h2><table><thead><tr><th>Device</th><th>Type</th><th>Area</th><th>Status</th><th></th></tr></thead><tbody>
    ${db.devices.map(d=>`<tr><td>${esc(d.name)}</td><td>${d.type}</td><td>${d.area}</td><td><span class="badge ${d.online?"ok":"bad"}">${d.online?"Online":"Offline"}</span></td><td><button class="btn sm" onclick="remoteOpen('${d.id}')">${ic("unlock",14)} Remote Open</button></td></tr>`).join("")}
  </tbody></table></div>
  <div class="card"><h2>Access Log</h2>${logTable(db.logs.filter(l=>!l.seed).slice(0,40))}</div>`;
};

VIEWS.members=()=>`
  <div class="card"><h2>Add Member</h2>
    <div class="row"><input id="nName" placeholder="Full name"><select id="nPlan">${Object.entries(PLANS).map(([k,v])=>`<option value="${k}">${k} - ${money(v.price)}</option>`).join("")}</select>
    <input id="nSport" placeholder="Sport / program"></div>
    <div class="row"><input id="nPhone" placeholder="Mobile no."><input id="nParent" placeholder="Parent mobile (for minors)">
    <select id="nPay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card</option></select>
    <input id="nPhoto" type="file" accept="image/*" capture="user"></div>
    <div class="row"><input id="nRef" placeholder="Referral code (optional)"><input id="nPromo" placeholder="Promo code (optional)"><input id="nPin" placeholder="Member app PIN (default: last 4 of mobile)"></div>
    <button class="btn" onclick="addMember()">Save, then tap RFID card</button>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:8px"><input id="mSearch" placeholder="Search name, ID or card..." value="${esc(memberFilter)}" oninput="memberFilter=this.value;renderMemberRows()"></div>
    <table><thead><tr><th>Photo</th><th>ID</th><th>RFID Card</th><th>Name</th><th>Plan</th><th>Expiry</th><th>Status</th><th>Wallet</th><th>Actions</th></tr></thead><tbody id="mRows"></tbody></table>
  </div>`;
function renderMemberRows(){
  const f=memberFilter.toLowerCase();
  $("mRows").innerHTML=db.members.filter(m=>(m.name+m.id+m.rfid).toLowerCase().includes(f)).map(m=>{const st=memberStatus(m); return `<tr>
    <td><label style="cursor:pointer" title="Change photo">${avatar(m,36)}<input type="file" accept="image/*" style="display:none" onchange="setPhoto('${m.id}',this.files[0])"></label></td>
    <td>${m.id}</td><td>${m.rfid?'<span class="uid">'+ic("card",14)+esc(m.rfid)+'</span>':'<span class="badge warn">No card</span>'}</td><td>${esc(m.name)} ${m.face?'<span class="badge info">Face</span>':""}<div class="muted">${esc(m.sport)} · ${esc(m.branch)} · Ref ${esc(m.refCode||"-")}</div></td>
    <td>${m.plan}</td><td>${m.exp}</td><td><span class="badge ${STATUS_CLS[st]}">${st}</span></td><td>${money(m.wallet)}</td>
    <td class="row" style="gap:4px"><button class="btn sm" onclick="renew('${m.id}')">Renew</button>
    <button class="btn sm sec" onclick="toggleFreeze('${m.id}')">${m.frozen?"Unfreeze":"Freeze"}</button>
    <button class="btn sm sec" onclick="startEnroll('member','${m.id}')">Assign card</button>
    <button class="btn sm sec" onclick="loadWallet('${m.id}')">+ Wallet</button>
    <button class="btn sm sec" onclick="openFaceEnroll('${m.id}')">${ic("scan",13)} ${m.face?"Re-enroll face":"Enroll face"}</button>
    ${m.rfid?`<button class="btn sm sec" title="Remove RFID card" onclick="unassignCard('member','${m.id}')">${ic("ban",13)}</button>`:""}
    <button class="btn sm sec icon-btn" title="History (audit trail)" onclick="auditFor('${esc(m.name)}')">${ic("history",13)}</button>
    ${delBtn(`delMember('${m.id}')`,"Delete member")}</td></tr>`;}).join("");
}
function addMember(){
  const name=$("nName").value.trim(); if(!name) return toast("Enter a name");
  const plan=$("nPlan").value, method=$("nPay").value, ref=findReferrer($("nRef").value);
  if($("nRef").value.trim()&&!ref) return toast("Referral code not found");
  let price=PLANS[plan].price, extra={};
  if(ref){ const d=Math.round(price*db.settings.refDiscount/100); price-=d; extra={discount:d,promo:"REF "+ref.refCode}; }
  else if($("nPromo").value.trim()){ const r=applyPromo($("nPromo").value,price,"Membership"); if(r.error) return toast(r.error); if(r.discount){ price=r.amount; extra={discount:r.discount,promo:r.code}; usePromo(r.code); } }
  const fin=photo=>{
    const m=newMember({name,plan,sport:$("nSport").value,phone:$("nPhone").value,parent:$("nParent").value,photo,pin:$("nPin").value.trim()||undefined,referredBy:ref?ref.id:""});
    if(ref) rewardReferrer(ref,name);
    const r=addPayment(name,plan+" Plan (new)","Membership",price,method,"Paid",extra); save(); render(); startEnroll("member",m.id);
    if(confirm(`Member ${m.id} saved. Paid ${money(price)}. Print receipt ${r.or}?`)) printReceipt(r);
  };
  const f=$("nPhoto").files[0]; if(f) readPhoto(f,fin); else fin("");
}
function setPhoto(id,f){ if(f) readPhoto(f,d=>{memberById(id).photo=d; save(); render();}); }
function renew(id){ const m=memberById(id); const method=prompt(`Renew ${m.name} (${m.plan} ${money(PLANS[m.plan].price)}). Payment method? Cash / GCash / Maya / Card`,"Cash"); if(!method) return;
  const code=prompt("Promo code (leave blank if none)",""); let amt=PLANS[m.plan].price, extra={};
  if(code){ const r=applyPromo(code,amt,"Membership"); if(r.error) return toast(r.error); amt=r.amount; extra={discount:r.discount,promo:r.code}; usePromo(r.code); }
  renewMember(m,method,amt,extra); toast(`${m.name} renewed until ${m.exp}`); render(); if(confirm("Print receipt?")) printReceipt(lastReceipt); }
async function openFaceEnroll(id){
  const m=memberById(id), ov=document.createElement("div"); ov.className="modal";
  ov.innerHTML=`<div class="modal-box"><h2 class="hi">${ic("scan",18)} Enroll face · ${esc(m.name)}</h2>
    <div class="face-cam"><video id="fv" autoplay muted playsinline></video><div class="face-frame"></div></div>
    <p class="muted" id="fs">Loading face engine...</p>
    <div class="row" style="margin-top:12px"><button class="btn sec" id="fc">Cancel</button>${m.face?'<button class="btn sec" id="fr">Remove face</button>':""}<button class="btn" id="fg" disabled>${ic("check",14)} Capture</button></div></div>`;
  document.body.appendChild(ov); let stream=null;
  const close=()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); ov.remove(); };
  ov.querySelector("#fc").onclick=close;
  if(m.face) ov.querySelector("#fr").onclick=()=>{ m.face=null; save(); close(); render(); toast("Face removed"); };
  try{ await FACE.load(); stream=await FACE.camera(ov.querySelector("#fv")); ov.querySelector("#fs").textContent="Look straight at the camera, good lighting, no cap or sunglasses."; ov.querySelector("#fg").disabled=false; }
  catch(e){ ov.querySelector("#fs").textContent="Cannot start face engine: "+e.message; return; }
  ov.querySelector("#fg").onclick=async()=>{
    const st=ov.querySelector("#fs"); st.textContent="Capturing... hold still"; const samples=[];
    for(let i=0;i<5&&samples.length<3;i++){ const r=await FACE.read(ov.querySelector("#fv")); if(r) samples.push(r.desc); await new Promise(z=>setTimeout(z,250)); }
    if(samples.length<3){ st.textContent="No clear face found. Move closer and try again."; return; }
    const avg=samples[0].map((_,k)=>Math.round(samples.reduce((s,d)=>s+d[k],0)/samples.length*10000)/10000);
    const dup=db.members.find(x=>x.id!==m.id&&x.face&&FACE.dist(avg,x.face)<0.45);
    if(dup&&!confirm(`This face looks like ${dup.name}. Save anyway?`)) return;
    m.face=avg; save(); close(); render(); toast("Face enrolled for "+m.name);
  };
}
function toggleFreeze(id){ const m=memberById(id); m.frozen=!m.frozen; sendSms(m.phone,`${db.settings.gymName}: Your membership is now ${m.frozen?"FROZEN":"ACTIVE"}.`); save(); render(); }
function loadWallet(id){ const m=memberById(id); const a=Number(prompt(`Load wallet for ${m.name}. Amount:`,"500")); if(!a) return; m.wallet+=a; addPayment(m.name,"Wallet load","Wallet",a,"Cash"); save(); render(); }

VIEWS.passes=()=>`
  <div class="card"><h2>Sell Walk-in / Day Pass</h2>
    <div class="row"><input id="pName" placeholder="Guest name (optional)"><select id="pType">${Object.entries(PASS_TYPES).map(([k,v])=>`<option value="${k}">${k} - ${money(v.price)}</option>`).join("")}</select>
    <select id="pPay"><option>Cash</option><option>GCash</option><option>Maya</option></select><button class="btn" onclick="sellPass()">Sell Pass</button></div>
    <p class="muted">Gets a temporary card UID automatically. Click "Link card" and tap a temporary RFID card to use a physical card instead.</p>
  </div>
  <div class="card"><table><thead><tr><th>Code</th><th>Guest</th><th>Type</th><th>Card UID</th><th>Valid until</th><th>Status</th><th></th></tr></thead><tbody>
  ${db.passes.map(p=>{const ok=Date.now()<p.validUntil; return `<tr><td>${p.code}</td><td>${esc(p.name)}</td><td>${p.type}</td><td>${esc(p.rfid)}</td><td>${new Date(p.validUntil).toLocaleString()}</td>
  <td><span class="badge ${ok?"ok":"bad"}">${ok?"Valid":"Expired"}</span></td><td><button class="btn sm sec" onclick="startEnroll('pass','${p.code}')">Link card</button> <button class="btn sm sec" onclick="gateTap('${p.rfid}')">Test tap</button> ${delBtn(`delPass('${p.code}')`)}</td></tr>`;}).join("")||`<tr><td colspan="7" class="muted">No passes sold yet.</td></tr>`}
  </tbody></table></div>`;
function sellPass(){ const p=createPass($("pName").value.trim(),$("pType").value,$("pPay").value); toast(`Pass ${p.code} sold. Card UID: ${p.rfid}`); render(); }

VIEWS.classes=()=>`
  <div class="card"><h2>Book a Class</h2><div class="row"><select id="cMem">${memberOptions()}</select><select id="cCls">${db.classes.map(c=>`<option value="${c.id}">${c.name} · ${c.time}</option>`).join("")}</select><button class="btn" onclick="bookClass($('cMem').value,$('cCls').value)">Book</button></div></div>
  <div class="card"><table><thead><tr><th>Class</th><th>Trainer</th><th>Schedule</th><th>Slots</th><th>Booked</th><th>Waitlist</th><th></th></tr></thead><tbody>
  ${db.classes.map(c=>`<tr><td><b>${c.name}</b></td><td>${c.trainer}</td><td>${c.time}</td>
  <td>${c.booked.length}/${c.cap}<div class="bar"><div style="width:${c.booked.length/c.cap*100}%"></div></div></td>
  <td>${c.booked.map(id=>`<span class="badge gray" style="display:inline-block;margin:2px">${esc(memberById(id)?.name||id)} <a style="cursor:pointer" onclick="cancelClass('${c.id}','${id}')">${ic("x",12,2.4)}</a></span>`).join("")}</td>
  <td>${c.wait.map(id=>`<span class="badge warn" style="display:inline-block;margin:2px">${esc(memberById(id)?.name||id)}</span>`).join("")||"-"}</td><td>${delBtn(`delClass('${c.id}')`,"Delete class")}</td></tr>`).join("")}
  </tbody></table><p class="muted" style="margin-top:8px">If a class is full, the member goes to the waitlist. When someone cancels, the first in the waitlist is moved in and gets an SMS.</p>
  <div class="row" style="margin-top:12px"><input id="ncN" placeholder="New class name"><select id="ncT">${db.trainers.map(t=>`<option>${esc(t.name)}</option>`).join("")}</select><input id="ncS" placeholder="Schedule e.g. Mon/Wed 7:00 PM"><input id="ncC" type="number" placeholder="Capacity"><button class="btn sec" onclick="addClass()">${ic("plus",14)} Add class</button></div></div>`;
function bookClass(mid,cid){
  const c=db.classes.find(x=>x.id===cid), m=memberById(mid);
  if(c.booked.includes(mid)||c.wait.includes(mid)) return toast("Already booked / waitlisted");
  if(c.booked.length<c.cap){ c.booked.push(mid); toast(`${m.name} booked in ${c.name}`); } else { c.wait.push(mid); toast(`${c.name} is full. ${m.name} added to waitlist #${c.wait.length}`); }
  save(); render();
}
function cancelClass(cid,mid){
  const c=db.classes.find(x=>x.id===cid); c.booked=c.booked.filter(x=>x!==mid);
  if(c.wait.length){ const nx=c.wait.shift(); c.booked.push(nx); const m=memberById(nx); sendSms(m.phone,`${db.settings.gymName}: Good news! A slot opened in ${c.name} (${c.time}). You're booked.`); toast(`${m.name} moved from waitlist`); }
  save(); render();
}

VIEWS.trainers=()=>`
  <div class="card"><h2>Trainers · RFID attendance & payroll</h2><table><thead><tr><th></th><th>Name</th><th>Specialty</th><th>RFID</th><th>Status</th><th>Hours (period)</th><th>Rate/hr</th><th>Payroll</th><th></th></tr></thead><tbody>
  ${db.trainers.map(t=>{const inn=db.inside["trainer:"+t.id]; return `<tr><td>${avatar(t,34)}</td><td>${esc(t.name)}</td><td>${t.specialty}</td><td><span class="uid">${ic("card",14)}${t.rfid}</span></td>
  <td><span class="badge ${inn?"ok":"gray"}">${inn?"On duty since "+fmtTime(inn):"Off"}</span></td><td>${t.hours.toFixed(2)}</td><td>${money(t.rate)}</td><td><b>${money(Math.round(t.hours*t.rate))}</b></td>
  <td><button class="btn sm sec" onclick="gateTap('${t.rfid}')">Tap In/Out</button> <button class="btn sm sec" onclick="startEnroll('trainer','${t.id}')">Assign card</button> ${t.rfid?`<button class="btn sm sec" title="Remove RFID card" onclick="unassignCard('trainer','${t.id}')">${ic("ban",13)}</button>`:""} ${delBtn(`delTrainer('${t.id}')`,"Delete trainer")}</td></tr>`;}).join("")}
  </tbody></table>
  <div class="row" style="margin-top:12px"><input id="ntrN" placeholder="New trainer name"><input id="ntrS" placeholder="Specialty"><input id="ntrR" type="number" placeholder="Rate per hour"><button class="btn sec" onclick="addTrainer()">${ic("plus",14)} Add trainer</button></div>
  <button class="btn" style="margin-top:10px" onclick="closePayroll()">Close payroll period</button></div>`;
function closePayroll(){ if(!confirm("Record payroll and reset hours?")) return; db.trainers.forEach(t=>{ if(t.hours>0) addPayment(t.name,"Trainer payroll","Payroll",-Math.round(t.hours*t.rate),"Bank"); t.hours=0; }); save(); render(); }

const TIMES=["6AM","8AM","10AM","12PM","2PM","4PM","6PM","8PM"];
VIEWS.courts=()=>`
  <div class="card"><div class="row"><span style="flex:0 0 auto">Book for:</span><select id="ctMem">${memberOptions()}</select><select id="ctPay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Wallet</option></select></div>
  <p class="muted">Green = free (click to book, 2 hours). Red = booked (click to cancel). The Court Area door opens only for the booked member during the slot.</p></div>
  <div class="cards">${db.courts.map((c,i)=>`<div class="card"><div class="card-tools">${delBtn(`delCourt(${i})`,"Delete court")}</div><h2 class="hi">${ic(courtIcon(c.name),18)}${esc(cleanName(c.name))}</h2><p class="muted" style="margin-bottom:6px">${money(c.price)}/hr</p>
  ${TIMES.map(t=>{const b=c.slots[t]; return `<span class="slot ${b?"taken":"free"}" title="${b?esc(memberById(b)?.name||b):"Free"}" onclick="courtSlot(${i},'${t}')">${t}${b?" · "+esc((memberById(b)?.name||b).split(" ")[0]):""}</span>`;}).join("")}</div>`).join("")}</div>
  <div class="card"><div class="row"><input id="nctN" placeholder="New court name e.g. Futsal Court"><input id="nctP" type="number" placeholder="Price per hour"><button class="btn sec" onclick="addCourt()">${ic("plus",14)} Add court</button></div></div>`;
function courtSlot(i,t){
  const c=db.courts[i];
  if(c.slots[t]){ if(confirm(`Cancel booking of ${memberById(c.slots[t])?.name} at ${t}?`)){ delete c.slots[t]; save(); render(); } return; }
  const m=memberById($("ctMem").value), method=$("ctPay").value, amt=c.price*2;
  if(method==="Wallet"){ if(m.wallet<amt) return toast("Insufficient wallet balance"); m.wallet-=amt; }
  c.slots[t]=m.id; addPayment(m.name,`${cleanName(c.name)} ${t} (2h)`,"Courts",amt,method); save(); render(); toast(`Booked ${cleanName(c.name)} at ${t} for ${m.name}`);
}

VIEWS.lockers=()=>`
  <div class="card"><div class="row"><span style="flex:0 0 auto">Assign to:</span><select id="lkMem">${memberOptions()}</select></div>
  <p class="muted">Click a free locker to assign. Click an occupied one to release. Members open their locker with the same RFID card (Locker Bank device).</p></div>
  <div class="card"><div class="gridbox">${db.lockers.map((l,i)=>`<div class="tile ${l.member?"taken":"free"}" onclick="lockerClick(${i})">${l.member?"":`<div class="tools"><a title="Delete locker" onclick="event.stopPropagation();delLocker(${i})">${ic("trash",14)}</a></div>`}<div class="ti">${ic(l.member?"lock":"unlock",22)}</div>#${l.no}<div class="muted">${l.member?esc(memberById(l.member)?.name||""):"Free"}</div></div>`).join("")}
  <div class="tile add-tile" onclick="addLocker()"><div class="ti">${ic("plus",22)}</div>Add locker</div></div></div>`;
function lockerClick(i){ const l=db.lockers[i];
  if(l.member){ if(confirm(`Release locker #${l.no}?`)){ l.member=""; save(); render(); } return; }
  const mid=$("lkMem").value; if(db.lockers.some(x=>x.member===mid)) return toast("Member already has a locker");
  l.member=mid; save(); render(); }

VIEWS.equipment=()=>`
  <div class="card"><h2>Rent Equipment</h2><div class="row"><select id="eqMem">${memberOptions()}</select><select id="eqItem">${db.equipment.map((e,i)=>`<option value="${i}">${e.item} - ${money(e.fee)}</option>`).join("")}</select>
  <select id="eqPay"><option>Cash</option><option>Wallet</option><option>GCash</option></select><button class="btn" onclick="rent()">Rent</button></div></div>
  <div class="grid2e"><div class="card"><h2>Inventory</h2><table><thead><tr><th>Item</th><th>Available</th><th>Fee</th><th></th></tr></thead><tbody>
  ${db.equipment.map((e,i)=>`<tr><td>${esc(e.item)}</td><td>${e.total-e.out.length} / ${e.total}</td><td>${money(e.fee)}</td><td>${delBtn(`delEquip(${i})`)}</td></tr>`).join("")}</tbody></table>
  <div class="row" style="margin-top:10px"><input id="neqN" placeholder="New item"><input id="neqT" type="number" placeholder="Qty"><input id="neqF" type="number" placeholder="Fee"><button class="btn sec" onclick="addEquip()">${ic("plus",14)} Add</button></div></div>
  <div class="card"><h2>Currently Borrowed</h2>${db.equipment.flatMap((e,i)=>e.out.map((o,j)=>`<div class="list-item"><span>${e.item} · ${esc(memberById(o.member)?.name)} <span class="muted">since ${fmtTime(o.ts)}</span></span><button class="btn sm green" onclick="returnEq(${i},${j})">Return</button></div>`)).join("")||`<p class="muted">Nothing borrowed.</p>`}</div></div>`;
function rent(){ const e=db.equipment[$("eqItem").value], m=memberById($("eqMem").value), method=$("eqPay").value;
  if(e.out.length>=e.total) return toast("None available");
  if(method==="Wallet"){ if(m.wallet<e.fee) return toast("Insufficient wallet"); m.wallet-=e.fee; }
  e.out.push({member:m.id,ts:Date.now()}); addPayment(m.name,e.item+" rental","Rental",e.fee,method); save(); render(); }
function returnEq(i,j){ db.equipment[i].out.splice(j,1); save(); render(); }

VIEWS.tournaments=()=>db.tournaments.map(t=>`
  <div class="card"><div class="card-tools">${delBtn(`delTournament('${t.id}')`,"Delete tournament")}</div><h2 class="hi">${ic("trophy",18)}${esc(t.name)} <span class="badge info">${t.sport}</span></h2>
  <div class="grid2e"><div><h2 style="font-size:14px">Standings</h2><table><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th></th></tr></thead><tbody>
  ${[...t.teams].sort((a,b)=>b.w-a.w||a.l-b.l).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${x.w}</td><td>${x.l}</td><td>${delBtn(`delTeam('${t.id}','${esc(x.name)}')`,"Remove team")}</td></tr>`).join("")}</tbody></table>
  <div class="row" style="margin-top:8px"><input id="tm_${t.id}" placeholder="New team name"><button class="btn sm" onclick="addTeam('${t.id}')">+ Team</button></div></div>
  <div><h2 style="font-size:14px">Matches</h2>${t.matches.map((mt,j)=>`<div class="list-item"><span style="flex:1">${mt.date} · ${esc(mt.a)} vs ${esc(mt.b)}</span>${mt.score?`<span class="badge ok">${esc(mt.score)}</span>`:`<button class="btn sm" onclick="setScore('${t.id}',${j})">Enter score</button>`}${delBtn(`delMatch('${t.id}',${j})`,"Delete match")}</div>`).join("")}
  <div class="row" style="margin-top:8px"><select id="ma_${t.id}">${t.teams.map(x=>`<option>${esc(x.name)}</option>`).join("")}</select><select id="mb_${t.id}">${t.teams.map((x,i)=>`<option ${i===1?"selected":""}>${esc(x.name)}</option>`).join("")}</select><input id="md_${t.id}" type="date" value="${addDays(7)}"><button class="btn sm" onclick="addMatch('${t.id}')">+ Match</button></div></div></div></div>`).join("")+
  `<div class="card"><div class="row"><input id="ntName" placeholder="New tournament / league name"><input id="ntSport" placeholder="Sport"><button class="btn" onclick="addTournament()">Create</button></div></div>`;
const tour=id=>db.tournaments.find(t=>t.id===id);
function addTeam(id){ const n=$("tm_"+id).value.trim(); if(n){ tour(id).teams.push({name:n,w:0,l:0}); save(); render(); } }
function addMatch(id){ const a=$("ma_"+id).value,b=$("mb_"+id).value; if(a===b) return toast("Pick two different teams"); tour(id).matches.push({a,b,date:$("md_"+id).value,score:""}); save(); render(); }
function setScore(id,j){ const t=tour(id), mt=t.matches[j]; const s=prompt(`Score ${mt.a} - ${mt.b} (e.g. 85-78)`); if(!s) return;
  const [x,y]=s.split("-").map(Number); if(isNaN(x)||isNaN(y)||x===y) return toast("Invalid score");
  mt.score=s; const w=t.teams.find(q=>q.name===(x>y?mt.a:mt.b)), l=t.teams.find(q=>q.name===(x>y?mt.b:mt.a)); w.w++; l.l++; save(); render(); }
function addTournament(){ const n=$("ntName").value.trim(); if(!n) return; db.tournaments.push({id:"TR"+Date.now(),name:n,sport:$("ntSport").value||"Sports",teams:[],matches:[]}); save(); render(); }

VIEWS.progress=()=>{
  const m=memberById(progMember)||db.members[0]; const hM=m.height/100;
  const ws=m.progress.map(p=>p.w); const max=Math.max(1,...ws), min=Math.min(...ws,max)-5;
  return `<div class="card"><div class="row"><span style="flex:0 0 auto">Member:</span><select onchange="progMember=this.value;render()">${memberOptions(m.id)}</select>
  <span style="flex:0 0 auto">Height (cm):</span><input type="number" value="${m.height}" onchange="memberById('${m.id}').height=Number(this.value);save();render()" style="max-width:100px;margin:0"></div></div>
  <div class="grid2e"><div class="card"><h2>Weight trend</h2>${m.progress.length?areaChart(m.progress.map(p=>[p.d.slice(5),p.w]),{unit:" kg",h:180}):`<p class="muted">No records yet.</p>`}
  <table style="margin-top:10px"><thead><tr><th>Date</th><th>Weight</th><th>Body fat</th><th>Muscle</th><th>BMI</th><th></th></tr></thead><tbody>${m.progress.map((p,j)=>`<tr><td>${p.d}</td><td>${p.w} kg</td><td>${p.bf}%</td><td>${p.mm?p.mm+" kg":"-"}</td><td>${(p.w/(hM*hM)).toFixed(1)}</td><td>${delBtn(`delProg('${m.id}',${j})`)}</td></tr>`).join("")}</tbody></table>
  <div class="row" style="margin-top:8px"><input id="pgW" type="number" placeholder="Weight kg"><input id="pgB" type="number" placeholder="Body fat %"><input id="pgM" type="number" placeholder="Muscle kg"><button class="btn" onclick="addProg('${m.id}')">Add</button></div></div>
  <div class="card"><h2>Workout Plan</h2><textarea id="wkTxt" rows="12" placeholder="e.g. Mon - Chest & triceps...">${esc(m.workout)}</textarea><button class="btn" onclick="memberById('${m.id}').workout=$('wkTxt').value;save();toast('Workout plan saved')">Save plan</button>
  <p class="muted" style="margin-top:6px">Members can view this plan on the kiosk after tapping their card.</p></div></div>`;
};
function addProg(id){ const w=Number($("pgW").value); if(!w) return; memberById(id).progress.push({d:today(),w,bf:Number($("pgB").value)||0,mm:Number($("pgM").value)||0}); save(); render(); }

VIEWS.pos=()=>{
  const total=cart.reduce((a,c)=>a+c.price*c.qty,0), cust=memberById(posCustomer);
  const cats=["All",...PRODUCT_CATS.filter(c=>db.products.some(p=>p.cat===c))];
  const list=db.products.map((p,i)=>[p,i]).filter(([p])=>posCat==="All"||p.cat===posCat);
  return `<div class="grid2"><div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0;flex:1">Products</h2><button class="btn" style="flex:0 0 auto" onclick="productModal(null)">${ic("plus",14)} Add product</button></div>
  <div class="chips-row">${cats.map(c=>`<a class="${c===posCat?"on":""}" onclick="posCat='${c}';render()">${c}</a>`).join("")}</div>
  <div class="gridbox">${list.map(([p,i])=>`<div class="tile prod ${p.stock<1?"out":""}" onclick="addCart(${i})"><div class="tools"><a title="Edit" onclick="event.stopPropagation();productModal(${i})">${ic("edit",14)}</a><a title="Delete" onclick="event.stopPropagation();delProduct(${i})">${ic("trash",14)}</a></div>
    ${productThumb(p,26)}<b>${esc(p.name)}</b><div>${money(p.price)}</div><div class="muted" style="${p.stock<=5?"color:#dc2626":""}">${p.stock<1?"Out of stock":"Stock: "+p.stock}</div></div>`).join("")}
    <div class="tile add-tile" onclick="productModal(null)"><div class="ti">${ic("plus",24)}</div><b>Add product</b><div class="muted">Icon or photo</div></div></div></div>
  <div class="card"><h2>Cart</h2>${cart.map((c,i)=>`<div class="list-item"><span>${c.qty}× ${esc(c.name)}</span><span>${money(c.price*c.qty)} <a style="cursor:pointer" onclick="cart.splice(${i},1);render()">${ic("x",12,2.4)}</a></span></div>`).join("")||`<p class="muted">Empty</p>`}
  <div class="list-item"><b>Total</b><b>${money(total)}</b></div>
  <p class="muted" style="margin:8px 0">Customer (tap RFID card or select):</p>
  <select onchange="posCustomer=this.value;render()"><option value="">Walk-in customer</option>${memberOptions(posCustomer)}</select>
  ${cust?`<div class="row" style="margin-bottom:8px">${avatar(cust,32)}<span>${esc(cust.name)} · Wallet ${money(cust.wallet)}</span></div>`:""}
  <input id="posPromo" placeholder="Promo code (optional)">
  <select id="posPay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card</option>${cust?"<option>Wallet</option>":""}</select>
  <button class="btn" style="width:100%" onclick="checkout()">Checkout</button></div></div>
  <div class="card"><h2>Recent Sales</h2><table><tbody>${db.payments.filter(p=>p.cat==="POS").slice(0,10).map(p=>`<tr><td>${new Date(p.ts).toLocaleString()}</td><td>${esc(p.name)}</td><td>${esc(p.item)}</td><td>${money(p.amount)}</td><td>${p.method}</td></tr>`).join("")}</tbody></table></div>`;
};
function addCart(i){ const p=db.products[i]; const c=cart.find(x=>x.i===i); const q=c?c.qty:0; if(q>=p.stock) return toast("Out of stock"); if(c) c.qty++; else cart.push({i,name:p.name,price:p.price,qty:1}); render(); }
let posCat="All";
// Add / edit product with icon picker or photo upload
function productModal(i){
  const p=i==null?{name:"",price:"",stock:"",cat:"Drinks",iconName:"",photo:""}:{...db.products[i]};
  let icon=p.iconName||productIcon(p), photo=p.photo||"", touchedIcon=!!p.iconName, drawn=false;
  const ov=document.createElement("div"); ov.className="modal";
  const keep=()=>{ p.name=ov.querySelector("#pmN").value; p.price=ov.querySelector("#pmP").value; p.stock=ov.querySelector("#pmS").value; p.cat=ov.querySelector("#pmC").value; };
  const draw=()=>{
    ov.innerHTML=`<div class="modal-box wide ${drawn?"noanim":""}"><h2>${i==null?"Add product":"Edit product"}</h2>
    <div class="prod-prev"><div class="pv-pic">${photo?`<img src="${photo}" alt="">`:`<div class="ti big">${ic(icon,38)}</div>`}</div><div><b id="pvN">${esc(p.name||"Product name")}</b><div class="muted" id="pvP">${p.price?money(p.price):"₱0"} · ${esc(p.cat)}</div></div></div>
    <div class="row"><input id="pmN" placeholder="Product name" value="${esc(p.name)}"><select id="pmC">${PRODUCT_CATS.map(c=>`<option ${c===p.cat?"selected":""}>${c}</option>`).join("")}</select></div>
    <div class="row"><input id="pmP" type="number" min="0" placeholder="Price" value="${esc(p.price)}"><input id="pmS" type="number" min="0" placeholder="Stock" value="${esc(p.stock)}"></div>
    <label class="muted">Icon ${photo?"(a photo is used instead)":""}</label>
    <div class="icon-pick ${photo?"dim":""}">${PRODUCT_ICONS.map(n=>`<a class="${n===icon?"on":""}" data-ic="${n}" title="${n}">${ic(n,20)}</a>`).join("")}</div>
    <div class="row" style="margin-top:10px"><label class="btn sec" style="flex:0 0 auto">${ic("image",14)} ${photo?"Change photo":"Upload photo"}<input id="pmF" type="file" accept="image/*" style="display:none"></label>
      ${photo?`<button class="btn sec" id="pmX" style="flex:0 0 auto">Remove photo</button>`:""}<span class="muted">Square photos look best.</span></div>
    <div class="row" style="margin-top:16px">${i!=null?`<button class="btn sec danger" id="pmD" style="flex:0 0 auto">${ic("trash",14)} Delete</button>`:""}<span style="flex:1"></span>
      <button class="btn sec" id="pmCancel" style="flex:0 0 auto">Cancel</button><button class="btn" id="pmSave" style="flex:0 0 auto">${ic("check",14)} Save</button></div></div>`;
    const q=s=>ov.querySelector(s);
    q("#pmN").oninput=e=>{ q("#pvN").textContent=e.target.value||"Product name"; if(!touchedIcon&&!photo){ const g=productIcon({name:e.target.value}); if(g!==icon) setIcon(g); } };
    q("#pmC").onchange=e=>{ q("#pvP").textContent=(q("#pmP").value?money(q("#pmP").value):"₱0")+" · "+e.target.value; };
    q("#pmP").oninput=e=>{ q("#pvP").textContent=(e.target.value?money(e.target.value):"₱0")+" · "+q("#pmC").value; };
    // pick icon in place (no redraw = no flicker / animation)
    const setIcon=n=>{ icon=n; ov.querySelectorAll("[data-ic]").forEach(x=>x.classList.toggle("on",x.dataset.ic===n)); if(!photo) q(".pv-pic").innerHTML=`<div class="ti big">${ic(n,38)}</div>`; };
    ov.querySelectorAll("[data-ic]").forEach(a=>a.onclick=()=>{ touchedIcon=true; if(photo){ keep(); photo=""; icon=a.dataset.ic; draw(); return; } setIcon(a.dataset.ic); });
    q("#pmF").onchange=e=>{ const f=e.target.files[0]; if(f){ keep(); readPhoto(f,d=>{ photo=d; draw(); }); } };
    if(q("#pmX")) q("#pmX").onclick=()=>{ keep(); photo=""; draw(); };
    if(q("#pmD")) q("#pmD").onclick=()=>{ ov.remove(); delProduct(i); };
    q("#pmCancel").onclick=()=>ov.remove(); drawn=true;
    q("#pmSave").onclick=()=>{ keep(); const name=p.name.trim(), price=Number(p.price), stock=Math.max(0,Math.round(Number(p.stock)||0));
      if(!name) return toast("Enter a product name"); if(!(price>0)) return toast("Enter a price");
      if(db.products.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())) return toast("A product with this name already exists");
      const item={...(i==null?{}:db.products[i]),id:p.id||"PR"+Date.now().toString().slice(-7),name,price,stock,cat:p.cat,iconName:photo?"":icon,photo};
      if(i==null) db.products.push(item); else db.products[i]=item;
      cart=cart.filter(c=>c.i!==i); save(); ov.remove(); render(); toast(i==null?"Product added":"Product saved"); };
  };
  ov.addEventListener("click",e=>{ if(e.target===ov) ov.remove(); });
  draw(); document.body.appendChild(ov); setTimeout(()=>{ const n=ov.querySelector("#pmN"); if(n) n.focus(); },50);
}
function checkout(){ if(!cart.length) return; let total=cart.reduce((a,c)=>a+c.price*c.qty,0), extra={}; const method=$("posPay").value, cust=memberById(posCustomer);
  const pc=$("posPromo").value.trim(); if(pc){ const r=applyPromo(pc,total,"POS"); if(r.error) return toast(r.error); total=r.amount; extra={discount:r.discount,promo:r.code}; usePromo(r.code); }
  if(method==="Wallet"){ if(cust.wallet<total) return toast("Insufficient wallet balance"); cust.wallet-=total; }
  cart.forEach(c=>db.products[c.i].stock-=c.qty);
  const rc=addPayment(cust?cust.name:"Walk-in",cart.map(c=>`${c.name} x${c.qty}`).join(", "),"POS",total,method,"Paid",extra);
  cart=[]; posCustomer=""; save(); render(); toast("Paid "+money(total)+" via "+method); if(confirm("Print receipt "+rc.or+"?")) printReceipt(rc); }

VIEWS.payments=()=>{
  const paid=db.payments.filter(p=>p.status==="Paid"&&p.amount>0).reduce((a,b)=>a+b.amount,0);
  const pend=db.payments.filter(p=>p.status==="Pending").reduce((a,b)=>a+b.amount,0);
  return `<div class="cards"><div class="card"><div class="label">Collected</div><div class="value">${money(paid)}</div></div>
  <div class="card"><div class="label">Pending</div><div class="value">${money(pend)}</div></div>
  <div class="card"><div class="label">Expired members to collect</div><div class="value">${db.members.filter(m=>memberStatus(m)==="Expired").length}</div></div></div>
  <div class="card"><div class="row" style="margin-bottom:8px"><span class="muted" style="flex:1">GCash / Maya: in the real system, use a payment gateway (e.g. PayMongo / Xendit) to generate QR or links. Status updates via webhook.</span><button class="btn sec" onclick="exportCsv()">${ic("download",14)} Export CSV</button></div>
  <table><thead><tr><th>OR No.</th><th>Date</th><th>Name</th><th>Item</th><th>Category</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>
  ${db.payments.slice(0,60).map((p,i)=>`<tr><td><span class="uid">${p.or||"-"}</span></td><td>${new Date(p.ts).toLocaleDateString()}</td><td>${esc(p.name)}</td><td>${esc(p.item)}</td><td>${p.cat}</td><td>${money(p.amount)}</td><td>${p.method}</td>
  <td><span class="badge ${p.status==="Paid"?"ok":p.status==="Pending"?"warn":p.status==="Void"?"gray":"bad"}" title="${esc(p.voidReason?"Voided by "+p.voidBy+": "+p.voidReason:"")}">${p.status}</span></td>
  <td style="white-space:nowrap"><button class="btn sm sec icon-btn" title="Receipt" onclick="printReceipt(db.payments[${i}])">${ic("printer",13)}</button>
  ${p.status==="Pending"||p.status==="Failed"?`<button class="btn sm green" onclick="db.payments[${i}].status='Paid';save();render()">Mark paid</button>`:""}
  ${p.status!=="Void"&&(role==="Owner"||role==="FrontDesk")?`<button class="btn sm sec icon-btn danger" title="Void (cancel) this receipt" onclick="voidPayment(${i})">${ic("ban",13)}</button>`:""}
  <button class="btn sm sec icon-btn" title="History" onclick="auditFor('${p.or||""}')">${ic("history",13)}</button></td></tr>`).join("")}</tbody></table>
  <p class="muted" style="margin-top:10px">Receipts cannot be deleted (BIR rule). Use Void to cancel one. It stays in the records with the reason and who voided it.</p></div>`;
};
function exportCsv(){ const rows=[["Date","Name","Item","Category","Amount","Method","Status"],...db.payments.map(p=>[new Date(p.ts).toISOString(),p.name,p.item,p.cat,p.amount,p.method,p.status])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="payments.csv"; a.click(); }

VIEWS.notifications=()=>`
  <div class="grid2e"><div class="card"><h2>Send SMS</h2>
  <button class="btn" onclick="smsExpiring()">${ic("send",14)} Remind expiring & expired members</button>
  <button class="btn sec" onclick="smsInactive()" style="margin-top:6px">${ic("send",14)} "We miss you" to inactive members (14+ days)</button>
  <h2 style="margin-top:14px">Broadcast</h2><textarea id="bcTxt" rows="4" placeholder="e.g. Closed on Nov 1 for All Saints' Day"></textarea><button class="btn" onclick="broadcast()">Send to all members</button>
  <p class="muted" style="margin-top:8px">Auto SMS already sent by the system: expiry reminder on Time In, parent notification on Time In/Out, renewal receipt, waitlist slot opened. Real system: connect an SMS gateway such as Semaphore or Twilio.</p></div>
  <div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0;flex:1">Outbox (${db.sms.length})</h2>${db.sms.length?`<button class="btn sm sec" style="flex:0 0 auto" onclick="clearSms()">${ic("trash",13)} Clear all</button>`:""}</div>
  ${db.sms.slice(0,40).map((s,i)=>`<div class="list-item"><span style="flex:1"><b>${esc(s.to)}</b><div class="muted">${esc(s.msg)}</div></span><span class="muted">${fmtTime(s.ts)}</span>${delBtn(`delSms(${i})`)}</div>`).join("")||`<p class="muted">No messages yet.</p>`}</div></div>`;
function smsExpiring(){ let n=0; db.members.forEach(m=>{const st=memberStatus(m); if(st==="Expiring"||st==="Expired"){ sendSms(m.phone,`${db.settings.gymName}: Hi ${m.name}, your ${m.plan} plan ${st==="Expired"?"expired":"expires"} on ${m.exp}. Renew now at the kiosk!`); n++; }}); save(); render(); toast(n+" reminders sent"); }
function smsInactive(){ let n=0; db.members.filter(m=>daysUntil(m.lastVisit)<=-14).forEach(m=>{ sendSms(m.phone,`${db.settings.gymName}: We miss you, ${m.name}! Balik ka na, may 10% off ka sa next renewal.`); n++; }); save(); render(); toast(n+" messages sent"); }
function broadcast(){ const t=$("bcTxt").value.trim(); if(!t) return; db.members.forEach(m=>sendSms(m.phone,`${db.settings.gymName}: ${t}`)); save(); render(); toast("Broadcast sent to "+db.members.length); }

VIEWS.reports=()=>{
  const paid=db.payments.filter(p=>p.status==="Paid"&&p.amount>0&&(repBranch==="All"||(p.branch||db.settings.branch)===repBranch));
  const by=(k)=>{const o={}; paid.forEach(p=>o[p[k]]=(o[p[k]]||0)+p.amount); return Object.entries(o).sort((a,b)=>b[1]-a[1]);};
  const tot=paid.reduce((a,b)=>a+b.amount,0)||1;
  const days=[]; for(let d=6;d>=0;d--){ const s=new Date(addDays(-d)+"T00:00:00").getTime(); days.push([addDays(-d).slice(5), db.logs.filter(l=>l.ts>=s&&l.ts<s+86400000&&l.action==="Time In").length]); }
  const dmax=Math.max(1,...days.map(d=>d[1]));
  const plans={}; db.members.forEach(m=>plans[m.plan]=(plans[m.plan]||0)+1);
  const sevenAgo=new Date(addDays(-6)+"T00:00:00").getTime();
  return `<div class="row" style="margin-bottom:14px"><span style="flex:0 0 auto" class="muted">Branch</span><select style="max-width:220px;margin:0" onchange="repBranch=this.value;render();animate()"><option>All</option>${db.branches.map(b=>`<option ${b.name===repBranch?"selected":""}>${esc(b.name)}</option>`).join("")}</select>
  <span class="muted">Total revenue: <b style="color:var(--ink)">${money(paid.reduce((a,b)=>a+b.amount,0))}</b></span></div>
  <div class="grid2e">
  <div class="card"><h2>Revenue by category</h2>${donut(by("cat"),{fmt:kfmt,center:"Revenue"})}</div>
  <div class="card"><h2>Revenue by payment method</h2>${donut(by("method"),{fmt:kfmt,center:"Revenue"})}</div>
  <div class="card"><h2>Attendance (last 7 days)</h2>${areaChart(days,{unit:" visits"})}</div>
  <div class="card"><h2>Peak hours (last 7 days)</h2>${peakChart(sevenAgo)}</div>
  <div class="card"><h2>Members per plan</h2>${donut(Object.entries(plans),{center:"Members"})}</div>
  <div class="card"><h2>Inactive members (14+ days)</h2>${db.members.filter(m=>daysUntil(m.lastVisit)<=-14).map(m=>`<div class="list-item"><span>${esc(m.name)}</span><span class="muted">last visit ${m.lastVisit}</span></div>`).join("")||`<p class="muted">None</p>`}</div>
  </div><button class="btn sec" onclick="exportCsv()">${ic("download",14)} Export payments CSV</button> <button class="btn sec" onclick="window.print()">${ic("printer",14)} Print report</button>`;
};

VIEWS.branches=()=>`
  <div class="cards">${db.branches.map((b,i)=>{const n=db.members.filter(m=>m.branch===b.name).length; return `<div class="card">${b.name===db.settings.branch?"":`<div class="card-tools">${delBtn(`delBranch(${i})`,"Delete branch")}</div>`}<div class="label">${esc(b.addr)}</div><div class="value" style="font-size:20px">${esc(b.name)}</div><div class="muted">${n} home members</div>
  ${b.name===db.settings.branch?`<span class="badge ok">Main branch</span>`:`<button class="btn sm sec" onclick="db.settings.branch='${esc(b.name)}';save();render()">Set as main</button>`}</div>`;}).join("")}</div>
  <div class="card"><div class="row"><input id="brN" placeholder="Branch name"><input id="brA" placeholder="Address"><button class="btn" onclick="addBranch()">+ Add Branch</button></div>
  <p class="muted">One RFID card works in all branches. All branches share one member database (cloud), each branch has its own turnstiles and door locks.</p></div>`;
function addBranch(){ const n=$("brN").value.trim(); if(!n) return; db.branches.push({name:n,addr:$("brA").value}); save(); render(); }

VIEWS.users=()=>`
  <div class="card"><h2>Staff accounts</h2><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
  ${db.users.map(u=>`<tr><td>${esc(u.name)}${ME&&ME.username===u.username?' <span class="badge ok">You</span>':""}</td><td class="uid">${esc(u.username||"-")}</td><td><span class="badge info">${u.role}</span></td><td class="muted">${ROLES[u.role].map(p=>PAGES.find(x=>x[0]===p)[2]).join(", ")}</td>
  <td style="white-space:nowrap"><button class="btn sm sec icon-btn" title="Activity" onclick="auditFor('${esc(u.name)}')">${ic("history",13)}</button> ${ME&&ME.username===u.username?"":delBtn(`delUser('${esc(u.username)}','${esc(u.name)}')`,"Delete account")}</td></tr>`).join("")}</tbody></table>
  <div class="row" style="margin-top:10px"><input id="uN" placeholder="Name"><select id="uR">${Object.keys(ROLES).map(r=>`<option>${r}</option>`).join("")}</select><button class="btn" onclick="addUser()">+ Add</button></div>
  <p class="muted">${SERVER?"Each account logs in with its own username and password. Access follows the role.":"Offline demo: use the role selector at the top right to preview what each role sees."}</p></div>`;
function addUser(){ const n=$("uN").value.trim(); if(!n) return;
  if(!SERVER){ const username=prompt("Login username for "+n,n.toLowerCase().replace(/[^a-z0-9]/g,"")); if(!username) return;
    if(db.users.some(u=>u.username===username)) return toast("Username already exists");
    const pw=prompt("Password (min 6 characters). Offline demo only, saved in this browser."); if(!pw||pw.length<6) return toast("Password must be at least 6 characters");
    db.users.push({username,name:n,role:$("uR").value,pwDemo:pw}); save(); render(); return; }
  const username=prompt("Login username for "+n,n.toLowerCase().replace(/[^a-z0-9]/g,"")); if(!username) return;
  const password=prompt("Temporary password (min 6 characters)"); if(!password) return;
  API("/api/users",{method:"POST",body:JSON.stringify({username,name:n,role:$("uR").value,password})}).then(()=>toast("Account created: "+username)).catch(e=>toast(e.message)); }

VIEWS.settings=()=>`
  <div class="grid2e"><div class="card"><h2>General</h2>
  <label class="muted">Gym name</label><input value="${esc(db.settings.gymName)}" onchange="db.settings.gymName=this.value;save()">
  <label class="muted">Max occupancy (turnstile blocks entry when full)</label><input type="number" value="${db.settings.maxOcc}" onchange="db.settings.maxOcc=Number(this.value);save()">
  <label class="muted">Kiosk auto-logout (seconds)</label><input type="number" value="${db.settings.kioskTimeout}" onchange="db.settings.kioskTimeout=Number(this.value);save()">
  <label class="row" style="margin:6px 0"><input type="checkbox" style="flex:0;width:auto;margin:0" ${db.settings.webcam?"checked":""} onchange="db.settings.webcam=this.checked;save()"> Take webcam snapshot on every tap (gate screen)</label>
  <h2 style="margin-top:16px">Face ID</h2>
  <label class="row" style="margin:6px 0"><input type="checkbox" style="flex:0;width:auto;margin:0" ${db.settings.faceId?"checked":""} onchange="db.settings.faceId=this.checked;save()"> Enable face recognition on the gate screen</label>
  <label class="muted">Match strictness (lower = stricter, recommended 0.45 - 0.55)</label><input type="number" step="0.01" min="0.3" max="0.7" value="${db.settings.faceThreshold}" onchange="db.settings.faceThreshold=Number(this.value);save()">
  <h2 style="margin-top:16px">Referral program</h2>
  <div class="row"><div><label class="muted">Reward to referrer (₱ wallet)</label><input type="number" value="${db.settings.refReward}" onchange="db.settings.refReward=Number(this.value);save()"></div>
  <div><label class="muted">Discount for new member (%)</label><input type="number" value="${db.settings.refDiscount}" onchange="db.settings.refDiscount=Number(this.value);save()"></div></div>
  <button class="btn red" onclick="if(confirm('Reset ALL data back to the sample data?')){resetDb();render();}">Reset demo data</button></div>
  <div class="card"><h2>Business / BIR details</h2>
  <label class="muted">Address (printed on receipts)</label><input value="${esc(db.settings.address)}" onchange="db.settings.address=this.value;save()">
  <label class="muted">TIN</label><input value="${esc(db.settings.tin)}" onchange="db.settings.tin=this.value;save()">
  <label class="row" style="margin:6px 0"><input type="checkbox" style="flex:0;width:auto;margin:0" ${db.settings.vatRegistered?"checked":""} onchange="db.settings.vatRegistered=this.checked;save()"> VAT registered (12% VAT-inclusive)</label>
  ${SERVER?`<h2 style="margin-top:16px">My password</h2><div class="row"><input id="pwO" type="password" placeholder="Current password"><input id="pwN" type="password" placeholder="New password (min 6)"><button class="btn sec" onclick="changePw()">Change</button></div>`:""}
  <h2 style="margin-top:16px">Plans & access areas</h2><table><thead><tr><th>Plan</th><th>Price</th><th>Days</th><th>Areas</th></tr></thead><tbody>
  ${Object.entries(PLANS).map(([k,v])=>`<tr><td>${k}</td><td>${money(v.price)}</td><td>${v.days}</td><td class="muted">${v.areas.join(", ")}</td></tr>`).join("")}</tbody></table>
  <h2 style="margin-top:14px">Devices</h2>${db.devices.map((d,i)=>`<div class="list-item"><span>${esc(d.name)} · ${d.type} · ${d.area}</span><label><input type="checkbox" style="width:auto;margin:0" ${d.online?"checked":""} onchange="db.devices[${i}].online=this.checked;save()"> online</label></div>`).join("")}</div></div>`;

function changePw(){ API("/api/password",{method:"POST",body:JSON.stringify({old:$("pwO").value,new:$("pwN").value})}).then(()=>{toast("Password changed");$("pwO").value=$("pwN").value="";}).catch(e=>toast(e.message)); }

// ---------- new pages ----------
VIEWS.packages=()=>{
  const withS=db.members.filter(m=>(m.sessions||[]).some(s=>s.left>0));
  return `<div class="grid2"><div class="card"><h2>Active packages</h2><table><thead><tr><th></th><th>Member</th><th>Package</th><th>Sessions left</th><th>Expires</th><th></th></tr></thead><tbody>
  ${withS.flatMap(m=>m.sessions.map((s,i)=>s.left>0?`<tr><td>${avatar(m,30)}</td><td>${esc(m.name)}</td><td>${esc(s.name)}</td>
    <td><b>${s.left}</b> / ${s.total}<div class="bar" style="margin-top:4px"><div style="width:${s.left/s.total*100}%"></div></div></td><td>${s.exp||"-"}</td>
    <td style="white-space:nowrap"><button class="btn sm" onclick="useSess('${m.id}',${i})">Use 1 session</button> ${delBtn(`delSession('${m.id}',${i})`,"Remove package")}</td></tr>`:"")).join("")||'<tr><td colspan="6" class="muted">No active packages.</td></tr>'}</tbody></table></div>
  <div class="card"><h2>Sell package</h2><select id="pkM">${memberOptions()}</select>
  <select id="pkT">${db.packageTypes.map((t,i)=>`<option value="${i}">${esc(t.name)} · ${t.sessions} sessions · ${money(t.price)}</option>`).join("")}</select>
  <input id="pkP" placeholder="Promo code (optional)"><select id="pkPay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card</option><option>Wallet</option></select>
  <button class="btn" style="width:100%" onclick="sellPkg()">Sell package</button>
  <h2 style="margin-top:18px">Package types</h2>${db.packageTypes.map((t,i)=>`<div class="list-item"><span style="flex:1">${esc(t.name)}<div class="muted">${t.sessions} sessions · valid ${t.days} days</div></span><b>${money(t.price)}</b>${delBtn(`delPkgType(${i})`)}</div>`).join("")}
  <div class="row" style="margin-top:8px"><input id="ptN" placeholder="Name"><input id="ptS" type="number" placeholder="Sessions"><input id="ptP" type="number" placeholder="Price"><button class="btn sec" onclick="addPkgType()">Add</button></div></div></div>`;
};
function sellPkg(){ const m=memberById($("pkM").value), i=Number($("pkT").value), t=db.packageTypes[i], method=$("pkPay").value; let amt=t.price, extra={};
  const pc=$("pkP").value.trim(); if(pc){ const r=applyPromo(pc,amt,"Training"); if(r.error) return toast(r.error); amt=r.amount; extra={discount:r.discount,promo:r.code}; usePromo(r.code); }
  if(method==="Wallet"){ if(m.wallet<amt) return toast("Insufficient wallet"); m.wallet-=amt; }
  const rc=buyPackage(m,i,method,amt,extra); save(); render(); toast(t.name+" sold to "+m.name); if(confirm("Print receipt "+rc.or+"?")) printReceipt(rc); }
function useSess(id,i){ const m=memberById(id); if(useSession(m,i,ME?ME.name:"Trainer")){ save(); render(); toast("Session used. "+m.sessions[i].left+" left"); } }
function addPkgType(){ const n=$("ptN").value.trim(), s=Number($("ptS").value), p=Number($("ptP").value); if(!n||!s||!p) return toast("Fill in name, sessions and price"); db.packageTypes.push({name:n,sessions:s,price:p,days:90}); save(); render(); }

VIEWS.promos=()=>{
  const refs=db.members.filter(m=>m.referredBy);
  return `<div class="grid2"><div class="card"><h2>Promo codes</h2><table><thead><tr><th>Code</th><th>Discount</th><th>Valid for</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>
  ${db.promos.map((p,i)=>`<tr><td><span class="uid"><b>${esc(p.code)}</b></span><div class="muted">${esc(p.note||"")}</div></td><td>${p.type==="%"?p.value+"%":money(p.value)}</td><td class="muted">${(p.cats||[]).join(", ")||"All"}</td>
  <td>${p.used}${p.max?" / "+p.max:""}</td><td>${p.expires||"-"}</td><td><span class="badge ${p.active?"ok":"gray"}">${p.active?"Active":"Off"}</span></td>
  <td style="white-space:nowrap"><button class="btn sm sec" onclick="db.promos[${i}].active=!db.promos[${i}].active;save();render()">${p.active?"Disable":"Enable"}</button> ${delBtn(`delPromo(${i})`)}</td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h2>New promo code</h2><input id="prC" placeholder="Code e.g. SUMMER25" style="text-transform:uppercase">
  <div class="row"><select id="prT"><option value="%">Percent %</option><option value="fixed">Fixed ₱</option></select><input id="prV" type="number" placeholder="Value"></div>
  <select id="prK"><option value="">All items</option><option>Membership</option><option>Courts</option><option>Day Pass</option><option>Training</option><option>POS</option></select>
  <div class="row"><input id="prM" type="number" placeholder="Max uses (0 = no limit)"><input id="prE" type="date"></div><input id="prN" placeholder="Note">
  <button class="btn" style="width:100%" onclick="addPromo()">Create promo</button></div></div>
  <div class="card"><h2>Referrals</h2><p class="muted" style="margin-bottom:10px">Every member has a referral code. New member gets ${db.settings.refDiscount}% off, the referrer gets ${money(db.settings.refReward)} in their wallet.</p>
  <table><thead><tr><th>New member</th><th>Referred by</th><th>Code used</th><th>Joined</th></tr></thead><tbody>
  ${refs.map(m=>{const r=memberById(m.referredBy); return `<tr><td>${esc(m.name)}</td><td>${esc(r?r.name:"-")}</td><td class="uid">${esc(r?r.refCode:"")}</td><td>${m.lastVisit}</td></tr>`;}).join("")||'<tr><td colspan="4" class="muted">No referrals yet. Add a member with a referral code (e.g. '+esc(db.members[0].refCode)+').</td></tr>'}</tbody></table></div>`;
};
function addPromo(){ const c=$("prC").value.trim().toUpperCase(), v=Number($("prV").value);
  if(!/^[A-Z0-9]{3,20}$/.test(c)) return toast("Code: 3-20 letters/numbers"); if(!v) return toast("Enter a value"); if(db.promos.some(p=>p.code===c)) return toast("Code already exists");
  db.promos.unshift({code:c,type:$("prT").value,value:v,cats:$("prK").value?[$("prK").value]:[],active:true,used:0,max:Number($("prM").value)||0,expires:$("prE").value,note:$("prN").value}); save(); render(); }

let birDate=today();
VIEWS.bir=()=>{
  const s=new Date(birDate+"T00:00:00").getTime(), e=s+86400000;
  const rows=db.payments.filter(p=>p.ts>=s&&p.ts<e&&p.or).sort((a,b)=>a.ts-b.ts);
  const paid=rows.filter(p=>p.status==="Paid"&&p.amount>0);
  const gross=paid.reduce((a,b)=>a+b.amount,0), disc=paid.reduce((a,b)=>a+(b.discount||0),0), v=vatOf(gross);
  const byM={}; paid.forEach(p=>byM[p.method]=(byM[p.method]||0)+p.amount);
  return `<div class="row" style="margin-bottom:14px"><span class="muted" style="flex:0 0 auto">Date</span><input type="date" value="${birDate}" style="max-width:200px;margin:0" onchange="birDate=this.value;render();animate()">
  <button class="btn sec" onclick="printZ()">${ic("printer",14)} Print Z-reading</button><button class="btn sec" onclick="exportJournal()">${ic("download",14)} Sales journal CSV</button></div>
  <div class="cards"><div class="card"><div class="label">Gross sales</div><div class="value">${money(gross)}</div></div>
  <div class="card"><div class="label">VATable sales</div><div class="value">${money(v.vatable)}</div></div>
  <div class="card"><div class="label">VAT (12%)</div><div class="value">${money(v.vat)}</div></div>
  <div class="card"><div class="label">Discounts</div><div class="value">${money(disc)}</div></div></div>
  <div class="grid2"><div class="card"><h2>Sales journal · ${birDate}</h2><table><thead><tr><th>OR No.</th><th>Time</th><th>Customer</th><th>Item</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(p=>`<tr><td class="uid">${p.or}</td><td>${fmtTime(p.ts)}</td><td>${esc(p.name)}</td><td>${esc(p.item)}</td><td>${money(p.amount)}</td><td><span class="badge ${p.status==="Paid"?"ok":"warn"}">${p.status}</span></td><td><button class="btn sm sec" onclick='printReceipt(db.payments.find(x=>x.or==="${p.or}"))'>${ic("printer",13)}</button></td></tr>`).join("")||'<tr><td colspan="7" class="muted">No receipts on this date.</td></tr>'}</tbody></table></div>
  <div class="card"><h2>Z-reading summary</h2>
  <div class="list-item"><span>OR range</span><b class="uid">${rows.length?rows[0].or+" – "+rows[rows.length-1].or:"-"}</b></div>
  <div class="list-item"><span>Transactions</span><b>${paid.length}</b></div>
  ${Object.entries(byM).map(([k,v])=>`<div class="list-item"><span>${k}</span><b>${money(v)}</b></div>`).join("")}
  <div class="list-item"><span>Last OR issued</span><b class="uid">OR-${String(db.orSeq).padStart(6,"0")}</b></div>
  <p class="muted" style="margin-top:10px">For BIR compliance, the POS/receipt system must be accredited (Permit to Use / CAS). Consult your accountant before going live.</p></div></div>`;
};
function printZ(){ const s=new Date(birDate+"T00:00:00").getTime(); const paid=db.payments.filter(p=>p.ts>=s&&p.ts<s+86400000&&p.or&&p.status==="Paid"&&p.amount>0);
  const g=paid.reduce((a,b)=>a+b.amount,0), v=vatOf(g); const byM={}; paid.forEach(p=>byM[p.method]=(byM[p.method]||0)+p.amount);
  const w=window.open("","_blank","width=380,height=640"); w.document.write(`<html><body style="font-family:Consolas,monospace;width:300px;margin:20px auto;font-size:12.5px"><h3 style="text-align:center;margin:0">${esc(db.settings.gymName)}</h3><p style="text-align:center">TIN ${esc(db.settings.tin)}<br>Z-READING · ${birDate}</p><hr>
  ${[["Transactions",paid.length],["Gross sales",money(g)],["VATable sales",money(v.vatable)],["VAT 12%",money(v.vat)],["Discounts",money(paid.reduce((a,b)=>a+(b.discount||0),0))],...Object.entries(byM).map(([k,x])=>[k,money(x)])].map(([k,x])=>`<div style="display:flex;justify-content:space-between"><span>${k}</span><span>${x}</span></div>`).join("")}
  <hr><p style="text-align:center">Printed ${new Date().toLocaleString()}</p><script>print()<\/script></body></html>`); w.document.close(); }
function exportJournal(){ const rows=[["OR","Date","Customer","Item","Category","Gross","VATable","VAT","Discount","Method","Status","Branch"],...db.payments.filter(p=>p.or).slice().reverse().map(p=>{const v=vatOf(p.amount); return [p.or,new Date(p.ts).toISOString(),p.name,p.item,p.cat,p.amount,v.vatable,v.vat,p.discount||0,p.method,p.status,p.branch||""];})];
  const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const l=document.createElement("a"); l.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); l.download="sales-journal.csv"; l.click(); }

let sysInfo=null, auditRows=null;
VIEWS.devices=()=>{
  if(SERVER&&!sysInfo){ API("/api/info").then(r=>{sysInfo=r; if(page==="devices") render();}).catch(()=>{}); }
  const base=location.origin.startsWith("http")?location.origin:"http://SERVER-IP:3000";
  return `<div class="cards"><div class="card"><div class="label">Mode</div><div class="value" style="font-size:20px">${SERVER?"Central server":"Offline demo"}</div><div class="trend">${SERVER?"All screens share one database":"Run server/server.js to centralize"}</div></div>
  <div class="card"><div class="label">Database</div><div class="value" style="font-size:16px">${SERVER&&sysInfo?esc(sysInfo.storage):SERVER?"...":"Browser storage"}</div></div>
  <div class="card"><div class="label">Connected screens</div><div class="value">${sysInfo?sysInfo.clients:"-"}</div></div></div>
  <div class="card"><h2>Turnstile / door controllers</h2><table><thead><tr><th>Device</th><th>Type</th><th>Area</th><th>Status</th><th>Last seen</th><th>Device key</th><th></th></tr></thead><tbody>
  ${db.devices.map((d,i)=>`<tr><td>${esc(d.name)}</td><td>${d.type}</td><td>${d.area}</td><td><span class="badge ${d.online?"ok":"bad"}">${d.online?"Online":"Offline"}</span></td><td class="muted">${d.lastSeen?new Date(d.lastSeen).toLocaleString():"-"}</td>
  <td><span class="uid">${esc(d.key||"-")}</span></td><td style="white-space:nowrap"><button class="btn sm sec" onclick="if(confirm('Generate a new key? The old key stops working.')){db.devices[${i}].key=randKey();save();render()}">New key</button> ${delBtn(`delDevice('${d.id}')`)}</td></tr>`).join("")}</tbody></table>
  <div class="row" style="margin-top:10px"><input id="dvN" placeholder="Device name"><select id="dvT"><option>Turnstile</option><option>Door lock</option><option>Smart locker</option></select>
  <select id="dvA"><option>Gym</option><option>Courts</option><option>Boxing Area</option><option>Lockers</option></select><button class="btn sec" onclick="addDevice()">Add device</button></div></div>
  <div class="grid2e"><div class="card"><h2>Controller API (ESP32 / turnstile)</h2>
  <p class="muted">Tap: <span class="uid">POST ${esc(base)}/api/device/tap</span></p><p class="muted">Header <span class="uid">X-Device-Key: &lt;device key&gt;</span>, body <span class="uid">{"uid":"0004512345","mode":"in"}</span></p>
  <p class="muted" style="margin-top:6px">Reply <span class="uid">{"open":true,"action":"Time In","name":"..."}</span>. Open the relay when <b>open</b> is true.</p>
  <p class="muted" style="margin-top:6px">Offline cache: <span class="uid">GET /api/device/allowlist</span> · upload offline taps: <span class="uid">POST /api/device/sync</span></p>
  <p class="muted" style="margin-top:6px">Ready-made ESP32 code: <span class="uid">hardware/esp32_turnstile.ino</span></p></div>
  <div class="card"><h2>Screens & links</h2>${sysInfo&&sysInfo.lan.length?sysInfo.lan.map(u=>`<div class="list-item"><span>Admin</span><span class="uid">${u}/</span></div><div class="list-item"><span>Kiosk</span><span class="uid">${u}/kiosk.html</span></div><div class="list-item"><span>Gate</span><span class="uid">${u}/kiosk.html?mode=gate</span></div><div class="list-item"><span>Member app</span><span class="uid">${u}/member.html</span></div>`).join(""):'<p class="muted">Start the central server to see network links.</p>'}</div></div>
  ${SERVER&&ME&&ME.role==="Owner"?`<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0;flex:1">Backup & audit log</h2><button class="btn sec" onclick="location.href='/api/backup?token='+TOKEN">${ic("download",14)} Download backup</button><button class="btn sec" onclick="go('audit')">${ic("list",14)} Open audit trail</button></div>
  <p class="muted">Automatic backup every 6 hours in server/backups (last 30 kept).</p>
  ${auditRows?`<table style="margin-top:10px"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>${auditRows.slice(0,80).map(r=>`<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${esc(r.user)}</td><td>${esc(r.action)}</td><td class="muted">${esc(r.detail)}</td></tr>`).join("")}</tbody></table>`:""}</div>`:""}`;
};
function addDevice(){ const n=$("dvN").value.trim(); if(!n) return; db.devices.push({id:"D"+Date.now().toString().slice(-5),name:n,type:$("dvT").value,area:$("dvA").value,main:$("dvT").value==="Turnstile"&&!db.devices.some(d=>d.main),online:false,key:randKey()}); save(); render(); }

// ---------- Audit Trail ----------
let auditQ="", auditUser="", auditAct="", auditFrom=addDays(-30), auditTo=today(), auditData=null, auditLoading=false;
VIEWS.audit=()=>{
  if(SERVER&&!auditData&&!auditLoading) loadAudit();
  let rows=SERVER?(auditData?auditData.audit:[]):localAuditRows();
  const users=SERVER?(auditData?auditData.users:[]):[...new Set((db.auditLog||[]).map(r=>r.user))].sort();
  if(auditAct) rows=rows.filter(r=>auditType(r.action)===auditAct);
  const count=t=>rows.filter(r=>auditType(r.action)===t).length;
  return `<div class="cards">
    <div class="card"><div class="label">Records</div><div class="value">${rows.length}</div><div class="trend">${auditFrom} to ${auditTo}</div></div>
    <div class="card"><div class="label">Added</div><div class="value">${count("add")}</div></div>
    <div class="card"><div class="label">Edited</div><div class="value">${count("edit")}</div></div>
    <div class="card"><div class="label">Deleted / voided</div><div class="value">${count("del")}</div></div></div>
  <div class="card"><div class="row" style="margin-bottom:12px">
    <input id="auQ" placeholder="Search name, action, OR no., product..." value="${esc(auditQ)}" onkeydown="if(event.key==='Enter'){auditQ=this.value;reloadAudit()}" onchange="auditQ=this.value;reloadAudit()">
    <select onchange="auditUser=this.value;reloadAudit()"><option value="">All users</option>${users.map(u=>`<option ${u===auditUser?"selected":""}>${esc(u)}</option>`).join("")}</select>
    <select onchange="auditAct=this.value;render()">${[["","All actions"],["add","Added"],["edit","Edited / changed"],["del","Deleted / voided"],["access","Access & taps"],["login","Logins"],["other","Others"]].map(([v,l])=>`<option value="${v}" ${v===auditAct?"selected":""}>${l}</option>`).join("")}</select>
    <input type="date" value="${auditFrom}" onchange="auditFrom=this.value;reloadAudit()"><input type="date" value="${auditTo}" onchange="auditTo=this.value;reloadAudit()">
    <button class="btn sec" onclick="reloadAudit()">${ic("refresh",14)}</button><button class="btn sec" onclick="exportAudit()">${ic("download",14)} CSV</button></div>
  ${auditLoading?'<p class="muted">Loading...</p>':""}
  <table><thead><tr><th>Date & time</th><th>User</th><th>Screen</th><th>Action</th><th>Details</th></tr></thead><tbody>
  ${rows.slice(0,500).map(r=>`<tr><td style="white-space:nowrap">${new Date(r.ts).toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</td>
    <td>${esc(r.user)}</td><td><span class="badge gray">${esc(r.screen||"-")}</span></td><td><span class="badge ${({add:"ok",edit:"warn",del:"bad",access:"info",login:"info"})[auditType(r.action)]||"gray"}">${esc(r.action)}</span></td>
    <td class="audit-d">${esc(r.detail)}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">No records for this filter.</td></tr>'}</tbody></table>
  ${rows.length>500?`<p class="muted" style="margin-top:8px">Showing the latest 500. Export CSV for all ${rows.length}.</p>`:""}
  <p class="muted" style="margin-top:10px">Every change is recorded automatically with who did it, when and from which screen (admin, kiosk, gate, member app, turnstile). Records cannot be edited or deleted.</p></div>`;
};
function auditType(a){ a=String(a).toLowerCase();
  return a.startsWith("deleted")||a.includes("void")||a.includes("reset")||a.includes("cleared")?"del": a.startsWith("added")?"add": a.startsWith("edited")||a.startsWith("changed")?"edit":
    a.includes("tap")||a.includes("time out")||a.includes("remote")?"access": a.includes("login")||a.includes("logout")||a.includes("password")?"login":"other"; }
function reloadAudit(){ const q=$("auQ"); if(q) auditQ=q.value; auditData=null; render(); }
function auditRange(){ return [new Date(auditFrom+"T00:00:00").getTime(),new Date(auditTo+"T23:59:59.999").getTime()]; }
function loadAudit(){ auditLoading=true; const [f,t]=auditRange();
  API("/api/audit?"+new URLSearchParams({q:auditQ,user:auditUser,from:f,to:t,limit:5000})).then(r=>{ auditData=r; })
    .catch(e=>{ auditData={audit:[],users:[]}; toast(e.message); }).finally(()=>{ auditLoading=false; if(page==="audit") render(); }); }
function localAuditRows(){ const [f,t]=auditRange(), q=auditQ.toLowerCase();
  return (db.auditLog||[]).filter(r=>r.ts>=f&&r.ts<=t&&(!auditUser||r.user===auditUser)&&(!q||(r.user+" "+r.action+" "+r.detail+" "+r.screen).toLowerCase().includes(q))); }
function exportAudit(){ let rows=SERVER?(auditData?auditData.audit:[]):localAuditRows(); if(auditAct) rows=rows.filter(r=>auditType(r.action)===auditAct);
  const csv=[["Date","User","Screen","Action","Details"],...rows.map(r=>[new Date(r.ts).toISOString(),r.user,r.screen||"",r.action,r.detail])].map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const l=document.createElement("a"); l.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); l.download=`audit-trail-${auditFrom}-to-${auditTo}.csv`; l.click(); }

$("roleSel").onchange=e=>{ role=e.target.value; render(); };
$("branchSel").onchange=e=>{ localStorage.setItem("fe_branch",e.target.value); toast("This screen is now set to "+e.target.value); };
boot().then(()=>{
  if(ME){ role=ME.role; $("roleSel").style.display="none"; $("roleLbl").style.display="none";
    $("who").innerHTML=`${SERVER?'<span class="sync on" id="syncDot" title="Live sync with the central server"></span>':'<span class="badge warn" title="Run start-server.bat to centralize">Offline demo</span>'}
      <span class="avatar-sm">${esc(ME.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase())}</span><span>${esc(ME.name)} <span class="muted">· ${ME.role}</span></span>
      <button class="btn sm sec" onclick="logoutStaff()">${ic("logout",13)} Logout</button>`; }
  render(); animate();
});
setInterval(()=>{ if(page==="access"&&lastTap&&Date.now()-lastTap.ts>8000&&Date.now()-lastTap.ts<9500) window.onDbChange(); },1000);
