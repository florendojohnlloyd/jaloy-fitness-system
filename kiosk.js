// ===== Kiosk (self-service) + Gate screen (turnstile / door display) =====
const Q=new URLSearchParams(location.search);
const GATE=Q.get("mode")==="gate";
const $=id=>document.getElementById(id);
function toast(msg){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(toast.t); toast.t=setTimeout(()=>t.style.display="none",3500); }
let st={screen:"home"}, idle=null, idleEnd=0;
const reader=(size=48)=>`<div class="reader"><span class="ring"></span><span class="ring"></span><span class="ring"></span><div class="core">${ic("rfid",size,1.8)}</div></div>`;
const tile=(icn,label,sub,onclick,extra="")=>`<div class="kt ${extra}" onclick="${onclick}"><div class="ki">${ic(icn,24)}</div><div class="kl">${label}</div>${sub?`<div class="ks">${sub}</div>`:""}<span class="go">${ic("arrow",18)}</span></div>`;
const ptitle=(icn,title,sub="")=>`<div class="ptitle"><div class="ki">${ic(icn,22)}</div><div><h2>${title}</h2>${sub?`<p>${sub}</p>`:""}</div></div>`;
const simulate=fn=>`<div class="demo">Demo: <a onclick="const u=prompt('Card UID','0004512345');if(u)${fn}(u)">simulate card tap</a></div>`;

// spotlight effect on tiles
document.addEventListener("pointermove",e=>{ const t=e.target.closest(".kt"); if(!t) return; const r=t.getBoundingClientRect(); t.style.setProperty("--x",(e.clientX-r.left)+"px"); t.style.setProperty("--y",(e.clientY-r.top)+"px"); });
document.addEventListener("pointerdown",e=>{ const b=e.target.closest(".btn"); if(!b) return; const r=b.getBoundingClientRect(), s=document.createElement("span"); s.className="rp"; s.style.left=(e.clientX-r.left)+"px"; s.style.top=(e.clientY-r.top)+"px"; b.appendChild(s); setTimeout(()=>s.remove(),600); });

// ---------------- GATE SCREEN ----------------
let gate={dev:Q.get("dev")||"D1",dir:Q.get("dir")||"auto",res:null};
async function startCam(){
  if(!(db.settings.webcam||db.settings.faceId)||!navigator.mediaDevices) return;
  try{ const s=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}}); $("cam").srcObject=s; $("cam").style.display="block"; }catch(e){ console.warn("No camera",e); return; }
  if(db.settings.faceId) faceLoop();
}
// Face ID on the gate: needs the same face in 2 frames in a row before opening (reduces false matches)
let faceBusy=false, faceLast={}, faceStreak={id:"",n:0}, faceState="";
async function faceLoop(){
  try{ faceState="loading"; renderGateHint(); await FACE.load(); faceState="on"; renderGateHint(); }catch(e){ faceState="error: "+e.message; renderGateHint(); return; }
  setInterval(async()=>{
    if(faceBusy||gate.res||!db.settings.faceId) return; faceBusy=true;
    try{
      const r=await FACE.read($("cam"));
      if(r){ const mt=FACE.match(r.desc);
        if(mt){ faceStreak=faceStreak.id===mt.member.id?{id:mt.member.id,n:faceStreak.n+1}:{id:mt.member.id,n:1};
          if(faceStreak.n>=2&&Date.now()-(faceLast[mt.member.id]||0)>8000){ faceLast[mt.member.id]=Date.now(); faceStreak={id:"",n:0}; await gateTap("FACE:"+mt.member.id); } }
        else faceStreak={id:"",n:0};
      }
    }catch(e){ console.warn(e); }
    faceBusy=false;
  },600);
}
function renderGateHint(){ const h=$("faceHint"); if(h) h.innerHTML=faceHintHtml(); }
function faceHintHtml(){ if(!db.settings.faceId) return ""; return faceState==="on"?`${ic("scan",16)} Face ID on · look at the camera`:faceState==="loading"?"Loading Face ID...":faceState?esc(faceState):""; }
function snapshot(){ const v=$("cam"); if(!v.srcObject||!v.videoWidth) return ""; const c=document.createElement("canvas"); c.width=120;c.height=90; c.getContext("2d").drawImage(v,0,0,120,90); return c.toDataURL("image/jpeg",.6); }
function renderGate(){
  const r=gate.res, dev=db.devices.find(d=>d.id===gate.dev);
  const dirLabel=dev.main?(gate.dir==="in"?["arrow","Entrance · Time In"]:gate.dir==="out"?["logout","Exit · Time Out"]:["refresh","Time In / Time Out"]):["door","Door access"];
  $("app").innerHTML=`<div class="gate ${r?(r.ok?"ok":"bad"):""}"><div class="flash"></div>
    <div class="gtop"><div class="brand"><span class="mark">FE</span><div>${esc(db.settings.gymName)}<small>${esc(dev.name)}</small></div></div>
      <div class="gset"><select onchange="gate.dev=this.value;renderGate()">${db.devices.map(d=>`<option value="${d.id}" ${d.id===gate.dev?"selected":""}>${esc(d.name)}</option>`).join("")}</select>
      ${dev.main?`<select onchange="gate.dir=this.value;renderGate()">${[["auto","1 reader In/Out"],["in","Entrance"],["out","Exit"]].map(([v,l])=>`<option value="${v}" ${v===gate.dir?"selected":""}>${l}</option>`).join("")}</select>`:""}</div></div>
    ${r?`<div class="who">${avatar(r.who,200)}</div>
      <h1>${esc(r.who?r.who.name:"Unknown card")}</h1>
      <div class="status">${ic(r.ok?"check":"x",26,2.6)} ${r.action}</div>
      <p>${esc(r.msg)}</p>
      <div class="meta">${r.who&&r.kind==="member"?`<span class="chip">${ic("tag",14)} ${r.who.plan}</span><span class="chip">${ic("calendar",14)} Valid until ${r.who.exp}</span>`:""}
      ${r.kind==="pass"?`<span class="chip">${ic("ticket",14)} ${esc(r.who.type)}</span><span class="chip">${ic("clock",14)} Until ${fmtTime(r.who.validUntil)}</span>`:""}
      ${r.kind==="trainer"?`<span class="chip">${ic("whistle",14)} Trainer</span>`:""}
      ${r.ok?`<span class="chip green">${ic("unlock",14)} Open</span>`:`<span class="chip red">${ic("lock",14)} Locked</span>`}</div>`
    :`${reader(64)}<h1>Tap your card</h1><p>Hold your RFID card near the reader</p>
      <div class="dir">${ic(dirLabel[0],16)} ${dirLabel[1]}</div>${db.settings.faceId?`<div class="dir" id="faceHint" style="margin-left:8px">${faceHintHtml()}</div>`:""}
      <div class="clock" style="text-align:center;margin-top:26px"><b id="clkT"></b><span id="clkD"></span></div>`}
    <div class="gfoot">Demo: type a UID + Enter, or <a onclick="const u=prompt('Card UID','0004512345');if(u)gateTap(u)">simulate tap</a></div>
  </div>`;
  tick();
}
async function gateTap(uid){ try{ gate.res=await tap(uid,gate.dev,gate.dir,snapshot()); }catch(e){ return toast("Server error: "+e.message); } renderGate(); clearTimeout(gate.t); gate.t=setTimeout(()=>{gate.res=null;renderGate();},4000); }

// ---------------- KIOSK ----------------
function resetIdle(){ clearTimeout(idle); idleEnd=0; if(st.member||st.screen!=="home"){ idleEnd=Date.now()+db.settings.kioskTimeout*1000; idle=setTimeout(()=>{ st={screen:"home"}; render(); toast("Logged out due to inactivity"); },db.settings.kioskTimeout*1000);} }
document.addEventListener("pointerdown",resetIdle);
function nav(screen,extra={}){ st={...st,...extra,screen}; render(); resetIdle(); window.scrollTo({top:0,behavior:"smooth"}); }
function logout(){ st={screen:"home"}; render(); resetIdle(); }
const M=()=>st.member?memberById(st.member):null;
const home=()=>st.member?"account":"home";
const backBtn=(to)=>`<button class="btn sec kbtn" onclick="nav('${to||home()}')">${ic("back",18)} Back</button>`;

function header(){
  return `<div class="ktop"><div class="brand"><span class="mark">FE</span><div>${esc(db.settings.gymName)}<small>Self-Service Kiosk</small></div></div>
  <div class="clock"><b id="clkT"></b><span id="clkD"></span></div></div>`;
}

const S={};
S.home=()=>`<div class="hero">${reader(52)}<h1>Tap your <em>card</em> to start</h1><p>Check membership, renew, book classes and courts, or shop.</p></div>
  <div class="ktiles">
    ${tile("ticket","Buy Day Pass","Walk-in access for today","nav('daypass')")}
    ${tile("userplus","Join Now","Register as a new member","nav('register')")}
    ${tile("calendar","Class Schedule","See today's classes","nav('schedule')")}
    ${tile("trophy","Tournaments","Standings and next games","nav('tour')")}
  </div><p class="demo" style="margin-top:20px">${ic("phone",14)} Get the member app: open <b>/member.html</b> on your phone</p>${simulate("kioskTap")}`;

S.account=()=>{ const m=M(); const s=memberStatus(m), d=daysUntil(m.exp), inside=db.inside["member:"+m.id];
  return `<div class="mhead">${avatar(m,84)}<div style="flex:1"><h2>Hi, ${esc(m.name.split(" ")[0])}</h2>
  <div class="sub">${m.plan} plan · ${esc(m.sport)}</div>
  <div class="chips"><span class="chip ${s==="Active"?"green":"red"}">${ic(s==="Active"?"check":"alert",14)} ${s}</span>
  <span class="chip">${ic("wallet",14)} ${money(m.wallet)}</span>${inside?`<span class="chip green">${ic("clock",14)} Inside since ${fmtTime(inside)}</span>`:""}</div></div>
  <div class="days"><b>${Math.max(0,d)}</b><span>days left</span></div>
  <button class="btn kbtn" onclick="logout()">${ic("logout",18)} Logout</button></div>
  <div class="ktiles">
    ${tile("refresh","Renew Plan","Valid until "+m.exp,"nav('renew')")}
    ${tile("dumbbell","Book a Class","Reserve your slot","nav('bookclass')")}
    ${tile("court","Book a Court","Basketball, badminton, more","nav('bookcourt')")}
    ${tile("cart","Shop","Drinks, supplements, gear","nav('shop')")}
    ${tile("wallet","Load Wallet","Balance "+money(m.wallet),"nav('wallet')")}
    ${tile("history","My Attendance","Last visit "+m.lastVisit,"nav('history')")}
    ${tile("trend","Progress","Weight, BMI, workout","nav('progress')")}
    ${tile("box","Training Packages",(m.sessions||[]).filter(s=>s.left>0).map(s=>s.left+" "+s.name.split(" ")[0]+" left").join(", ")||"PT, boxing, clinics","nav('packages')")}
    ${tile("users","Refer a Friend","Your code: "+(m.refCode||"-"),"nav('refer')")}
    ${tile("snow",(m.frozen?"Unfreeze":"Freeze")+" Plan",m.frozen?"Reactivate your card":"Pause while away","nav('freeze')")}
  </div>`; };

S.packages=()=>{ const m=M(); const mine=(m.sessions||[]).filter(s=>s.left>0);
  return `<div class="panel">${ptitle("box","Training packages","Buy sessions with a coach")}
  ${mine.length?`<h2>My sessions</h2>${mine.map(s=>`<div class="list-item"><span><b>${esc(s.name)}</b><div class="muted">${s.exp?"Valid until "+s.exp:""}</div></span><span class="badge ok">${s.left} / ${s.total} left</span></div>`).join("")}<h2 style="margin-top:18px">Buy more</h2>`:""}
  <div class="ktiles" style="margin-top:0">${db.packageTypes.map((t,i)=>tile("dumbbell",`${esc(t.name)} · ${money(t.price)}`,`${t.sessions} sessions · valid ${t.days} days`,`pay(${t.price},'${esc(t.name)}','package:${i}')`)).join("")}</div>
  <div class="actions">${backBtn()}</div></div>`; };
S.refer=()=>{ const m=M(); const n=db.members.filter(x=>x.referredBy===m.id).length;
  return `<div class="panel center"><div class="result-ico">${ic("users",44)}</div><h2 style="font-size:24px">Invite friends, earn ${money(db.settings.refReward)}</h2>
  <p class="muted" style="margin-top:6px">Your friend gets ${db.settings.refDiscount}% off when they join with your code. You get ${money(db.settings.refReward)} in your wallet.</p>
  <div class="pass-code">${esc(m.refCode||"-")}</div><p class="muted">Friends referred: <b>${n}</b></p><div class="actions" style="justify-content:center">${backBtn()}</div></div>`; };
S.renew=()=>{ const m=M(); return `<div class="panel">${ptitle("refresh","Renew membership","Current plan: "+m.plan+" · valid until "+m.exp)}
  <div class="ktiles" style="margin-top:0">${Object.entries(PLANS).map(([k,v])=>tile(k==="VIP"?"crown":"tag",`${k} · ${money(v.price)}`,`${v.days} days · ${v.areas.join(", ")}`,`pay(${v.price},'${k} Plan','renew:${k}')`,k===m.plan?"sel":"")).join("")}</div>
  <div class="actions">${backBtn()}</div></div>`; };

S.bookclass=()=>{ const m=M(); return `<div class="panel">${ptitle("dumbbell","Book a class","Full classes go to the waitlist")}
  ${db.classes.map(c=>{const mine=c.booked.includes(m.id), w=c.wait.indexOf(m.id), full=c.booked.length>=c.cap; return `<div class="list-item"><span><b>${c.name}</b> · ${c.trainer}<div class="muted">${c.time}</div>
  <div class="bar" style="margin-top:8px;width:180px"><div style="width:${c.booked.length/c.cap*100}%"></div></div><div class="muted" style="font-size:12px;margin-top:4px">${c.booked.length}/${c.cap} booked</div></span>
  ${mine?`<span class="badge ok">${ic("check",12,2.4)} Booked</span>`:w>=0?`<span class="badge warn">Waitlist #${w+1}</span>`:`<button class="btn ${full?"sec":""} kbtn" onclick="kBookClass('${c.id}')">${full?"Join waitlist":"Book"}</button>`}</div>`;}).join("")}
  <div class="actions">${backBtn()}</div></div>`; };
function kBookClass(cid){ const c=db.classes.find(x=>x.id===cid), m=M(); if(c.booked.length<c.cap){ c.booked.push(m.id); toast("Booked: "+c.name); } else { c.wait.push(m.id); toast("Added to waitlist"); } save(); render(); }

const KT=["6AM","8AM","10AM","12PM","2PM","4PM","6PM","8PM"];
S.bookcourt=()=>`<div class="panel">${ptitle("court","Book a court","2-hour slots · tap your card at the Court Area door")}
  ${db.courts.map((c,i)=>`<div class="court-row"><div class="hi">${ic(courtIcon(c.name),18)} ${esc(cleanName(c.name))} <span class="muted" style="font-weight:400">· ${money(c.price*2)} / 2h</span></div>
  ${KT.map(t=>`<span class="slot ${c.slots[t]?"taken":"free"}" onclick="${c.slots[t]?"":`pay(${c.price*2},'${esc(cleanName(c.name))} ${t}','court:${i}:${t}')`}">${t}${c.slots[t]===st.member?" · you":""}</span>`).join("")}</div>`).join("")}
  <div class="actions">${backBtn()}</div></div>`;

S.shop=()=>{ const cart=st.cart||[]; const total=cart.reduce((a,c)=>a+c.price*c.qty,0);
  return `<div class="panel">${ptitle("cart","Shop","Tap items to add · claim at the counter")}
  <div class="gridbox">${db.products.map((p,i)=>{const q=(cart.find(c=>c.i===i)||{}).qty; return `<div class="tile shop-tile" onclick="kAdd(${i})">${q?`<span class="qty">${q}</span>`:""}${productThumb(p,28)}<b>${esc(p.name)}</b><div>${money(p.price)}</div>${p.stock<1?'<span class="badge bad">Sold out</span>':""}</div>`;}).join("")}</div>
  ${cart.length?`<div style="margin-top:18px">${cart.map((c,j)=>`<div class="list-item"><span>${c.qty} × ${esc(c.name)}</span><span>${money(c.price*c.qty)} <a style="cursor:pointer;color:#a3a3a3" onclick="st.cart.splice(${j},1);render()">${ic("x",14,2.4)}</a></span></div>`).join("")}
  <div class="list-item" style="font-size:20px"><b>Total</b><b>${money(total)}</b></div></div>`:""}
  <div class="actions">${backBtn()}${total?`<button class="btn kbtn" onclick="pay(${total},'Shop order','shop')">Pay ${money(total)} ${ic("arrow",18)}</button>`:""}</div></div>`; };
function kAdd(i){ const p=db.products[i]; const cart=st.cart||[]; const c=cart.find(x=>x.i===i); if((c?c.qty:0)>=p.stock) return toast("Out of stock"); if(c) c.qty++; else cart.push({i,name:p.name,price:p.price,qty:1}); st.cart=cart; render(); }

S.wallet=()=>`<div class="panel">${ptitle("wallet","Load wallet","Pay for courts, rentals and shop items with your card")}
  <div class="ktiles" style="margin-top:0">${[200,500,1000,2000].map(a=>tile("wallet",money(a),"","pay("+a+",'Wallet load','wallet')")).join("")}</div><div class="actions">${backBtn()}</div></div>`;

S.history=()=>{ const m=M(); const logs=db.logs.filter(l=>(l.mid===m.id||(m.rfid&&l.uid===m.rfid))&&!l.seed).slice(0,15);
  return `<div class="panel">${ptitle("history","My attendance","Last visit: "+m.lastVisit)}
  <table><thead><tr><th>Date & time</th><th>Device</th><th>Action</th><th>Duration</th></tr></thead><tbody>${logs.map(l=>`<tr><td>${new Date(l.ts).toLocaleString()}</td><td>${esc(l.device)}</td><td><span class="badge ${l.action==="Denied"?"bad":l.action==="Time In"?"ok":"gray"}">${l.action}</span></td><td>${esc(l.dur||l.reason||"-")}</td></tr>`).join("")||`<tr><td colspan="4" class="muted">No records yet.</td></tr>`}</tbody></table>
  <div class="actions">${backBtn()}</div></div>`; };

S.progress=()=>{ const m=M(); const h=m.height/100; const last=m.progress[m.progress.length-1], first=m.progress[0];
  return `<div class="panel">${ptitle("trend","My progress")}
  ${last?`<div class="cards"><div class="card"><div class="label">Weight</div><div class="value">${last.w} kg</div><div class="trend">${first&&first!==last?((last.w-first.w)>0?"+":"")+(last.w-first.w).toFixed(1)+" kg since "+first.d:""}</div></div>
  <div class="card"><div class="label">BMI</div><div class="value">${(last.w/(h*h)).toFixed(1)}</div></div><div class="card"><div class="label">Body fat</div><div class="value">${last.bf}%</div></div></div>`:`<p class="muted">No measurements yet. Ask your trainer.</p>`}
  <h2 style="margin-top:18px">Workout plan</h2><pre style="white-space:pre-wrap;font-size:15px;background:#fafafa;border:1px solid #ebebeb;padding:16px;border-radius:12px">${esc(m.workout||"No plan yet. Ask your trainer to create one.")}</pre>
  <div class="actions">${backBtn()}</div></div>`; };

S.freeze=()=>{ const m=M(); return `<div class="panel center"><div class="result-ico dark">${ic("snow",44)}</div><h2 style="font-size:24px">${m.frozen?"Unfreeze":"Freeze"} membership?</h2>
  <p class="muted" style="font-size:15px;margin:10px auto 0;max-width:460px">${m.frozen?"Your card will work again at the turnstile.":"Your card will be blocked at the turnstile until you unfreeze it, for example while sick or travelling."}</p>
  <div class="actions" style="justify-content:center">${backBtn()}<button class="btn kbtn" onclick="memberById('${m.id}').frozen=${!m.frozen};save();nav('account');toast('Membership updated')">Confirm</button></div></div>`; };

S.daypass=()=>`<div class="panel">${ptitle("ticket","Buy a day pass","No membership needed")}<input id="dpName" placeholder="Your name (optional)">
  <div class="ktiles" style="margin-top:8px">${Object.entries(PASS_TYPES).map(([k,v])=>tile("ticket",`${k} · ${money(v.price)}`,`${v.hours?v.hours+" hours":"Until closing"} · ${v.areas.join(", ")}`,`pay(${v.price},'${k}','pass:${k}')`)).join("")}</div>
  <div class="actions">${backBtn()}</div></div>`;

S.register=()=>`<div class="panel">${ptitle("userplus","Join "+esc(db.settings.gymName),"Takes less than a minute")}
  <div class="grid2e" style="gap:10px"><input id="rgName" placeholder="Full name"><input id="rgPhone" placeholder="Mobile number"></div>
  <input id="rgSport" placeholder="Sport or goal (e.g. Basketball, weight loss)">
  <div class="grid2e" style="gap:10px"><input id="rgRef" placeholder="Referral code (optional)"><input id="rgPin" placeholder="Choose a 4-digit PIN for the member app" maxlength="6"></div>
  <select id="rgPlan">${Object.entries(PLANS).map(([k,v])=>`<option value="${k}">${k} · ${money(v.price)} / ${v.days} days</option>`).join("")}</select>
  <div class="actions">${backBtn()}<button class="btn kbtn" onclick="startRegister()">Continue to payment ${ic("arrow",18)}</button></div></div>`;
function startRegister(){ const n=$("rgName").value.trim(); if(!n) return toast("Please enter your name");
  const rc=$("rgRef").value.trim(), ref=findReferrer(rc); if(rc&&!ref) return toast("Referral code not found");
  const pin=$("rgPin").value.trim(); if(pin&&!/^\d{4,6}$/.test(pin)) return toast("PIN must be 4-6 digits");
  st.reg={name:n,phone:$("rgPhone").value,sport:$("rgSport").value||"Gym",plan:$("rgPlan").value,ref:ref?ref.id:"",pin};
  let price=PLANS[st.reg.plan].price;
  if(ref){ const d=Math.round(price*db.settings.refDiscount/100); pay(price-d,st.reg.plan+" Plan (new)","register",{discount:d,code:"REF "+ref.refCode,base:price,locked:true}); }
  else pay(price,st.reg.plan+" Plan (new)","register"); }

S.schedule=()=>`<div class="panel">${ptitle("calendar","Class schedule")}${db.classes.map(c=>`<div class="list-item"><span><b>${c.name}</b> · ${c.trainer}<div class="muted">${c.time}</div></span><span class="badge ${c.cap-c.booked.length>0?"ok":"bad"}">${c.cap-c.booked.length>0?(c.cap-c.booked.length)+" slots left":"Full"}</span></div>`).join("")}<div class="actions">${backBtn()}</div></div>`;
S.tour=()=>`<div class="panel">${ptitle("trophy","Tournaments")}<div class="grid2e">${db.tournaments.map(t=>`<div class="card"><h2>${esc(t.name)}</h2>${[...t.teams].sort((a,b)=>b.w-a.w).map((x,i)=>`<div class="list-item"><span><b style="color:${i===0?"#dc2626":"inherit"}">${i+1}</b> &nbsp;${esc(x.name)}</span><span class="muted">${x.w}W · ${x.l}L</span></div>`).join("")}
  ${t.matches.filter(m=>!m.score).map(m=>`<div class="muted" style="margin-top:8px">${ic("calendar",13)} ${m.date} · ${esc(m.a)} vs ${esc(m.b)}</div>`).join("")}</div>`).join("")}</div><div class="actions">${backBtn()}</div></div>`;

// ----- payment -----
const PAY_CAT={renew:"Membership",register:"Membership",court:"Courts",shop:"POS",pass:"Day Pass",package:"Training"};
function pay(amount,label,action,opt={}){ if(action.startsWith("pass:")) st.passName=($("dpName")||{}).value||"";
  nav("pay",{payInfo:{amount,base:opt.base??amount,discount:opt.discount||0,code:opt.code||"",locked:!!opt.locked,label,action,method:null}}); }
function applyKPromo(){ const p=st.payInfo, code=$("kpromo").value; const cat=PAY_CAT[p.action.split(":")[0]];
  const r=applyPromo(code,p.base,cat); if(r.error) return toast(r.error); p.amount=r.amount; p.discount=r.discount; p.code=r.code||""; render(); toast(r.discount?"Promo applied: -"+money(r.discount):"No promo"); }
S.pay=()=>{ const p=st.payInfo, m=M();
  const promoBox=PAY_CAT[p.action.split(":")[0]]&&!p.locked?`<div class="row" style="max-width:420px;margin:12px auto 0"><input id="kpromo" placeholder="Promo code" value="${esc(p.code)}" style="margin:0"><button class="btn sec kbtn" onclick="applyKPromo()">Apply</button></div>`:"";
  if(!p.method) return `<div class="panel center"><p class="muted">${esc(p.label)}</p>${p.discount?`<div class="muted" style="text-decoration:line-through">${money(p.base)}</div>`:""}<div class="big-amt">${money(p.amount)}</div>
    ${p.discount?`<span class="badge ok">${esc(p.code)} · -${money(p.discount)}</span>`:""}${promoBox}<p class="muted" style="margin-top:10px">Choose a payment method</p>
    <div class="ktiles">${tile("qr","GCash","Scan QR","st.payInfo.method='GCash';render()")}${tile("qr","Maya","Scan QR","st.payInfo.method='Maya';render()")}${tile("cash","Cash","Pay at the counter","st.payInfo.method='Cash at counter';render()")}
    ${m&&p.action!=="wallet"?tile("wallet","Wallet","Balance "+money(m.wallet),"payWallet()"):""}</div>
    <div class="actions">${backBtn()}</div></div>`;
  if(p.method==="Wallet") return `<div class="panel center"><div class="result-ico">${ic("alert",44)}</div><h2>Insufficient wallet balance</h2><p class="muted">Balance ${money(m.wallet)}</p><div class="actions" style="justify-content:center"><button class="btn kbtn" onclick="st.payInfo.method=null;render()">Choose another method</button></div></div>`;
  if(p.method==="Cash at counter") return `<div class="panel center"><div class="result-ico dark">${ic("cash",44)}</div><h2 style="font-size:24px">Please pay ${money(p.amount)} at the front desk</h2><p class="muted">Reference no.</p><div class="pass-code">${Date.now().toString().slice(-6)}</div>
    <div class="actions" style="justify-content:center">${backBtn()}<button class="btn kbtn" onclick="finishPay()">Staff: confirm cash received</button></div></div>`;
  const cells=Array.from({length:441},(_,i)=>{const x=i%21,y=Math.floor(i/21); const f=(x<7&&y<7)||(x>13&&y<7)||(x<7&&y>13); const on=f?((x%14<7&&y%14<7)&&(x%14===0||x%14===6||y%14===0||y%14===6||(x%14>1&&x%14<5&&y%14>1&&y%14<5))):Math.random()>.5; return `<i style="background:${on?"#0a0a0a":"#fff"}"></i>`;}).join("");
  return `<div class="panel center">${`<p class="muted">Scan with ${p.method}</p>`}<div class="big-amt">${money(p.amount)}</div><div class="qr">${cells}</div>
    <div class="waiting"><span class="dot"></span> Waiting for payment...</div>
    <div class="actions" style="justify-content:center">${backBtn()}<button class="btn green kbtn" onclick="finishPay()">${ic("check",18,2.4)} Simulate payment success</button></div></div>`;
};
function finishPay(){
  const p=st.payInfo, m=M(), method=p.method==="Cash at counter"?"Cash":p.method;
  const [kind,a,b]=p.action.split(":");
  const extra=p.discount?{discount:p.discount,promo:p.code}:{};
  if(p.discount&&p.code&&!p.code.startsWith("REF ")) usePromo(p.code);
  if(kind==="package"){ buyPackage(m,Number(a),method,p.amount,extra); save(); return done(`${db.packageTypes[a].name} added. Book your sessions with the coach.`,"account"); }
  if(kind==="renew"){ m.plan=a; renewMember(m,method,p.amount,extra); return done(`Renewed! Your ${a} plan is valid until ${m.exp}.`,"account"); }
  if(kind==="court"){ const c=db.courts[a]; if(c.slots[b]){ toast("Slot was just taken"); return nav("bookcourt"); } c.slots[b]=m.id; addPayment(m.name,`${cleanName(c.name)} ${b} (2h)`,"Courts",p.amount,method,"Paid",extra); save(); return done(`${cleanName(c.name)} booked at ${b}. Tap your card at the Court Area door.`,"account"); }
  if(kind==="shop"){ (st.cart||[]).forEach(c=>db.products[c.i].stock-=c.qty); addPayment(m?m.name:"Kiosk walk-in",(st.cart||[]).map(c=>`${c.name} x${c.qty}`).join(", "),"POS",p.amount,method,"Paid",extra); st.cart=[]; save(); return done("Paid! Please claim your items at the counter.",home()); }
  if(kind==="wallet"){ m.wallet+=p.amount; addPayment(m.name,"Wallet load","Wallet",p.amount,method); save(); return done(`Wallet loaded. New balance: ${money(m.wallet)}`,"account"); }
  if(kind==="pass"){ st.newPass=createPass(st.passName,a,method,p.amount,extra); st.receipt=lastReceipt; return nav("passdone"); }
  if(kind==="register"){ const r=st.reg;
    const nm=newMember({name:r.name,plan:r.plan,sport:r.sport,phone:r.phone,pin:r.pin||undefined,referredBy:r.ref});
    if(r.ref) rewardReferrer(memberById(r.ref),nm.name);
    addPayment(nm.name,r.plan+" Plan (new)","Membership",p.amount,method,"Paid",extra); st.receipt=lastReceipt;
    sendSms(nm.phone,`Welcome to ${db.settings.gymName}, ${nm.name}! Member ID ${nm.id}. Member app PIN: ${nm.pin}. Your referral code: ${nm.refCode}`); save();
    st.enrollId=nm.id; return nav("enroll"); }
}
function payWallet(){ const p=st.payInfo, m=M(); p.method="Wallet"; if(m.wallet<p.amount) return render(); m.wallet-=p.amount; finishPay(); }
function done(msg,to){ st.doneMsg=msg; st.doneTo=to; st.receipt=lastReceipt; nav("done"); }
S.done=()=>`<div class="panel center"><div class="result-ico">${ic("check",48,2.6)}</div><h2 style="font-size:24px;max-width:560px;margin:auto">${esc(st.doneMsg)}</h2>${st.receipt?`<p class="muted" style="margin-top:8px">Receipt ${st.receipt.or} · ${money(st.receipt.amount)}</p>`:""}
  <div class="actions" style="justify-content:center">${st.receipt?`<button class="btn sec kbtn" onclick="printReceipt(st.receipt)">${ic("printer",18)} Print receipt</button>`:""}<button class="btn kbtn" onclick="nav('${st.doneTo}')">Done</button></div></div>`;
S.passdone=()=>{ const p=st.newPass; return `<div class="panel center"><div class="result-ico">${ic("ticket",46)}</div><h2 style="font-size:24px">Your ${esc(p.type)} is ready</h2>
  <div class="pass-code">${p.code}</div><p class="muted">Valid until ${fmtTime(p.validUntil)}. Get your temporary card from the front desk (UID ${p.rfid}) and tap it at the turnstile.</p>
  <div class="actions" style="justify-content:center">${st.receipt?`<button class="btn sec kbtn" onclick="printReceipt(st.receipt)">${ic("printer",18)} Receipt</button>`:""}<button class="btn kbtn" onclick="logout()">Done</button></div></div>`; };
S.enroll=()=>`<div class="panel center">${reader(48)}<h2 style="font-size:24px;margin-top:18px">Payment received. Tap your new card.</h2>
  <p class="muted">Get a blank card from the front desk and tap it on the kiosk reader to link it to your account.</p>
  <div class="demo"><a onclick="const u=prompt('New card UID','00077'+Math.floor(10000+Math.random()*89999));if(u)kioskTap(u)">simulate tap</a></div></div>`;

// ----- RFID tap on kiosk -----
function kioskTap(uid){
  uid=uid.trim().toUpperCase();
  if(st.screen==="enroll"){
    if(db.members.some(m=>m.rfid===uid)||db.passes.some(p=>p.rfid===uid)) return toast("This card is already used");
    const m=memberById(st.enrollId); m.rfid=uid; save(); st.member=m.id; return done(`Card linked! Welcome, ${m.name}. You can now tap at the turnstile.`,"account");
  }
  const m=db.members.find(x=>x.rfid===uid);
  if(!m){ const ps=db.passes.find(p=>p.rfid===uid); return toast(ps?`Walk-in pass ${ps.code}, valid until ${fmtTime(ps.validUntil)}`:"Card not registered. Please go to the front desk."); }
  st={screen:"account",member:m.id}; render(); resetIdle();
}

function render(){
  if(GATE) return renderGate();
  $("app").innerHTML=`<div class="k">${header()}${S[st.screen]()}</div><div class="timeout" id="tmo"></div>`; tick();
}
function tick(){
  const n=new Date(), t=$("clkT"), d=$("clkD");
  if(t) t.textContent=n.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  if(d) d.textContent=n.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"});
  const bar=$("tmo"); if(bar) bar.style.width=idleEnd?Math.max(0,(idleEnd-Date.now())/(db.settings.kioskTimeout*1000)*100)+"%":"0";
}
setInterval(tick,1000);
window.onDbChange=()=>{ const a=document.activeElement; if(GATE){ if(!gate.res) renderGate(); } else if(!a||a.tagName!=="INPUT") render(); };
attachReader(uid=>{ if(db) GATE?gateTap(uid):kioskTap(uid); });
boot().then(()=>{ if(GATE) startCam(); render(); });
