// ===== Member mobile app (talks to the central server) =====
const $=id=>document.getElementById(id);
let MT=localStorage.getItem("fe_member_token"), B=null, tab="home", bookSeg="classes", sheet=null;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(toast.t); toast.t=setTimeout(()=>t.style.display="none",3000); }
function mapi(path,opt={}){
  return fetch(path,{...opt,headers:{"Content-Type":"application/json",...(MT?{Authorization:"Bearer "+MT}:{})}})
    .then(async r=>{ const j=await r.json().catch(()=>({})); if(r.status===401&&MT){ MT=null; localStorage.removeItem("fe_member_token"); render(); } if(!r.ok) throw new Error(j.error||r.statusText); return j; });
}
async function load(){ try{ B=await mapi("/api/member/me"); }catch(e){ B=null; if(MT) toast(e.message); } render(); }
async function act(body){ try{ const r=await mapi("/api/member/action",{method:"POST",body:JSON.stringify(body)}); B=r.bundle; sheet=null; render(); toast(r.msg);
  if(r.receipt) setTimeout(()=>{ if(confirm(`Paid ${money(r.receipt.amount)}. Receipt ${r.receipt.or}. Open receipt?`)) openReceipt(r.receipt.or); },300); }
  catch(e){ toast(e.message); } }
function openReceipt(or){ window.open(`/api/member/receipt?or=${encodeURIComponent(or)}&token=${encodeURIComponent(MT)}`,"_blank"); }

// ---------- login ----------
function loginView(){
  const offline=!location.protocol.startsWith("http");
  return `<div class="login"><div class="lg-grid"></div>
  <div class="lg-card">
    <div class="lg-brand"><span class="mark">FE</span><div>Fitness Exclusive<small>Member app</small></div></div>
    <div class="lg-hero">${ic("dumbbell",30)}</div>
    <h1>Welcome back</h1>
    <p class="lg-sub">Log in with your member ID or mobile number and PIN.</p>
    ${offline?`<div class="lg-warn">${ic("alert",18)}<div><b>Server not running</b><span>The member app needs the central server. Double-click <b>start-server.bat</b>, then open <b>localhost:3000/member.html</b>.</span></div></div>`:""}
    <form id="lf">
      <label>Member ID or mobile</label>
      <div class="lg-field">${ic("user",18)}<input id="li" placeholder="e.g. M001" autocomplete="username" autocapitalize="characters"></div>
      <label>PIN</label>
      <div class="lg-field">${ic("lock",18)}<input id="lp" type="password" inputmode="numeric" maxlength="6" placeholder="4-6 digit PIN" autocomplete="current-password">
        <button type="button" class="lg-eye" onclick="const p=$('lp');p.type=p.type==='password'?'text':'password';this.innerHTML=ic(p.type==='password'?'eye':'eyeoff',18)">${ic("eye",18)}</button></div>
      <button class="btn lg-btn" type="submit" ${offline?"disabled":""}>Log in ${ic("arrow",18)}</button>
    </form>
    <div class="lg-demo">${ic("tag",14)} Demo: <b>M001</b> · PIN <b>1234</b></div>
    <p class="lg-foot">New member? Register at the kiosk in the lobby.</p>
  </div></div>`;
}
async function doLogin(ev){ ev.preventDefault();
  try{ const r=await fetch("/api/member/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:$("li").value,pin:$("lp").value})}); const j=await r.json();
    if(!r.ok) throw new Error(j.error); MT=j.token; localStorage.setItem("fe_member_token",MT); await load(); }
  catch(e){ toast(e.message==="Failed to fetch"?"Cannot reach the server":e.message); } }

// ---------- views ----------
const V={};
function ring(pct,label){ const R=26,C=2*Math.PI*R; return `<div class="ring"><svg width="64" height="64"><circle cx="32" cy="32" r="${R}" fill="none" stroke="#f0f0f0" stroke-width="6"/><circle cx="32" cy="32" r="${R}" fill="none" stroke="#dc2626" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C*pct} ${C}" style="transition:stroke-dasharray 1s"/></svg><b>${label}</b></div>`; }
V.home=()=>{ const m=B.me, d=Math.max(0,daysUntil(m.exp)), tot=(B.plans[m.plan]||{days:30}).days;
  const sess=(m.sessions||[]).filter(s=>s.left>0).reduce((a,s)=>a+s.left,0);
  const visits=B.logs.filter(l=>l.action==="Time In").length;
  return `<div class="top"><div class="row1"><div><div class="hello">${new Date().getHours()<12?"Good morning":new Date().getHours()<18?"Good afternoon":"Good evening"}</div><h1>${esc(m.name.split(" ")[0])}</h1></div>${avatar(m,46)}</div></div>
  <div class="wrap" style="padding-top:0"><div class="mcard"><div class="r"><div class="brand"><span class="mark">FE</span>${esc(B.settings.gymName)}</div><span class="plan">${esc(m.plan)}</span></div>
    <div class="chipimg"></div><div class="nm">${esc(m.name)}</div><div class="meta"><span>${m.id} · ${esc(m.rfid||"no card")}</span><span>VALID ${m.exp}</span></div></div>
  <div class="stats"><div class="stat red">${ring(Math.min(1,d/tot),d)}<span>days left</span></div><div class="stat"><b>${money(m.wallet)}</b><span>wallet</span></div><div class="stat"><b>${sess}</b><span>sessions left</span></div></div>
  <div class="box" style="margin-top:12px;display:flex;align-items:center;gap:10px">${ic(B.inside?"check":"clock",20)}<div style="flex:1"><b>${B.inside?"You're checked in":"Not checked in"}</b><div class="muted">${B.inside?"Tap your card or face at the turnstile to Time Out":"Tap your card or use Face ID at the turnstile"}</div></div><span class="badge ${m.status==="Active"?"ok":m.status==="Expiring"?"warn":"bad"}">${m.status}</span></div>
  <div class="sec-t">Quick actions</div>
  <div class="qa"><a onclick="tab='book';bookSeg='classes';render()"><i>${ic("dumbbell",22)}</i>Classes</a><a onclick="tab='book';bookSeg='courts';render()"><i>${ic("court",22)}</i>Courts</a>
  <a onclick="renewSheet()"><i>${ic("refresh",22)}</i>Renew</a><a onclick="tab='wallet';render()"><i>${ic("wallet",22)}</i>Wallet</a></div>
  <div class="sec-t">My bookings</div><div class="box">${myBookings()||'<p class="muted">No bookings yet.</p>'}</div>
  <div class="sec-t">Recent visits · ${visits}</div><div class="box">${B.logs.slice(0,5).map(l=>`<div class="li"><div class="ic">${ic(l.action==="Time Out"?"logout":l.action==="Denied"?"x":"check",18)}</div><div class="t"><b>${esc(l.action)}</b><span>${new Date(l.ts).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})} · ${esc(l.device)}${l.method==="Face"?" · Face ID":""}</span></div><span class="muted">${esc(l.dur||"")}</span></div>`).join("")||'<p class="muted">No visits yet.</p>'}</div></div>`; };
function myBookings(){
  const c=B.classes.filter(x=>x.mine||x.wait>=0).map(x=>`<div class="li"><div class="ic">${ic("dumbbell",18)}</div><div class="t"><b>${esc(x.name)}</b><span>${esc(x.time)} · ${esc(x.trainer)}</span></div><span class="badge ${x.mine?"ok":"warn"}">${x.mine?"Booked":"Waitlist #"+(x.wait+1)}</span></div>`);
  const ct=B.courts.flatMap(x=>Object.entries(x.slots).filter(([,v])=>v==="mine").map(([t])=>`<div class="li"><div class="ic">${ic(courtIcon(x.name),18)}</div><div class="t"><b>${esc(cleanName(x.name))}</b><span>Today ${t} · 2 hours</span></div><span class="badge ok">Booked</span></div>`));
  return [...c,...ct].join("");
}
const SLOTS=["6AM","8AM","10AM","12PM","2PM","4PM","6PM","8PM"];
V.book=()=>`<div class="wrap"><h1 style="font-size:24px;font-weight:700;margin:6px 4px 14px">Book</h1>
  <div class="seg"><a class="${bookSeg==="classes"?"on":""}" onclick="bookSeg='classes';render()">Classes</a><a class="${bookSeg==="courts"?"on":""}" onclick="bookSeg='courts';render()">Courts</a><a class="${bookSeg==="games"?"on":""}" onclick="bookSeg='games';render()">Tournaments</a></div>
  ${bookSeg==="classes"?B.classes.map(c=>`<div class="box" style="margin-bottom:10px"><div class="li" style="padding:0;border:none"><div class="ic">${ic("dumbbell",18)}</div><div class="t"><b>${esc(c.name)}</b><span>${esc(c.time)} · ${esc(c.trainer)}</span></div>
    ${c.mine||c.wait>=0?`<button class="btn sm sec" onclick="act({type:'cancelClass',id:'${c.id}'})">Cancel</button>`:`<button class="btn sm" onclick="act({type:'bookClass',id:'${c.id}'})">${c.booked>=c.cap?"Waitlist":"Book"}</button>`}</div>
    <div class="bar" style="margin-top:12px"><div style="width:${c.booked/c.cap*100}%"></div></div><div class="muted" style="font-size:12px;margin-top:4px">${c.booked}/${c.cap} booked${c.wait>=0?` · you're #${c.wait+1} on the waitlist`:""}</div></div>`).join("")
  :bookSeg==="courts"?B.courts.map((c,i)=>`<div class="box" style="margin-bottom:10px"><div class="li" style="padding:0;border:none"><div class="ic">${ic(courtIcon(c.name),18)}</div><div class="t"><b>${esc(cleanName(c.name))}</b><span>${money(c.price*2)} per 2 hours</span></div></div>
    <div class="slots">${SLOTS.map(t=>{const s=c.slots[t]; return `<span class="slot ${s==="mine"?"mine":s?"taken":"free"}" onclick="${s?"":`courtSheet(${i},'${t}')`}">${t}${s==="mine"?" · you":""}</span>`;}).join("")}</div></div>`).join("")
  :B.tournaments.map(t=>`<div class="box" style="margin-bottom:10px"><b>${esc(t.name)}</b><div class="muted" style="margin-bottom:6px">${esc(t.sport)}</div>${[...t.teams].sort((a,b)=>b.w-a.w).map((x,i)=>`<div class="list-item"><span><b style="color:${i===0?"#dc2626":"inherit"}">${i+1}</b>&nbsp; ${esc(x.name)}</span><span class="muted">${x.w}W · ${x.l}L</span></div>`).join("")}
    ${t.matches.filter(m=>!m.score).map(m=>`<div class="muted" style="margin-top:6px">${ic("calendar",13)} ${m.date} · ${esc(m.a)} vs ${esc(m.b)}</div>`).join("")}</div>`).join("")}</div>`;
V.packages=()=>{ const mine=(B.me.sessions||[]);
  return `<div class="wrap"><h1 style="font-size:24px;font-weight:700;margin:6px 4px 14px">Training</h1>
  <div class="sec-t" style="margin-top:0">My packages</div><div class="box">${mine.map(s=>`<div class="li"><div class="ic">${ic("whistle",18)}</div><div class="t"><b>${esc(s.name)}</b><span>${s.exp?"Valid until "+s.exp:""}</span>
    <div class="bar" style="margin-top:6px"><div style="width:${s.left/s.total*100}%"></div></div></div><b>${s.left}/${s.total}</b></div>`).join("")||'<p class="muted">No packages yet.</p>'}</div>
  <div class="sec-t">Buy a package</div>${B.packageTypes.map((t,i)=>`<div class="box" style="margin-bottom:10px"><div class="li" style="padding:0;border:none"><div class="ic">${ic("dumbbell",18)}</div><div class="t"><b>${esc(t.name)}</b><span>${t.sessions} sessions · valid ${t.days} days</span></div>
    <button class="btn sm" onclick="paySheet({title:'${esc(t.name)}',amount:${t.price},cat:'Training',action:{type:'buyPackage',idx:${i}}})">${money(t.price)}</button></div></div>`).join("")}
  ${progressBox()}</div>`; };
function progressBox(){ const p=B.me.progress||[]; if(!p.length) return ""; const l=p[p.length-1], f=p[0], h=B.me.height/100;
  return `<div class="sec-t">My progress</div><div class="stats" style="margin-top:0"><div class="stat"><b>${l.w}</b><span>kg ${l.w!==f.w?`(${l.w-f.w>0?"+":""}${(l.w-f.w).toFixed(1)})`:""}</span></div><div class="stat"><b>${(l.w/(h*h)).toFixed(1)}</b><span>BMI</span></div><div class="stat"><b>${l.bf}%</b><span>body fat</span></div></div>
  ${B.me.workout?`<div class="box" style="margin-top:10px"><b>Workout plan</b><pre style="white-space:pre-wrap;font-family:inherit;font-size:13.5px;margin-top:6px;color:#404040">${esc(B.me.workout)}</pre></div>`:""}`; }
V.wallet=()=>`<div class="wrap"><h1 style="font-size:24px;font-weight:700;margin:6px 4px 14px">Wallet</h1>
  <div class="mcard" style="margin:0"><div class="r"><div class="brand"><span class="mark">FE</span>Wallet balance</div>${ic("wallet",22)}</div><div class="nm" style="font-size:34px;margin-top:20px">${money(B.me.wallet)}</div><div class="meta"><span>Pay courts, rentals and shop with your card</span></div></div>
  <div class="sec-t">Load wallet</div><div class="qa">${[200,500,1000,2000].map(a=>`<a onclick="paySheet({title:'Load wallet',amount:${a},action:{type:'loadWallet',amount:${a}},noWallet:true,noPromo:true})"><i style="font-size:13px;font-weight:700;color:#0a0a0a">${a>=1000?a/1000+"k":a}</i>${money(a)}</a>`).join("")}</div>
  <div class="sec-t">Payments & receipts</div><div class="box">${B.payments.map(p=>`<div class="li" onclick="openReceipt('${p.or}')" style="cursor:pointer"><div class="ic">${ic("card",18)}</div><div class="t"><b>${esc(p.item)}</b><span>${new Date(p.ts).toLocaleDateString()} · ${esc(p.method)} · ${esc(p.or||"")}</span></div><b>${money(p.amount)}</b></div>`).join("")||'<p class="muted">No payments yet.</p>'}</div></div>`;
V.profile=()=>{ const m=B.me; return `<div class="wrap"><div style="text-align:center;margin:10px 0 18px">${avatar(m,84)}<h1 style="font-size:22px;font-weight:700;margin-top:10px">${esc(m.name)}</h1><div class="muted">${m.id} · ${esc(m.phone||"")}</div></div>
  <div class="box"><b>Refer a friend</b><p class="muted" style="margin-top:4px">They get ${B.settings.refDiscount}% off. You get ${money(B.settings.refReward)} in your wallet.</p><div class="refcode">${esc(m.refCode||"-")}</div>
  <button class="btn" style="width:100%" onclick="share()">${ic("send",16)} Share my code</button></div>
  <div class="sec-t">Membership</div><div class="box">
  <div class="li" onclick="renewSheet()" style="cursor:pointer"><div class="ic">${ic("refresh",18)}</div><div class="t"><b>Renew or change plan</b><span>${esc(m.plan)} · until ${m.exp}</span></div>${ic("arrow",16)}</div>
  <div class="li" onclick="if(confirm('${m.frozen?"Unfreeze":"Freeze"} your membership?'))act({type:'freeze'})" style="cursor:pointer"><div class="ic">${ic("snow",18)}</div><div class="t"><b>${m.frozen?"Unfreeze":"Freeze"} membership</b><span>${m.frozen?"Your card is blocked":"Pause while sick or away"}</span></div>${ic("arrow",16)}</div>
  <div class="li" onclick="changePin()" style="cursor:pointer"><div class="ic">${ic("lock",18)}</div><div class="t"><b>Change PIN</b><span>Used to log in to this app</span></div>${ic("arrow",16)}</div>
  <div class="li"><div class="ic">${ic("scan",18)}</div><div class="t"><b>Face ID</b><span>${m.hasFace?"Enrolled. You can enter without your card.":"Not enrolled. Ask the front desk to enroll your face."}</span></div><span class="badge ${m.hasFace?"ok":"gray"}">${m.hasFace?"On":"Off"}</span></div></div>
  <button class="btn sec" style="width:100%;margin-top:16px" onclick="MT=null;localStorage.removeItem('fe_member_token');B=null;render()">${ic("logout",16)} Log out</button></div>`; };
function share(){ const t=`Join me at ${B.settings.gymName}! Use my code ${B.me.refCode} for ${B.settings.refDiscount}% off.`; if(navigator.share) navigator.share({text:t}).catch(()=>{}); else { navigator.clipboard&&navigator.clipboard.writeText(t); toast("Copied: "+t); } }
function changePin(){ const p=prompt("New PIN (4-6 digits)"); if(p) act({type:"pin",pin:p}); }

// ---------- payment sheet ----------
function renewSheet(){ sheet={kind:"renew",plan:B.me.plan}; render(); }
function courtSheet(i,t){ const c=B.courts[i]; paySheet({title:`${cleanName(c.name)} · ${t}`,amount:c.price*2,cat:"Courts",action:{type:"bookCourt",court:i,slot:t}}); }
function paySheet(o){ sheet={kind:"pay",method:"GCash",promo:"",...o}; render(); }
function sheetView(){
  if(!sheet) return "";
  if(sheet.kind==="renew") return `<div class="sheet-bg" onclick="sheet=null;render()"></div><div class="sheet"><h3>Choose a plan</h3><p class="muted">Days are added to your current expiry.</p>
    <div style="margin-top:10px">${Object.entries(B.plans).map(([k,v])=>`<div class="li" style="cursor:pointer" onclick="paySheet({title:'${k} plan',amount:${v.price},cat:'Membership',action:{type:'renew',plan:'${k}'}})"><div class="ic">${ic(k==="VIP"?"crown":"tag",18)}</div><div class="t"><b>${k}${k===B.me.plan?" · current":""}</b><span>${v.days} days · ${v.areas.join(", ")}</span></div><b>${money(v.price)}</b></div>`).join("")}</div></div>`;
  const methods=["GCash","Maya","Card",...(sheet.noWallet?[]:["Wallet"])];
  return `<div class="sheet-bg" onclick="sheet=null;render()"></div><div class="sheet"><h3>${esc(sheet.title)}</h3><div class="amt">${money(sheet.amount)}</div>
    ${sheet.noPromo?"":`<input id="spromo" placeholder="Promo code (optional)" value="${esc(sheet.promo)}" oninput="sheet.promo=this.value">`}
    <div class="pm">${methods.map(x=>`<a class="${sheet.method===x?"on":""}" onclick="sheet.method='${x}';render()">${ic(x==="Wallet"?"wallet":x==="Card"?"card":"qr",18)} ${x}${x==="Wallet"?` <span class="muted">${money(B.me.wallet)}</span>`:""}</a>`).join("")}</div>
    <button class="btn" style="width:100%;padding:14px;font-size:16px" onclick="confirmPay()">Pay with ${sheet.method}</button>
    <p class="muted" style="text-align:center;margin-top:10px;font-size:12px">Demo: GCash / Maya / Card are simulated. Connect PayMongo or Xendit for live payments.</p></div>`;
}
function confirmPay(){ act({...sheet.action,method:sheet.method,promo:sheet.noPromo?"":(sheet.promo||"").trim()}); }

// ---------- shell ----------
const TABS=[["home","home","Home"],["book","calendar","Book"],["packages","dumbbell","Training"],["wallet","wallet","Wallet"],["profile","user","Profile"]];
function render(){
  if(!MT||!B){ $("app").innerHTML=MT?`<div class="login"><div class="reader"></div><p>Loading...</p></div>`:loginView(); const f=$("lf"); if(f) f.onsubmit=doLogin; document.body.style.paddingBottom="0"; return; }
  document.body.style.paddingBottom="";
  $("app").innerHTML=V[tab]()+`<nav class="bnav">${TABS.map(([k,i,l])=>`<a class="${tab===k?"on":""}" onclick="tab='${k}';window.scrollTo(0,0);render()">${ic(i,22)}${l}</a>`).join("")}</nav>`+sheetView();
}
render(); if(MT) load();
setInterval(()=>{ if(MT&&B&&!sheet&&document.visibilityState==="visible") load(); },30000);
