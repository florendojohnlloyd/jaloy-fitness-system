// ===== Face ID (browser) =====
// Uses face-api (TensorFlow.js) from a CDN, so the screen needs internet the first time it loads.
// Each member stores a 128-number face "descriptor" (not a photo). Matching = smallest distance.
// For a production gate, a dedicated face terminal (ZKTeco / Hikvision) with anti-spoofing is recommended.
const FACE={
  CDN:"https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/",
  ready:false, loading:null,
  load(){
    if(this.loading) return this.loading;
    this.loading=(async()=>{
      if(!window.faceapi) await new Promise((ok,bad)=>{ const s=document.createElement("script"); s.src=this.CDN+"dist/face-api.js"; s.onload=ok; s.onerror=()=>bad(new Error("Cannot download the face engine (check internet)")); document.head.appendChild(s); });
      const M=this.CDN+"model/";
      await faceapi.nets.tinyFaceDetector.loadFromUri(M);
      await faceapi.nets.faceLandmark68Net.loadFromUri(M);
      await faceapi.nets.faceRecognitionNet.loadFromUri(M);
      this.ready=true;
    })();
    this.loading.catch(()=>{ this.loading=null; });
    return this.loading;
  },
  async camera(video){
    if(!navigator.mediaDevices) throw new Error("Camera needs http://localhost or https");
    const s=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:"user"}});
    video.srcObject=s; await video.play(); return s;
  },
  async read(video){
    if(!video||!video.videoWidth) return null;
    const r=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})).withFaceLandmarks().withFaceDescriptor();
    return r?{desc:Array.from(r.descriptor),box:r.detection.box,score:r.detection.score}:null;
  },
  dist(a,b){ let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d; } return Math.sqrt(s); },
  match(desc){
    let best=null, bd=9;
    for(const m of db.members){ if(!m.face) continue; const d=this.dist(desc,m.face); if(d<bd){ bd=d; best=m; } }
    return best&&bd<(db.settings.faceThreshold||.5)?{member:best,dist:bd}:null;
  }
};
