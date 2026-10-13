/* Separate video seconds, replay seconds, and semantic task progress.
   Monotone cubic interpolation preserves event anchors and stationary holds.
   Inverting the same curve keeps timeline seeking consistent with playback. */
(function(root){
 'use strict';
 function slopes(knots){
  const n=knots.length,h=[],d=[],m=Array(n).fill(0);
  for(let i=0;i<n-1;i++){h.push(knots[i+1][0]-knots[i][0]);d.push((knots[i+1][1]-knots[i][1])/h[i]);}
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i++){if(d[i-1]*d[i]<=0)continue;const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}
  return m;
 }
 function at(knots,value){
  if(value<=knots[0][0])return knots[0][1];
  const last=knots.length-1;if(value>=knots[last][0])return knots[last][1];
  let i=0;while(value>knots[i+1][0])i++;
  const [x0,y0]=knots[i],[x1,y1]=knots[i+1],h=x1-x0,u=(value-x0)/h,m=slopes(knots),u2=u*u,u3=u2*u;
  if(y0===y1)return y0;
  return (2*u3-3*u2+1)*y0+(u3-2*u2+u)*h*m[i]+(-2*u3+3*u2)*y1+(u3-u2)*h*m[i+1];
 }
 function inverse(knots,value){
  if(value<=knots[0][1])return knots[0][0];
  const last=knots.length-1;if(value>=knots[last][1])return knots[last][0];
  for(const [time,replay] of knots)if(replay===value)return time;
  let lo=knots[0][0],hi=knots[last][0];
  for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(at(knots,mid)<value)lo=mid;else hi=mid;}
  return (lo+hi)/2;
 }
 root.PlaybackTiming={at,inverse};
 if(typeof module!=='undefined')module.exports=root.PlaybackTiming;
})(typeof window==='undefined'?globalThis:window);

/* Curated, video-derived annotations. Never substitutes guessed robot states for 3D. */
// Shape-preserving interpolation through reviewed pixels: continuous velocity,
// no overshoot around pickup/placement turns, and no invented 3D telemetry.
function liberoTrackAt(landmarks,time){
 if(time<=landmarks[0][0])return landmarks[0].slice(1);
 if(time>=landmarks.at(-1)[0])return landmarks.at(-1).slice(1);
 let i=0;while(landmarks[i+1][0]<time)i++;
 const a=landmarks[i],b=landmarks[i+1],h=b[0]-a[0],u=(time-a[0])/h;
 const slope=(j,c)=>{const l=landmarks[Math.max(0,j-1)],m=landmarks[j],r=landmarks[Math.min(landmarks.length-1,j+1)];
  if(j===0)return(r[c]-m[c])/(r[0]-m[0]);if(j===landmarks.length-1)return(m[c]-l[c])/(m[0]-l[0]);
  const p=(m[c]-l[c])/(m[0]-l[0]),q=(r[c]-m[c])/(r[0]-m[0]);
  if(p*q<=0)return 0;const w1=2*(r[0]-m[0])+(m[0]-l[0]),w2=(r[0]-m[0])+2*(m[0]-l[0]);return(w1+w2)/(w1/p+w2/q);};
 return[1,2].map(c=>(2*u*u*u-3*u*u+1)*a[c]+(u*u*u-2*u*u+u)*h*slope(i,c)+(-2*u*u*u+3*u*u)*b[c]+(u*u*u-u*u)*h*slope(i+1,c));
}
function liberoImageAngleAt(angles,time){
 if(time<=angles[0][0])return angles[0][1]*Math.PI/180;
 if(time>=angles.at(-1)[0])return angles.at(-1)[1]*Math.PI/180;
 let i=0;while(angles[i+1][0]<time)i++;
 const a=angles[i],b=angles[i+1],u=(time-a[0])/(b[0]-a[0]),v=u*u*(3-2*u);
 return(a[1]+(b[1]-a[1])*v)*Math.PI/180;
}
// Reconstruct an illustrative right-handed hand frame from TWO image cues.
// Y follows jaw opening, Z points from the wrist towards the finger pads.
// Rotating a flat triad by the jaw angle incorrectly rotated Z as well.
// Camera coordinates: right, down, away. Depth is estimated, not telemetry.
function liberoHandFrameAt(track,time){
 const cues=track.approachFrames||[[0,90,.78]],normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
 let i=0;while(i<cues.length-2&&cues[i+1][0]<time)i++;
 const a=cues[i],b=cues[Math.min(i+1,cues.length-1)],u=a===b?0:Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])));
 const heading=(a[1]+(b[1]-a[1])*u)*Math.PI/180,screenLength=a[2]+(b[2]-a[2])*u;
 const z=[Math.cos(heading)*screenLength,Math.sin(heading)*screenLength,Math.sqrt(1-screenLength*screenLength)];
 const jaw=liberoImageAngleAt(track.imageAngles||[[0,0]],time),cx=Math.cos(jaw),cy=Math.sin(jaw);
 const y=normalize([cx,cy,-(z[0]*cx+z[1]*cy)/z[2]]);
 const x=[y[1]*z[2]-y[2]*z[1],y[2]*z[0]-y[0]*z[2],y[0]*z[1]-y[1]*z[0]];
 return[x,y,z];
}
// The annotation reports the acute angle visible between the two axis lines.
// Compute in source pixels (not normalized UVs); preserve the target ray and
// reverse only the baseline when its original ray forms the obtuse angle.
function liberoAcuteAngle(pivot,baseline,target){
 let a=baseline.map((v,i)=>v-pivot[i]),b=target.map((v,i)=>v-pivot[i]);
 if(a[0]*b[0]+a[1]*b[1]<0)a=a.map(v=>-v);
 const start=Math.atan2(a[1],a[0]),sweep=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);
 return{baseline:a.map((v,i)=>v+pivot[i]),start,sweep,degrees:Math.abs(sweep)*180/Math.PI,radius:Math.min(Math.hypot(...a),Math.hypot(...b))*.65};
}
function createLiberoReferenceView({video,viewport,frame,graspMarker,getFrameTime=()=>video.seeking?null:video.currentTime}) {
 const overlay=document.createElement('canvas');
 overlay.id='libero-overlay';overlay.setAttribute('aria-label','LIBERO reference video with illustrative annotations');
 frame.append(overlay);
 let reference=null,lastFrame=-1,lastSize='';
 const YELLOW='#ffdb21';
 // Same view-space lighting and palette as createReferenceSphereMaterial.
 // Rasterize once; every annotation shares the source image's crop transform.
 const sphere=document.createElement('canvas');sphere.width=sphere.height=128;
 const sphereContext=sphere.getContext('2d'),pixels=sphereContext.createImageData(128,128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const nx=(x+.5-64)/64,ny=-(y+.5-64)/64,r2=nx*nx+ny*ny;if(r2>1)continue;
  const nz=Math.sqrt(1-r2),light=Math.max(0,nx*-.35+ny*.45+nz*.82),highlight=Math.pow(Math.max(0,nx*-.3+ny*.4+nz*.86),32),i=(y*128+x)*4;
  [255,219,33].forEach((v,c)=>pixels.data[i+c]=Math.min(255,v*(.82+.18*light)+12*highlight));pixels.data[i+3]=255;
 }
 sphereContext.putImageData(pixels,0,0);
 function shape(ctx,mark,time,w,h){
  const xy=p=>[p[0]*w,p[1]*h],scale=w/1000;
  const point=(p,depth=false)=>{const [x,y]=xy(p);
   if(depth){const spec=reference.sphereScale,r=spec.radiusMeters*spec.pixelsPerMeterAt1000*scale;ctx.drawImage(sphere,x-r,y-r,2*r,2*r);return;}
   const r=12*scale;ctx.beginPath();if(mark.surface)ctx.ellipse(x,y,r,r*mark.surface.foreshorten,mark.surface.angle,0,Math.PI*2);else ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=YELLOW;ctx.fill();ctx.lineWidth=3.2*scale;ctx.strokeStyle='white';ctx.stroke();};
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(mark.kind==='point'||mark.kind==='sphere')point(mark.xy,mark.kind==='sphere');
  else if(mark.kind.startsWith('flow')){
   const path=()=>{const pts=mark.path.map(xy);ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=0;i<pts.length-1;i++){if(mark.kind==='flow2')ctx.lineTo(...pts[i+1]);else{const a=pts[Math.max(0,i-1)],b=pts[i],c=pts[i+1],d=pts[Math.min(pts.length-1,i+2)];ctx.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,...c);}}};
   if(mark.kind==='flow2'){
    // A single continuous path gives equal dash spacing at every waypoint;
    // no segment-by-segment dash resets or Bezier overshoot onto distractors.
    ctx.setLineDash([11*scale,7*scale]);ctx.lineCap='butt';
    path();ctx.strokeStyle='rgba(40,43,40,.25)';ctx.lineWidth=5.4*scale;ctx.stroke();
    path();ctx.strokeStyle='rgba(255,255,255,.97)';ctx.lineWidth=3.4*scale;ctx.stroke();ctx.setLineDash([]);
   }else{path();ctx.strokeStyle='white';ctx.lineWidth=10*scale;ctx.stroke();const start=xy(mark.path[0]),end=xy(mark.path.at(-1)),gradient=ctx.createLinearGradient(...start,...end);for(const t of [0,.5,1])gradient.addColorStop(t,'rgb('+referenceFlowColor(t).map(v=>Math.round(v*255)).join(',')+')');path();ctx.strokeStyle=gradient;ctx.lineWidth=6*scale;ctx.stroke();}
  }else if(mark.kind==='grasp'){
   // Supplied gripper asset; a terminal grasp-pose target remains visible.
   if(mark.persist||time<=mark.at*reference.motion.duration){
    const [x,y]=xy(mark.xy),targetTime=mark.at*reference.motion.duration;
    // A Ref is the target hand pose, not a screen-facing icon or a tracker:
    // freeze its orientation at the matching grasp/placement frame.
    const handFrame=liberoHandFrameAt(reference.tracking||{},targetTime),size=(mark.sizePixelsAt1000??84)*scale;
    // Reviewed xy may denote the pad midpoint rather than the glyph origin.
    const padOffset=(mark.contactOffsetMeters??0)*size/.084;
    drawGraspReferenceSolid(ctx,x-handFrame[2][0]*padOffset,y-handFrame[2][1]*padOffset,size,0,handFrame);
   }
  }else if(mark.kind==='angle'){
   if(mark.rays){
    const hinge=xy(mark.xy),target=xy(mark.rays[1]),acute=liberoAcuteAngle(hinge,xy(mark.rays[0]),target);
    ctx.lineWidth=3*scale;ctx.setLineDash([7*scale,5*scale]);
    ctx.strokeStyle='rgba(255,255,244,.9)';ctx.beginPath();ctx.moveTo(...hinge);ctx.lineTo(...acute.baseline);ctx.stroke();
    ctx.strokeStyle=YELLOW;ctx.beginPath();ctx.moveTo(...hinge);ctx.lineTo(...target);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(...hinge,acute.radius,acute.start,acute.start+acute.sweep,acute.sweep<0);ctx.stroke();
    const middle=acute.start+acute.sweep/2,labelRadius=acute.radius+21*scale;
    const label=[hinge[0]+Math.cos(middle)*labelRadius,hinge[1]+Math.sin(middle)*labelRadius];
    ctx.font=`500 ${22*scale}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3*scale;ctx.strokeStyle='rgba(32,42,35,.75)';
    const text=`${Math.round(acute.degrees)}°`;
    ctx.strokeText(text,...label);ctx.fillStyle=YELLOW;ctx.fillText(text,...label);
   }
  }
  ctx.restore();
 }
 function drawTracker(ctx,time,w,h){
  const track=reference.tracking;if(!track?.landmarks?.length)return;
  const p=liberoTrackAt(track.landmarks,time),axes=liberoHandFrameAt(track,time),scale=w/1000,length=43*scale;
  // Project each local axis independently. Retain foreshortening instead of
  // renormalizing every screen arrow to the same length. Back axes draw first.
  ctx.save();ctx.translate(p[0]*w,p[1]*h);ctx.lineCap='round';ctx.lineJoin='round';
  const colors=['#ee3f32','#35f12a','#2449ef'];
  for(const {axis:[dx,dy],color} of axes.map((axis,i)=>({axis,color:colors[i]})).sort((a,b)=>b.axis[2]-a.axis[2])){
   const x=dx*length,y=dy*length,n=Math.hypot(x,y);if(n<.7*scale)continue;
   const ux=x/n,uy=y/n,head=Math.min(5.6*scale,n*.32);
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3.6*scale;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.stroke();
   ctx.beginPath();ctx.moveTo(x+ux*head*.4,y+uy*head*.4);ctx.lineTo(x-ux*head-uy*head*.5,y-uy*head+ux*head*.5);ctx.lineTo(x-ux*head+uy*head*.5,y-uy*head-ux*head*.5);ctx.closePath();ctx.fill();
  }ctx.restore();
 }
 function draw(force=false){
  if(!reference||video.readyState<2)return;
  // Seek targets and currentTime can advance before the decoded image. Use
  // the presented frame's media timestamp for BOTH the image and its markers.
  const frameTime=getFrameTime();if(frameTime===null||!Number.isFinite(frameTime))return;
  const box=frame.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2),key=[box.width,box.height,ratio].join(':');
  if(!box.width||!box.height||(!force&&lastFrame===frameTime&&lastSize===key))return;
  lastFrame=frameTime;lastSize=key;
  const w=Math.round(box.width*ratio),h=Math.round(box.height*ratio);
  if(overlay.width!==w)overlay.width=w;if(overlay.height!==h)overlay.height=h;
  const ctx=overlay.getContext('2d'),vw=video.videoWidth,vh=video.videoHeight;
  const crop=reference.presentationCrop||[0,0,1,1],sx=crop[0]*vw,sy=crop[1]*vh,sw=crop[2]*vw,sh=crop[3]*vh;
  const scale=Math.min(w/sw,h/sh),x=(w-sw*scale)/2,y=(h-sh*scale)/2;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#e9eee8';ctx.fillRect(0,0,w,h);
  // Crop the video and all source-coordinate annotations together, preserving
  // alignment and scale through playback, seeking and responsive resizing.
  ctx.drawImage(video,sx,sy,sw,sh,x,y,sw*scale,sh*scale);
  ctx.save();ctx.beginPath();ctx.rect(x,y,sw*scale,sh*scale);ctx.clip();ctx.translate(x-sx*scale,y-sy*scale);
  reference.marks.forEach(m=>shape(ctx,m,frameTime,vw*scale,vh*scale));
  drawTracker(ctx,frameTime,vw*scale,vh*scale);
  ctx.restore();
 }
 return {select(ref){reference=ref;lastFrame=-1;lastSize='';overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);},draw};
}

function installCuratedLibero(library){
 const dims={point:['x','y'],sphere:['x','y','z'],flow2:['x','y'],flow3:['x','y','z'],grasp:['x','y','z','rx','ry','rz','g'],angle:['rx','ry','rz']};
 for(const ref of library.curatedLibero||[]){
  const duration=ref.motion.duration,knots=Array.from({length:101},(_,i)=>{const u=i/100;return[duration*u,u+.012*Math.sin(2*Math.PI*u)];});
  const progress=t=>PlaybackTiming.at(knots,t);
  ref.playbackSync={knots:[[0,0],[duration,duration]]};
  const anchors=ref.marks.map(mark=>{const p=progress(mark.at*duration);return{label:mark.subject||(mark.kind.startsWith('flow')?'Illustrated flow interval':'Illustrated reference'),p,time:mark.at*duration,videoTime:mark.at*duration,rows:ref.refType==='pose'?['x','y','z','rx','ry','rz','g']:dims[mark.kind],window:mark.start?[progress(mark.start*duration),p]:[Math.max(0,p-.012),Math.min(1,p+.012)]};});
  library.references.push(ref);library.media[ref.media]={video:ref.video,thumbnail:ref.poster,poster:ref.poster};
  library.algorithm[ref.id]={title:ref.taskTitle,task:'libero',refType:library.refTypes[ref.refType],anchors,frames:[],alignment:knots,progressClock:{knots,replayKnots:[[0,0],[duration,duration]]},sourceNote:'Illustrative reference annotation · Video replay; no measured 3D states.',provenance:ref.provenance};
 }
}

'use strict';
(async function(){
 const $=id=>document.getElementById(id),T=THREE,rad=Math.PI/180,workspace=document.querySelector('.workspace'),viewport=$('viewport'),intro=$('intro'),video=$('video'),sceneElement=$('scene'),dissolve=$('pose-dissolve');
 if(location.protocol==='file:'){$('loading').textContent='The demo runs inside this page on GitHub Pages. For a local preview, double-click preview.command in the RoSE_website folder, then open the HTTP address it provides instead of this file:// page.';return;}
 let demoVisible=true;
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='rose-demo-visibility')return;
  demoVisible=event.data.visible===true;
  if(!demoVisible)video.pause();
 });
 if(window.parent!==window)window.parent.postMessage({type:'rose-demo-ready'},location.origin);
 try{
  await new Promise(r=>requestAnimationFrame(r));
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const unpack=async id=>{
   const response=await fetch($(id).dataset.src);
   if(!response.ok)throw Error('Unable to load '+id+' ('+response.status+')');
   return JSON.parse(pako.ungzip(new Uint8Array(await response.arrayBuffer()),{to:'string'}));
  };
  const [data,library]=await Promise.all([unpack('model-data'),unpack('library-data')]);
  const waterLayout=library.references.find(r=>r.task==='water').motion.layout;
  const compact=document.body.dataset.layout==='compact';let viewSpan=.4;if(compact)installCuratedLibero(library);
  const scene=new T.Scene(),flatCamera=new T.OrthographicCamera(-.4,.4,.2,-.2,.01,25),depthCamera=new T.PerspectiveCamera(compact?50:37,1,.01,25);
  let camera=compact?flatCamera:depthCamera;flatCamera.up.set(0,0,1);depthCamera.up.set(0,0,1);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xf8f7f0);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','Franka FR3 fixed reference animation');viewport.prepend(renderer.domElement);
  const orbit=new T.OrbitControls(camera,renderer.domElement);orbit.mouseButtons.LEFT=T.MOUSE.PAN;orbit.mouseButtons.RIGHT=T.MOUSE.ROTATE;orbit.touches.ONE=T.TOUCH.PAN;orbit.touches.TWO=T.TOUCH.DOLLY_ROTATE;orbit.trackpadRotate=true;orbit.screenSpacePanning=true;orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.minDistance=.5;orbit.maxDistance=4;orbit.minPolarAngle=rad;orbit.maxPolarAngle=75*rad;orbit.rotateSpeed=.35;orbit.zoomSpeed=.75;
  scene.add(new T.AmbientLight(0xffffff,.48),new T.HemisphereLight(0xf0f6ff,0x8b9f83,.48));const key=new T.DirectionalLight(0xfff8ed,.9);key.position.set(.2,-1.8,3.5);key.target.position.set(.4,0,0);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5,near:.1,far:7});key.shadow.bias=-.0001;key.shadow.normalBias=.001;scene.add(key,key.target);const fill=new T.DirectionalLight(0xe2eeff,.45);fill.position.set(1.7,1.5,2);scene.add(fill);
  const material=(color,roughness=.5,metalness=0)=>new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness,metalness});const alloy=material(0xc1c5c5,.36,.63),rubber=material(0x3e4444,.88);
  function mesh(geo,mat,parent=scene,pos=[0,0,0]){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(size,pos,mat,parent=scene){return mesh(new T.BoxGeometry(...size),mat,parent,pos);}
  function cylinder(radius,height,pos,mat,parent=scene){const m=mesh(new T.CylinderGeometry(radius,radius,height,64),mat,parent,pos);m.rotation.x=Math.PI/2;return m;}
  function lathe(profile,mat,parent){const geo=new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),80);geo.rotateX(Math.PI/2);return mesh(geo,mat,parent);}
  const cupTable=new T.Group();scene.add(cupTable);box([1.11,.83,.045],[.345,0,-.026],material(0xbfc3bc,.48,.28),cupTable);box([1.105,.822,.006],[.345,0,-.006],material(0xd7dbc7,.7),cupTable);box([.65,.815,.003],[.295,0,-.0015],material(0x079e8b,.77),cupTable);box([.275,.815,.003],[.7575,0,-.0015],material(0xe0d785,.82),cupTable);box([.183,.815,.004],[-.1215,0,-.001],alloy,cupTable);for(let y=-.392;y<.4;y+=.027)box([.183,.0022,.001],[-.1215,y,.0012],material(0x5f6b69,.52,.6),cupTable);const cc=library.cameras.cup;cupTable.scale.set((cc.matFront-cc.matBack)/.65,cc.tableWidth/.815,1);cupTable.position.x=cc.matBack+.03*cupTable.scale.x;
  const waterTable=new T.Group();waterTable.scale.y=1.27;scene.add(waterTable);box([1.14,1.29,.038],[.33,0,-.025],alloy,waterTable);box([.78,1.28,.008],[.51,0,-.004],material(0x33a993,.85),waterTable);box([.36,1.28,.01],[-.06,0,-.005],alloy,waterTable);for(let y=-.62;y<.64;y+=.03)box([.356,.0025,.001],[-.06,y,.0005],material(0x647974,.6,.4),waterTable);
    const modelCache = {};
    function model(name) {
      if(!modelCache[name]) {
        const g = new THREE.Group();
        data[name].forEach(part => {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(decode(part.p).buffer),3));
          geo.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(decode(part.n).buffer),3,true));
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(part.i).buffer),1));
          geo.computeBoundingSphere();
          const isFranka = name.startsWith('link');
          const bright = Math.max(...part.c) > .55;
          const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(...part.c),roughness:bright?.38:.48,metalness:isFranka?.06:.30 });
          mesh(geo,mat,g);
        });
        modelCache[name] = g;
      }
      return modelCache[name].clone();
    }
    const robot = new THREE.Group(); robot.name = 'Franka FR3'; scene.add(robot);
    robot.add(model('link0'));
    const offsets = [[0,0,.333],[0,0,0],[0,-.316,0],[.0825,0,0],[-.0825,.384,0],[0,0,0],[.088,0,0]];
    const rolls = [0,-Math.PI/2,Math.PI/2,Math.PI/2,-Math.PI/2,Math.PI/2,Math.PI/2];
    const joints = [];
    let parent = robot;
    for(let i=0;i<7;i++) {
      const origin = new THREE.Group(); origin.position.set(...offsets[i]); origin.rotation.x = rolls[i]; parent.add(origin);
      const joint = new THREE.Group(); joint.name = `fr3_joint${i+1}`; origin.add(joint); joint.add(model(`link${i+1}`)); joints.push(joint); parent = joint;
    }
    const flange = new THREE.Group(); flange.position.z = .107; parent.add(flange);
    cylinder(.031,.012,[0,0,.006],alloy,flange);
    const gripper = new THREE.Group(); gripper.position.z = .012; gripper.name = 'Robotiq 2F-85'; flange.add(gripper);
    gripper.add(model('base_link'));
    const fingerJoints=[];
    for(const sign of [-1,1]) {
      const mount = new THREE.Group(); mount.position.set(0,sign*.0306011,.054904); mount.rotation.z = sign===-1?Math.PI:0; gripper.add(mount);
      const knuckle = new THREE.Group(); mount.add(knuckle); knuckle.add(model('outer_knuckle'));
      const outer = new THREE.Group(); outer.position.set(0,.0315,-.0041); knuckle.add(outer); outer.add(model('outer_finger'));
      const inner = new THREE.Group(); inner.position.set(0,.0061,.0471); outer.add(inner); inner.add(model('inner_finger'));
      box([.022,.00635,.0375],[0,-.0220203446692936,.03242],rubber,inner);
      const innerMount = new THREE.Group(); innerMount.position.set(0,sign*.0127,.06142); innerMount.rotation.z=sign===-1?Math.PI:0; gripper.add(innerMount);
      const innerKnuckle = new THREE.Group(); innerMount.add(innerKnuckle); innerKnuckle.add(model('inner_knuckle'));
      fingerJoints.push({knuckle,inner,innerKnuckle});
    }
    // Power indicator inset on the base; the only emissive object in the scene.
    const green = new THREE.MeshStandardMaterial({color:0x65ee91,emissive:0x39d978,emissiveIntensity:.45,roughness:.34});
    for(const y of [-.073,.073]) box([.010,.003,.035],[.012,y,.065],green,robot);
  const plate=new T.Group();scene.add(plate);lathe([[0,.009],[.055,.009],[.064,.010],[.071,.012],[.083,.019],[.087,.020],[.089,.019],[.089,.016],[.083,.014],[.070,.007],[.060,.004],[.050,.004],[.047,.001],[.041,.001],[.040,.004],[0,.005]],material(0xf2f3ee,.25,.02),plate);
  const cup=new T.Group();scene.add(cup);const blue=material(0x087cd5,.28,.025);lathe([[0,0],[.026,0],[.027,.003],[.0325,.087],[.0325,.090],[.031,.091],[.0299,.090],[.0299,.086],[.0245,.006],[0,.006]],blue,cup);mesh(new T.TorusGeometry(.0312,.0011,10,80),blue,cup,[0,0,.09]);
  const glass=new T.MeshPhysicalMaterial({color:0xaacfd7,roughness:.13,metalness:.04,transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false}),glassEdge=new T.LineBasicMaterial({color:0x527985,transparent:true,opacity:.7});
  function circle(r,z,parent,mat=glassEdge){const pts=Array.from({length:81},(_,i)=>new T.Vector3(r*Math.cos(i*Math.PI/40),r*Math.sin(i*Math.PI/40),z));parent.add(new T.Line(new T.BufferGeometry().setFromPoints(pts),mat));}
  function vessel(r,h){const g=new T.Group();const m=lathe([[0,0],[r-.0015,0],[r,.002],[r,h],[r-.0015,h],[r-.0015,.003],[0,.003]],glass,g);m.castShadow=m.receiveShadow=false;circle(r,h,g);circle(r,0,g);const contours=[];for(const a of [0,Math.PI/2,Math.PI,1.5*Math.PI])contours.push(new T.Vector3(r*Math.cos(a),r*Math.sin(a),.002),new T.Vector3(r*Math.cos(a),r*Math.sin(a),h));g.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(contours),new T.LineBasicMaterial({color:0x769ca4,transparent:true,opacity:.42})));const marks=[];for(let i=1;i<10;i++){const len=i%5===0?.008:.004;marks.push(new T.Vector3(r+.0004,-len,h*i/10),new T.Vector3(r+.0004,len,h*i/10));}g.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(marks),new T.LineBasicMaterial({color:0xf4f4df,transparent:true,opacity:.8})));return g;}
  const beaker=vessel(waterLayout.beaker.radius,waterLayout.beaker.height);beaker.position.fromArray(waterLayout.beaker.position);scene.add(beaker);const liquid=material(0xed8f26,.27,.01);liquid.transparent=true;liquid.opacity=.91;cylinder(waterLayout.beaker.radius-.0028,waterLayout.beaker.height*.65,[0,0,waterLayout.beaker.height*.325+.003],liquid,beaker);
  const tubeRig=new T.Group();scene.add(tubeRig);const tubeAlign=new T.Group();tubeAlign.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...waterLayout.tube.localAxis));tubeAlign.position.fromArray(waterLayout.tube.centerOffset);const tube=vessel(waterLayout.tube.radius,waterLayout.tube.length);tube.position.z=-waterLayout.tube.length/2;tubeAlign.add(tube);tubeRig.add(tubeAlign);
  const pickReference=library.references.find(r=>r.task==='pick');
  let simulation=null,simulationPromise=null,referenceRequest=0;
  const ensureSimulation=()=>{
   if(!simulationPromise)simulationPromise=createPickSimulation({scene,motion:pickReference.motion,models:JSON.parse($('panda-data').textContent),graspMarker:library.graspMarker}).then(result=>{simulation=result;simulation.setVisible(false);return result;}).catch(error=>{simulationPromise=null;throw error;});
   return simulationPromise;
  };
  const cupRefs=new T.Group();scene.add(cupRefs);
  const refSphereGeometry=new T.SphereGeometry(ReferenceVisualSpec.sphereRadiusMeters,32,24),refSphereMaterial=createReferenceSphereMaterial();
  function updateCupReferences(ref){
   cupRefs.traverse(o=>{if(o.geometry&&o.geometry!==refSphereGeometry)o.geometry.dispose();if(o.material&&o.material!==refSphereMaterial)o.material.dispose();});cupRefs.clear();if(ref.task!=='cup')return;
   if(['pose','mix'].includes(ref.refType)){
    const targets=ref.poseReferences||[{time:7,position:ref.motion.layout.cupHome.map((v,i)=>v+ref.motion.layout.graspOffset[i]),basis:ref.graspReferenceBasis}];
    for(const target of targets){const marker=createGraspReference3D(),basis=target.basis||{y:[0,1,0],z:[0,0,1]},y=new T.Vector3(...basis.y),z=new T.Vector3(...basis.z),x=y.clone().cross(z).normalize();marker.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));marker.position.fromArray(target.position);marker.userData.graspTime=target.time;cupRefs.add(marker);}
   }
   if(ref.refType==='pose')return;
   if(ref.refType==='3d-flow'){cupRefs.add(createGradientReferenceFlow(ref.referencePath));return;}
   const placed=ref.motion.layout.cupPlaced;
   if(ref.placementReferenceType==='2d-keypoint'){
    const border=new T.Mesh(new T.CircleGeometry(.012,48),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,toneMapped:false}));border.position.set(placed[0],placed[1],.021);cupRefs.add(border);
    const point=new T.Mesh(new T.CircleGeometry(.008,48),new T.MeshBasicMaterial({color:0xffdb21,side:T.DoubleSide,toneMapped:false}));point.position.set(placed[0],placed[1],.0213);cupRefs.add(point);return;
   }
   const points=ref.referencePoints?ref.referencePoints.map(p=>p.position):[[placed[0],placed[1],.024],...(ref.intermediateReferences||[]).map(p=>p.position)];
   for(const point of points){const ball=new T.Mesh(refSphereGeometry,refSphereMaterial);ball.position.fromArray(point);ball.renderOrder=15;ball.castShadow=true;cupRefs.add(ball);}
  }
  const tcp=new T.Object3D();gripper.add(tcp);tcp.add(createTCPFrameTracker());const actualTCP=new T.Vector3(),actualRotation=new T.Quaternion(),cupOffset=new T.Vector3(),flip=new T.Quaternion(1,0,0,0);
  const pad=a=>.054904+.0376*Math.sin(a)+.043*Math.cos(a)+.03242;
  let renderSamples=null;
  let selectionRevision=0,current=null,mode='video',playing=false,time=0,transition=null,cameraTween=null,flowPresentation=null,flowDepth=0,lastStamp=performance.now(),size='',lastRealTask='cup',lastRef={cup:'cup-left',water:'water-1',pick:'pick-236-2d-flow'};
  let autoCamera=compact,shot=null;
  let presentedVideoTime=0,hasPresentedFrame=false,videoFrameHandle=null,pendingVideoSeek=null;
  const hasVideoFrameCallback=typeof video.requestVideoFrameCallback==='function';
  const timingKnots=()=>current.playbackSync?.knots||[[0,0],[current.motion.duration,current.motion.duration]];
  const playbackStart=()=>compact?timingKnots()[0][1]:0;
  const playbackEnd=()=>compact?timingKnots().at(-1)[1]:current.motion.duration;
  function resetVideoClock(){
   if(videoFrameHandle!==null&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrameHandle);
   presentedVideoTime=0;hasPresentedFrame=false;pendingVideoSeek=null;
   if(!hasVideoFrameCallback)return;
   const revision=selectionRevision;
   const capture=(_now,metadata)=>{if(revision!==selectionRevision)return;if(pendingVideoSeek===null||(!video.seeking&&Math.abs(metadata.mediaTime-pendingVideoSeek)<.08)){presentedVideoTime=metadata.mediaTime;hasPresentedFrame=true;pendingVideoSeek=null;if(current?.task==='libero')liberoView.draw();}videoFrameHandle=video.requestVideoFrameCallback(capture);};
   videoFrameHandle=video.requestVideoFrameCallback(capture);
  }

  let presentation=compact||document.body.dataset.defaultView==='algorithm'?'algorithm':'demo';
  const presentationButtons=[...document.querySelectorAll('[data-presentation]')];
  function seekAlgorithm(t){if(mode!=='rollout')return;setPlaying(false);setTime(t);syncVideoTime();}
  function seekVideoClock(seconds){if(mode!=='rollout')return;setPlaying(false);hasPresentedFrame=false;pendingVideoSeek=seconds;presentedVideoTime=seconds;video.currentTime=seconds;setTime(PlaybackTiming.at(timingKnots(),seconds));}
  function seekProgressClock(p){const curve=library.algorithm[current.id].progressClock?.knots;if(compact&&curve)seekVideoClock(PlaybackTiming.inverse(curve,p));else seekAlgorithm(progressToTime(p));}
  const currentVideoTime=()=>pendingVideoSeek!==null?pendingVideoSeek:video.ended?video.duration:hasPresentedFrame?presentedVideoTime:video.currentTime;
  function progressToTime(p){
   const clock=library.algorithm[current.id].progressClock;if(clock)return PlaybackTiming.at(clock.replayKnots,PlaybackTiming.inverse(clock.knots,p));
   const alignment=library.algorithm[current.id].alignment;
   if(p<=alignment[0][1])return alignment[0][0];
   for(let i=1;i<alignment.length;i++){const a=alignment[i-1],b=alignment[i];if(p<=b[1])return a[0]+(b[0]-a[0])*(p-a[1])/(b[1]-a[1]);}
   return alignment[alignment.length-1][0];
  }
  const liberoView=compact?createLiberoReferenceView({video,viewport,frame:document.querySelector('.video-frame'),graspMarker:library.graspMarker,getFrameTime:()=>hasVideoFrameCallback?(hasPresentedFrame&&pendingVideoSeek===null?presentedVideoTime:null):(video.seeking?null:video.currentTime)}):null;
  const algorithmPanel=createAlgorithmPanel({root:$('algorithm-panel'),onSeek:seekAlgorithm,onProgressSeek:p=>seekProgressClock(p),onAnchorFocus:a=>compact&&Number.isFinite(a.videoTime)?seekVideoClock(Math.min(a.videoTime+1e-4,timingKnots().at(-1)[0])):seekAlgorithm(a.time)});
  function updatePresentation(){
   algorithmPanel.setVisible(presentation==='algorithm'&&mode!=='video');
   presentationButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.presentation===presentation)));
   algorithmPanel.update({time,mode,playing,videoTime:currentVideoTime()});
  }
  presentationButtons.forEach(b=>b.addEventListener('click',()=>{
   if(transition||flowPresentation)return;
   presentation=b.dataset.presentation;cameraTween=null;orbit.stopMotion();updatePresentation();resize();
  }));
  $('method-notes')?.addEventListener('click',()=>$('method-dialog').showModal());
  $('close-method').addEventListener('click',()=>$('method-dialog').close());
  $('method-dialog').addEventListener('click',event=>{if(event.target===$('method-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  function applySample(sample){const q=Array.isArray(sample)?sample.slice(1,8):sample.q,a=Array.isArray(sample)?sample[8]:sample.gripAngle;joints.forEach((j,i)=>j.rotation.z=q[i]);fingerJoints.forEach(f=>{f.knuckle.rotation.x=a;f.inner.rotation.x=-a;f.innerKnuckle.rotation.x=a;});tcp.position.z=pad(a);robot.updateMatrixWorld(true);tcp.getWorldPosition(actualTCP);tcp.getWorldQuaternion(actualRotation);if(current.task==='cup'){const layout=current.motion.layout;if(time<7){cup.position.fromArray(layout.cupHome);cup.quaternion.identity();}else if(time<=14){cup.quaternion.copy(actualRotation).multiply(flip);cup.position.copy(actualTCP).sub(cupOffset.fromArray(layout.graspOffset).applyQuaternion(cup.quaternion));}else{cup.position.fromArray(layout.cupPlaced);cup.quaternion.identity();}}else{tubeRig.position.copy(actualTCP);tubeRig.quaternion.copy(actualRotation);}}
  function setTime(t){
   time=T.MathUtils.clamp(t,0,current.motion.duration);const m=current.motion;
   if(current.task==='libero')return;
   if(current.task==='pick')simulation.applyAt(time);
   else{const samples=renderSamples||m.samples;const values=ReplaySmoothing.interpolate(samples,time,s=>Array.isArray(s)?s[0]:s.time,s=>Array.isArray(s)?s.slice(1):[...s.q,s.gripAngle]);if(current.task==='cup')applySample([time,...values]);else applySample({q:values.slice(0,7),gripAngle:values[7]});}
   if($('scrub'))$('scrub').value=time;if($('elapsed'))$('elapsed').textContent=`${time.toFixed(1)} / ${m.duration.toFixed(1)} s`;
   $('phase').textContent=current.task==='pick'?(time<m.events.closeStart?'Approach the cube':time<m.events.liftStart?'Grasp the cube':time<m.events.successTime?'Lift toward the goal':'Goal reached'):current.task==='cup'?(time<6?'Approach the cup':time<7?'Grasp the '+current.graspSide+' rim':time<14?'Carry to the reference':time<15?'Place and release':compact?'Reference reached':time<18?'Withdraw':'Reference reached'):(time>=m.matchTime?'Hold the reference orientation':time<m.duration*.25?'Approach the beaker':'Rotate toward the reference');
  }
  function syncVideoTime(){if(compact&&Number.isFinite(video.duration)&&current){const target=PlaybackTiming.inverse(timingKnots(),time);if(Math.abs(video.currentTime-target)>.0005){hasPresentedFrame=false;pendingVideoSeek=target;video.currentTime=target;}}}
  function setPlaying(value){playing=value;
   if(compact&&current){
    if(value){algorithmPanel.setPrediction(true);const revision=selectionRevision;video.play().catch(()=>{if(revision===selectionRevision){setPlaying(false);$('video-note').textContent='Press Start to play both views.';}});}
    else video.pause();
   }
   $('play').textContent=compact?(value?'Pause':'Start'):(value?'Ⅱ':'▶');$('play').setAttribute('aria-label',(value?'Pause ':'Play ')+(current?.task==='libero'?'reference video':'3D rollout'));}
  function viewAspect(){return viewport.clientWidth/viewport.clientHeight;}
  function resize(){
   const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;
   const key=`${w}:${h}`;if(size===key)return;size=key;
   renderer.setSize(w,h,false);camera.aspect=w/h;updateCameraProjection();
  }
  function updateCameraProjection(){if(camera.isOrthographicCamera){const aspect=viewAspect();camera.left=-viewSpan*aspect/2;camera.right=viewSpan*aspect/2;camera.top=viewSpan/2;camera.bottom=-viewSpan/2;}camera.updateProjectionMatrix();}
  function viewPose(name){
   if(compact){
    let center,extent;
    if(current.task==='pick'){
     const pts=(current.components||[]).flatMap(c=>c.points).map(p=>new T.Vector3(...p.position));
     pts.push(new T.Vector3(...current.motion.samples[0].tcpPosition),new T.Vector3(...current.motion.samples[0].cubePosition),new T.Vector3(...current.motion.goal));
     const box=new T.Box3().setFromPoints(pts);center=box.getCenter(new T.Vector3());extent=box.getSize(new T.Vector3());
     center.z=Math.max(.18,center.z);
    }else if(current.task==='cup'){center=new T.Vector3(.49,.01,.17);extent=new T.Vector3(.30,.22,.28);}
    else{center=new T.Vector3(.5,.28,.16);extent=new T.Vector3(.13,.45,.32);}
    if(current.showcaseInstruction&&name==='detail'){
     center.set(.51,0,.105);const azimuth=-55*rad,elevation=38*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.43,.43/viewAspect())};
    }
    if(current.task==='cup'&&current.refType==='3d-keypoint'&&name==='detail'){
     const targets=(current.referencePoints||[]).map(p=>new T.Vector3(...p.position));
     center=targets.length?new T.Box3().setFromPoints(targets).getCenter(new T.Vector3()):new T.Vector3(.525,.015,.115);
     center.z+=.025;
     const azimuth=-70*rad,elevation=20*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.36,.36/viewAspect())};
    }
    if(current.task==='pick'&&current.motion.task==='PushCube-v1'&&name==='detail'){
     if(current.refType==='2d-flow'){
      // Look across the pushing direction: X is horizontal in the image and
      // the goal is an ellipse, matching the close oblique reference view.
      const span=Math.max(.32,.52/viewAspect());
      center.set(current.motion.goal[0]-.10,current.motion.goal[1],span*.30);
      const elevation=38*rad;
      return{target:center,position:center.clone().add(new T.Vector3(0,-Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span};
     }
     center.z=.075;
     const azimuth=-48*rad,elevation=60*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.40,(Math.max(extent.x,extent.y)+.18)/viewAspect())};
    }
    if(current.id==='cup-grasp-left'&&name==='detail'){
     // See the local YZ grasp plane broadly instead of nearly edge-on.
     // The robot and both target grippers keep their matching physical pose.
     center.set(.49,.015,.12);
     const elevation=44*rad,azimuth=-35*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.43,.43/viewAspect())};
    }
    if(current.id==='pick-226-3d-keypoint'&&name==='detail'){
     const targets=current.components.flatMap(c=>c.points).map(p=>new T.Vector3(...p.position));
     center=new T.Box3().setFromPoints(targets).getCenter(new T.Vector3());center.z+=.055;
     const elevation=62*rad,azimuth=-48*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.32,.39/viewAspect())};
    }
    if(current.id==='pick-136-orientation'&&name==='detail'){
     center.set(current.motion.goal[0]-.015,current.motion.goal[1]+.015,.20);
     return{target:center,position:center.clone().add(new T.Vector3(1.35,-1,.9)),span:Math.max(.36,.40/viewAspect())};
    }
    if(current.id==='pick-199-mix'&&name==='detail'){
     const q=new T.Quaternion(...current.motion.samples.at(-1).tcpQuaternion).normalize(),normal=new T.Vector3(1,0,0).applyQuaternion(q);
     if(normal.z<0)normal.negate();
     const elevation=Math.asin(T.MathUtils.clamp(normal.z,0,1)),azimuth=Math.atan2(-1,1.35);
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.40,.40/viewAspect())};
    }
    if(current.task==='pick'&&current.motion.task==='PickCube-v1'&&current.refType==='2d-flow'&&name==='detail'){
     // Close oblique overhead view: wrist at left, table reference extending right.
     center.set(-.03,0,.24);
     const elevation=88*rad,azimuth=-31*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.36,.40/viewAspect())};
    }
    if(current.id==='pick-081-3d-flow'&&name==='detail'){
     // Hold a gripper-scale close-up throughout the constant-speed orbit.
     // Frame the lift reference, not the entire arm or its approach envelope.
     center.set(.008,.075,.16);
     const azimuth=-25*rad,elevation=36*rad;
     return{target:center,position:center.clone().add(new T.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation)).multiplyScalar(1.7)),span:Math.max(.34,.36/viewAspect())};
    }
    if(current.id==='pick-039-pose'&&name==='detail'){
     return{target:center,position:center.clone().add(new T.Vector3(1.35,-1,.8)),span:Math.max(.59,extent.z+.28,(Math.max(extent.x,extent.y)+.35)/viewAspect())};
    }
    if(current.task==='pick'&&current.motion.task==='PickCube-v1'&&name==='detail'){
     const offset=new T.Vector3(1.35,-1,.8);
     return{target:center,position:center.clone().add(offset),span:Math.max(.52,extent.z+.25,(Math.max(extent.x,extent.y)+.28)/viewAspect())};
    }
    const front=name==='front' ,side=name==='side',top=name==='top';
    let span;
    if(top)span=Math.max(.32,extent.x+.14,(extent.y+.16)/viewAspect());
    else if(front||side)span=Math.max(.60,extent.z+.28,((front?extent.y:extent.x)+.16)/viewAspect());
    else span=current.task==='pick'?Math.max(.30,extent.z+.14,(Math.max(extent.x,extent.y)+.15)/viewAspect()):current.task==='cup'?Math.max(.41,.43/viewAspect()):Math.max(.38,.52/viewAspect());
    const az=Math.atan2(camera.position.y-orbit.target.y,camera.position.x-orbit.target.x);
    const offset=top?new T.Vector3(.0001*Math.cos(az),.0001*Math.sin(az),1.7):front?new T.Vector3(1.7,0,0):side?new T.Vector3(0,-1.7,0):current.task==='water'?new T.Vector3(1.7,-.08,.50):new T.Vector3(1.1,-1.25,1.0);
    return{target:center,position:center.clone().add(offset),span};
   }
   let target,position;
   if(current.task==='pick'){
    if(name==='top'){
     const range=current.motion.flow.range;target=new T.Vector3((range.min[0]+range.max[0])/2,(range.min[1]+range.max[1])/2,current.motion.flow.planeZ);
     const span=Math.max(.30,.23/viewAspect()),height=span/(2*Math.tan(37*rad/2));
     const extra=mode==='rollout'?Math.max(...current.motion.flow.points.map(p=>p.position[2])):0;
     position=target.clone().add(new T.Vector3(.0045,.016,height+extra));
    }else if(name==='detail'){target=new T.Vector3(.015,.02,.13);position=new T.Vector3(.26,.68,.39);}
    else{target=new T.Vector3(-.22,0,.27);position=new T.Vector3(1.07,.60,.77);}
   }else if(current.task==='cup'){target=name==='detail'?new T.Vector3(.47,.015,.13):new T.Vector3(.31,.015,.29);position=name==='top'?new T.Vector3(.31,.015,1.85):name==='detail'?new T.Vector3(1.08,-.44,.57):new T.Vector3(1.36,-.88,.91);}
   else{target=name==='detail'?new T.Vector3(.48,.30,.205):new T.Vector3(.25,.18,.32);position=name==='detail'?new T.Vector3(1.26,.30,.44):new T.Vector3(1.63,-.32,1.04);}
   if(compact&&name==='perspective'){
    if(current.task==='pick'){
     const pts=(current.components||[]).flatMap(c=>c.points),box=new T.Box3().setFromPoints(pts.map(p=>new T.Vector3(...p.position)));
     target=box.getCenter(new T.Vector3());target.z=Math.max(.10,target.z);
     const yz=current.components?.some(c=>c.plane==='yz');
     const extent=box.getSize(new T.Vector3()),distance=Math.max(.52,(extent.z+.14)/(2*Math.tan(37*rad/2)),(extent.y+.16)/(2*Math.tan(37*rad/2)*viewAspect()));
     position=target.clone().add(yz?new T.Vector3(distance,0,.001):new T.Vector3(.40,-.48,.30));
    }else if(current.task==='cup'){
     target=new T.Vector3(.50,.005,.085);position=target.clone().add(new T.Vector3(.44,-.43,.38));
    }else{target=new T.Vector3(.50,.27,.14);position=target.clone().add(new T.Vector3(.68,-.025,.24));}
   }
   if(!(current.task==='pick'&&(name==='top'||(compact&&name==='perspective')))){
    const scale=Math.max(1,.72/viewAspect());position.sub(target).multiplyScalar(scale).add(target);
   }
   return{position,target};
  }
  // Constant angular speed along the shortest arc, with a level Z-up horizon.
  function blendView(from,targetFrom,to,targetTo,u){
   const a=from.clone().sub(targetFrom),b=to.clone().sub(targetTo),ra=a.length(),rb=b.length();
   a.normalize();b.normalize();const turn=new T.Quaternion().setFromUnitVectors(a,b),rotation=new T.Quaternion().slerp(turn,u);
   orbit.target.lerpVectors(targetFrom,targetTo,u);camera.position.copy(a.applyQuaternion(rotation).multiplyScalar(T.MathUtils.lerp(ra,rb,u))).add(orbit.target);camera.lookAt(orbit.target);
  }
  function fixedTop(){return false;} // Push Cube now defaults to high oblique; manual Top remains available.
  function hasCameraMotion(){return compact&&!fixedTop()&&!current.refType?.startsWith('2d')&&current.refType!=='orientation'&&current.id!=='cup-grasp-left';}
  function cameraFocus(){return current.task==='pick'?simulation.tcpWorld():actualTCP.clone();}
  function captureShot(){
   if(!compact||!current)return;
   const span=camera.isPerspectiveCamera?2*camera.position.distanceTo(orbit.target)*Math.tan(camera.fov*rad/2)/camera.zoom:viewSpan/camera.zoom;
   const orbitOnly=['3d-flow','3d-keypoint','pose','mix'].includes(current.refType);
   const turnDegrees=current.refType==='3d-flow'?60:current.task==='cup'&&current.refType==='3d-keypoint'?(current.id==='cup-left'?45:20):current.task==='cup'&&current.refType==='mix'?-20:25;
   let endAzimuth=null;
   if(current.id==='pick-199-mix'){
    const normal=new T.Vector3(1,0,0).applyQuaternion(new T.Quaternion(...current.motion.samples.at(-1).tcpQuaternion).normalize());
    if(normal.z<0)normal.negate();endAzimuth=Math.atan2(normal.y,normal.x);
   }
   const clock=timingKnots(),videoStart=PlaybackTiming.inverse(clock,time);
   shot={position:camera.position.clone(),target:orbit.target.clone(),span,focus:cameraFocus(),elapsed:0,duration:Math.max(.1,clock.at(-1)[0]-videoStart),orbitOnly,turnDegrees,endAzimuth};
  }
  function setAutoCamera(enabled){
   autoCamera=enabled&&hasCameraMotion();
   if(autoCamera){cameraTween=null;orbit.stopMotion();captureShot();}
  }
  function advanceCamera(dt){
   if(!autoCamera||!hasCameraMotion()||!playing||mode!=='rollout'||cameraTween)return;
   if(!shot)captureShot();
   // Camera motion uses elapsed playback seconds, never the nonlinear robot
   // clock or progress. Seeking preserves the current viewpoint; paused or
   // buffering video freezes it. Bounded render deltas prevent tab-wake jumps.
   if(video.paused||video.seeking||video.readyState<3)return;
   shot.elapsed=Math.min(shot.duration,shot.elapsed+Math.max(0,Math.min(dt,.06))*video.playbackRate);
   const u=shot.elapsed/shot.duration;
   const offset=shot.position.clone().sub(shot.target),radius=offset.length();
   const startTheta=Math.atan2(offset.y,offset.x),startPhi=Math.acos(T.MathUtils.clamp(offset.z/radius,-1,1));
   // Keep spatial references legible: pure, level orbits with no target follow,
   // zoom, or vertical motion. The Mix gripper ends facing the recorded YZ plane.
   if(current.id==='pick-226-3d-keypoint'){
    // Descend smoothly from an elevated detail view to reveal depth between
    // the five targets. Keep the focal point, distance and azimuth steady.
    const phi=T.MathUtils.lerp(startPhi,Math.PI/2-18*rad,u);
    orbit.target.copy(shot.target);
    camera.position.set(radius*Math.sin(phi)*Math.cos(startTheta),radius*Math.sin(phi)*Math.sin(startTheta),radius*Math.cos(phi)).add(shot.target);
    viewSpan=shot.span;camera.zoom=1;updateCameraProjection();camera.lookAt(orbit.target);
   }else if(shot.orbitOnly){
    const turn=shot.endAzimuth===null?shot.turnDegrees*rad:Math.atan2(Math.sin(shot.endAzimuth-startTheta),Math.cos(shot.endAzimuth-startTheta));
    const theta=startTheta+u*turn;
    orbit.target.copy(shot.target);
    camera.position.set(radius*Math.sin(startPhi)*Math.cos(theta),radius*Math.sin(startPhi)*Math.sin(theta),offset.z).add(shot.target);
    viewSpan=shot.span;camera.zoom=1;updateCameraProjection();camera.lookAt(orbit.target);
   }
  }
  function setView(name,animate=true){
   orbit.stopMotion();const pose=viewPose(name);
   if(compact&&camera.isPerspectiveCamera)pose.position.sub(pose.target).setLength(pose.span/(2*Math.tan(camera.fov*rad/2))).add(pose.target);
   if(compact){viewSpan/=camera.zoom;camera.zoom=1;updateCameraProjection();}
   if(animate)cameraTween={start:performance.now(),from:camera.position.clone(),targetFrom:orbit.target.clone(),fromSpan:viewSpan,...pose};
   else{cameraTween=null;camera.position.copy(pose.position);orbit.target.copy(pose.target);if(compact)viewSpan=pose.span;else camera.fov=37;updateCameraProjection();camera.lookAt(orbit.target);orbit.update();}
   if(!animate)captureShot();
   document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{if(mode==='rollout'){setAutoCamera(false);setView(b.dataset.view);}}));orbit.addEventListener('start',()=>{setAutoCamera(false);cameraTween=null;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed','false'));});
  function diagram(){const n=current.number;if(current.kind==='flow'){
   const flow=current.motion.flow,r=flow.range,scale=Math.min(150/(r.max[0]-r.min[0]),115/(r.max[1]-r.min[1]));
   $('diagram').innerHTML='<rect x="17" y="10" width="186" height="145" rx="12" fill="#f1f0e6"/>'+flow.points.map((p,i)=>{const x=110+(p.position[0]-(r.min[0]+r.max[0])/2)*scale,y=82-(p.position[1]-(r.min[1]+r.max[1])/2)*scale;return `<circle cx="${x}" cy="${y}" r="6" fill="#f6d025" stroke="#fffdf1" stroke-width="2"/><text x="${x+(p.event==='grasp'?-13:10)}" y="${y+3}" font-size="9" fill="#8c7830">${i+1}</text>`;}).join('');$('diagram-caption').textContent=`${current.motion.flow.count} points · Top projection`;
  }else if(current.kind==='position'){const points=[[60,77],[160,77],[110,77],[110,122]];$('diagram').innerHTML='<ellipse cx="110" cy="85" rx="96" ry="68" fill="#eeeee5" stroke="#dcded4"/><ellipse cx="110" cy="85" rx="81" ry="55" fill="#fafbf5"/><path class="diagram-line" d="M49 35L171 135M171 35L49 135"/>'+points.map(([x,y],i)=>`<g class="${n===i+1?'':'diagram-muted'}"><circle cx="${x}" cy="${y}" r="18" fill="#f8d32d" stroke="${n===i+1?'#fff':'none'}" stroke-width="3"/><text x="${x}" y="${y}" class="diagram-number">${i+1}</text></g>`).join('');$('diagram-caption').textContent=`Ref ${n} · ${current.label}`; }else if(current.kind==='grasp'){$('diagram').innerHTML=`<image href="${library.graspMarker}" x="78" y="43" width="64" height="68"/>`;$('diagram-caption').textContent=`Grasp pose · ${current.graspSide==='left'?'Left':'Right'} rim`;}else{const a=(current.angle-90)*rad,x=50+145*Math.cos(a),y=63+145*Math.sin(a),r=81,ex=50+r*Math.cos(a),ey=63+r*Math.sin(a);$('diagram').innerHTML=`<path d="M152 100L157 149Q176 157 195 149L200 100" fill="#eea52b" opacity=".8"/><ellipse cx="176" cy="100" rx="24" ry="6" fill="none" stroke="#9db1a8"/><path d="M31 63H214" stroke="#aabbb0" stroke-width="2" stroke-dasharray="5 4"/><path d="M50 63L${x} ${y}" stroke="#24c5d2" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="63" r="5" fill="#fff" stroke="#24c5d2" stroke-width="2"/><path d="M131 63A${r} ${r} 0 0 ${a>0?1:0} ${ex} ${ey}" stroke="#ebc01f" stroke-width="3" fill="none"/><text x="139" y="${a>0?82:49}" fill="#cba819" font-size="17" font-style="italic">${Math.round(Math.abs(current.angle-90))}°</text>`;$('diagram-caption').textContent=`θ ≈ ${Math.abs(current.angle-90)}° ${current.angle<90?'above':'below'} horizontal`;}}
  function project(a){const p=(a.isVector3?a.clone():new T.Vector3(...a)).project(camera);return{x:(p.x+1)*viewport.clientWidth/2,y:(1-p.y)*viewport.clientHeight/2};}
  function path(points){return points.map((p,i)=>{const a=project(p);return`${i?'L':'M'}${a.x.toFixed(2)} ${a.y.toFixed(2)}`;}).join(' ');}
  function annotations(){if(!['rollout','flow-preview','flow-camera'].includes(mode))return;let html='';if(current.kind==='flow'){
   const preview=mode!=='rollout',points=current.motion.flow.points,remaining=points.filter(p=>preview||time===0||time<p.time),radius=mode==='flow-preview'?7:5;
   // Unfold the top-view projection into the recorded TCP heights as the camera turns.
   html=(compact||current.components)?'':points.map((point,i)=>{if(!preview&&time>0&&time>=point.time)return '';const world=new T.Vector3(...point.previewPosition).lerp(new T.Vector3(...point.position),flowDepth),p=project(world);return `<g class="flow-marker" data-point="${i+1}"><circle cx="${p.x}" cy="${p.y}" r="${radius+3}" fill="#ab811a" opacity=".2"/><circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="#ffdb21" stroke="#fff9d2" stroke-width="2"/>${mode==='flow-preview'?`<text x="${p.x+(point.event==='grasp'?-13:13)}" y="${p.y+3}" class="flow-number">${i+1}</text>`:''}</g>`;}).join('');
   $('diagram-caption').textContent=preview?`${current.motion.flow.count} points · Top projection`:`${remaining.length} / ${points.length} points · 3D TCP path`;
  }else if(current.kind==='position'){html='';}else if(current.kind==='grasp'){html='';}else{const p=new T.Vector3(...current.motion.reference.tcp),a=current.angle,point=(deg,r)=>p.clone().add(new T.Vector3(0,Math.sin(deg*rad)*r,Math.cos(deg*rad)*r)),arc=Array.from({length:25},(_,i)=>point(90+(a-90)*i/24,.112)),label=project(point((90+a)/2,.145)),pivot=project(p);html=`<path d="${path([p,point(90,.19)])}" fill="none" stroke="#91a99d" stroke-width="1.5" stroke-dasharray="5 4"/><path d="${path([point(a,-.055),point(a,.153)])}" fill="none" stroke="#21c4d2" stroke-width="3" stroke-dasharray="9 4"/><circle cx="${pivot.x}" cy="${pivot.y}" r="4" fill="#fff" stroke="#20c6d5" stroke-width="1.5"/><path d="${path(arc)}" fill="none" stroke="#ebc11a" stroke-width="3"/><text class="annotation-angle" x="${label.x+9}" y="${label.y+4}">${Math.round(Math.abs(a-90))}°</text>`;}
   cupRefs.children.forEach(marker=>{if(marker.userData.graspTime!==undefined)marker.visible=marker.userData.graspTime!==7||time<7||(current.showcaseInstruction&&time<=7.002);});
   $('annotation-content').innerHTML=html;}
  const taskTitles={cup:'Cup Arrangement',water:'Angle-Controlled Pouring',pick:'PickCube'};
  const referenceTypes=library.refTypes||{'3d-keypoint':'3D Keypoint',orientation:'Orientation','2d-flow':'2D Flow'};
  const refType=ref=>ref.refType||({cup:'3d-keypoint',water:'orientation',pick:'2d-flow'}[ref.task]);
  const typeLabel=ref=>referenceTypes[refType(ref)];
  const lastTypeRef={'3d-flow':library.references.find(r=>r.task==='libero'&&r.refType==='3d-flow')?.id};
  const displayRefNumber=ref=>ref.task==='water'?(ref.id==='water-3'?3:1):ref.number;
  function referenceCopy(ref){
   if(ref.showcaseInstruction)return{label:ref.label,detail:'Grasp pose + placement point',instruction:ref.showcaseInstruction};
   if(ref.task==='cup'){
    const destination={'cup-left':'on the left side of the plate','cup-right':'on the right side of the plate','cup-front':'near the front edge of the plate'}[ref.id]||'in the center of the plate';
    if(refType(ref)==='3d-flow')return{label:ref.label,detail:'Continuous spatial path',instruction:`3D flow · Follow the path and place the cup ${destination}.`};
    const graspType=refType(ref)==='mix'?'Grasp pose + 2D point':refType(ref)==='pose'?'Grasp pose':'3D point';
    return{label:ref.label,detail:ref.placementOnly?(ref.intermediateReference?'In-transit + placement points':'Placement reference'):`${graspType} · ${ref.graspSide==='left'?'Left':'Right'} side`,instruction:ref.placementOnly?`3D point · ${ref.intermediateReference?'Follow the five points and place':'Place'} the cup ${destination}.`:`${graspType} · Grasp the cup from its ${ref.graspSide} side and place it ${destination}.`};
   }
   if(ref.task==='water'){
    const down=ref.angle>90;
    return{label:`${Math.round(Math.abs(ref.angle-90))}°`,detail:down?'Facing down':'Facing up',instruction:`${Math.round(Math.abs(ref.angle-90))}° · ${down?'Facing down.':'Facing up.'} Stop pouring at the selected orientation.`};
   }
   return{label:ref.taskTitle||'Pick Cube',detail:ref.detail,instruction:ref.instruction||'Follow the recorded TCP references from pickup to goal.'};
  }
  function renderCards(){const list=$('reference-list');list.replaceChildren();const matches=library.references.filter(r=>refType(r)===refType(current)),extra=matches.filter(r=>r.task==='libero'),existing=matches.filter(r=>r.task!=='libero'),entries=refType(current)==='3d-flow'?[...extra,...existing]:refType(current)==='2d-keypoint'?[...existing.filter(r=>r.motion?.task==='PickCube-v1'),...existing.filter(r=>r.motion?.task!=='PickCube-v1'),...extra]:[...existing.slice(0,1),...extra,...existing.slice(1)];$('ref-count').textContent=`${entries.length} ${entries.length===1?'option':'options'}`;for(const ref of entries){const copyText=referenceCopy(ref),card=document.createElement('button');card.className='reference-card';card.dataset.ref=ref.id;card.setAttribute('aria-pressed',String(ref.id===current.id));card.title=`${copyText.instruction} · ${ref.source}`;const img=document.createElement('img');img.src=library.media[ref.media].thumbnail;img.alt='';const number=document.createElement('span');number.className='card-number';number.textContent=displayRefNumber(ref);const copy=document.createElement('span');copy.className='card-copy';const title=document.createElement('strong');title.textContent=ref.taskTitle||taskTitles[ref.task]||copyText.label;copy.append(title);if(compact)card.append(img,copy);else card.append(img,number,copy);card.addEventListener('click',()=>selectRef(ref.id,true));list.append(card);}}
  function selectLiberoRef(ref){
   ++selectionRevision;video.pause();current=ref;lastTypeRef[ref.refType]=ref.id;
   mode='rollout';transition=cameraTween=flowPresentation=null;autoCamera=false;shot=null;orbit.stopMotion();orbit.enabled=false;setPlaying(false);
   document.body.classList.add('libero-reference');workspace.classList.remove('transitioning');clearViewport();
   intro.hidden=false;intro.inert=false;intro.setAttribute('aria-hidden','false');intro.classList.remove('leaving');
   sceneElement.classList.remove('visible');sceneElement.inert=true;sceneElement.setAttribute('aria-hidden','true');dissolve.hidden=true;
   $('task-title').textContent=ref.taskTitle;$('video-title').textContent=ref.instruction;$('reference-type').textContent=typeLabel(ref);
   $('reference-instruction').textContent=ref.instruction;$('video-number').textContent='Reference video';
   $('video-note').textContent='LIBERO · Illustrative video annotation';$('demonstration-label').textContent='Reference video';
   $('playback').hidden=false;$('watch-video').hidden=true;$('play-video').hidden=true;
   $('play').setAttribute('aria-label','Play reference video');$('replay').setAttribute('aria-label','Reset reference video');
   document.querySelectorAll('[data-ref-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.refType===ref.refType)));
   algorithmPanel.setReference(library.algorithm[ref.id]);setTime(0);updatePresentation();renderCards();
   document.querySelector('.video-frame').style.setProperty('--video-ratio',ref.mediaAspect||16/9);
   liberoView.select(ref);video.poster=ref.poster;video.src=ref.video;video.controls=false;video.load();resetVideoClock();
  }
  function clearViewport(){['inset','left','top','width','height'].forEach(k=>viewport.style[k]='');}
  function placeViewport(r){viewport.style.inset='auto';viewport.style.left=r.x+'px';viewport.style.top=r.y+'px';viewport.style.width=r.w+'px';viewport.style.height=r.h+'px';}
  function relativeRect(element){const r=element.getBoundingClientRect(),p=sceneElement.getBoundingClientRect();return{x:r.left-p.left,y:r.top-p.top,w:r.width,h:r.height};}
  async function selectRef(id,autoplay){
   const ref=library.references.find(r=>r.id===id);if(!ref)return;
   const request=++referenceRequest;
   if(ref.task==='pick'&&!simulation){
    $('loading').textContent='Loading simulation…';$('loading').hidden=false;
    try{await ensureSimulation();}catch(error){if(request===referenceRequest)$('loading').textContent='Unable to prepare simulation: '+error.message;return;}
    if(request!==referenceRequest)return;
   }
   $('loading').hidden=true;
   if(ref.task==='libero'){selectLiberoRef(ref);return;}
   document.body.classList.remove('libero-reference');if(compact)document.querySelector('.scene-label h2').textContent='3D rollout';
   sceneElement.setAttribute('aria-label','Fixed reference 3D rollout');$('replay').setAttribute('aria-label','Reset 3D rollout');
   const selection=++selectionRevision,taskChanged=!current||current.task!==ref.task,isSimulation=ref.task==='pick',environment=isSimulation?'simulation':'real';
   document.querySelectorAll('[data-inference]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inference===id)));
   video.pause();current=ref;camera=compact&&ref.refType!=='3d-keypoint'?flatCamera:depthCamera;orbit.object=camera;camera.aspect=viewAspect();camera.zoom=1;autoCamera=hasCameraMotion();shot=null;updateCupReferences(ref);lastRef[ref.task]=id;lastTypeRef[refType(ref)]=id;if(!isSimulation)lastRealTask=ref.task;
   renderSamples=isSimulation?null:ReplaySmoothing.smooth(ref.motion.samples.map((s,i)=>Array.isArray(s)?s:{...s,time:i*ref.motion.duration/(ref.motion.samples.length-1)}),s=>Array.isArray(s)?s[0]:s.time,s=>Array.isArray(s)?s.slice(1):[...s.q,s.gripAngle],(s,v)=>Array.isArray(s)?[s[0],...v]:{...s,q:v.slice(0,7),gripAngle:v[7]},[7,14,15,ref.motion.matchTime,...(ref.referencePoints||[]).map(p=>p.time)].filter(Number.isFinite));
   mode='video';transition=cameraTween=flowPresentation=null;flowDepth=0;setPlaying(false);orbit.stopMotion();orbit.enabled=false;orbit.minDistance=compact&&camera.isPerspectiveCamera?.12:isSimulation?.28:.5;simulation?.setPreview(0);if(isSimulation)simulation.setReference(ref);
   algorithmPanel.setReference(library.algorithm[ref.id]);updatePresentation();
   dissolve.hidden=true;dissolve.style.transition='none';dissolve.style.opacity=1;workspace.classList.remove('transitioning');clearViewport();sceneElement.classList.remove('visible');sceneElement.inert=true;sceneElement.setAttribute('aria-hidden','true');intro.inert=false;intro.setAttribute('aria-hidden','false');intro.hidden=false;intro.classList.remove('leaving');
   $('playback').hidden=true;$('watch-video').hidden=true;$('play-video').hidden=false;$('mode-tag').textContent='Reference video';$('task-title').textContent=ref.taskTitle||taskTitles[ref.task];$('reference-type').textContent=typeLabel(ref);$('reference-instruction').textContent=referenceCopy(ref).instruction;
   $('environment-label').textContent=compact?'MAM Demo':'REFERENCE / '+(isSimulation?'SIMULATION':'REAL ROBOT');$('demonstration-label').textContent=isSimulation?'Simulation video':'Real demonstration';
   renderer.domElement.setAttribute('aria-label',isSimulation?'Pick Cube recorded 3D rollout':'Franka FR3 fixed reference animation');
   const copy=referenceCopy(ref);
   $('video-title').textContent=ref.task==='cup'?copy.instruction:ref.task==='water'?`${copy.label} · ${copy.detail}`:compact?'':copy.label;$('video-number').textContent=`REFERENCE ${String(displayRefNumber(ref)).padStart(2,'0')}`;
   $('video-note').textContent=isSimulation?'Video → top-view flow → side-view rollout':ref.sharedSource?'Uses the same demonstration as Ref 3.':'Video → aligned scene → 3D rollout';if($('scrub'))$('scrub').max=ref.motion.duration;
   const page=isSimulation?'pick-cube.html':ref.task==='cup'?'franka-reference.html':'water.html';$('interactive-link').href=page;$('saved-link').href='versions/interactive-ref-2026-10-03/'+page;
   document.querySelectorAll('[data-environment]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.environment===environment)));
   document.querySelectorAll('[data-task]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.task===ref.task));b.hidden=(b.dataset.task==='pick')!==isSimulation;});
   orbit.enableRotate=!fixedTop();
   const hint=document.querySelector('.interaction-hint');if(hint)hint.innerHTML=fixedTop()?'<span>Mouse: left drag pan · wheel zoom</span><span>Trackpad: click-drag pan · pinch zoom · fixed Top</span>':'<span>Mouse: left drag pan · right drag rotate · wheel zoom</span>';
   orbit.minPolarAngle=compact?.00001:rad;orbit.maxPolarAngle=compact?Math.PI/2:78*rad;orbit.minZoom=.4;orbit.maxZoom=5;
   document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=fixedTop()&&b.dataset.view!=='top';b.hidden=false;});
   if(!compact){document.querySelector('[data-view="top"]').hidden=ref.task==='water';}

   cup.visible=plate.visible=cupTable.visible=ref.task==='cup';beaker.visible=tubeRig.visible=waterTable.visible=ref.task==='water';robot.visible=!isSimulation;simulation?.setVisible(isSimulation);simulation?.setTableProjection(isSimulation);if(ref.task==='cup')plate.position.fromArray(ref.motion.layout.plateCenter);
   $('annotation-content').replaceChildren();setTime(playbackStart());resize();setView(compact?(ref.defaultView||'detail'):'perspective',false);diagram();renderCards();if(taskChanged)document.querySelector('.library').scrollTop=0;
   const media=library.media[ref.media];document.querySelector('.video-frame').style.setProperty('--video-ratio',ref.mediaAspect||16/9);video.style.transform=media.bakedDetailCrop&&ref.id!=='cup-right'?'none':'';video.style.transformOrigin=ref.id==='cup-right'?'50% 100%':'';video.poster=media.poster;video.src=media.video;video.controls=!compact;video.load();resetVideoClock();
   document.querySelectorAll('[data-ref-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.refType===refType(ref))));
   if(compact){
    mode='rollout';sceneElement.classList.add('visible');sceneElement.inert=false;sceneElement.setAttribute('aria-hidden','false');orbit.enabled=true;
    $('playback').hidden=false;$('play-video').hidden=true;$('mode-tag').textContent='Video + 3D';$('video-number').textContent='Reference video';
    $('video-note').textContent=isSimulation?`${typeLabel(ref)} · Yellow: reference${ref.components?.some(c=>c.type.startsWith('2d'))?' · Cyan: table projection':''}`:'Effect video + reconstructed 3D replay';
    $('demonstration-label').textContent='Shared playback';algorithmPanel.setPrediction(false);updatePresentation();resize();setView(ref.defaultView||'detail',false);
    return;
   }
   if(autoplay)video.play().catch(()=>{if(selection!==selectionRevision||mode!=='video'||!video.paused)return;$('play-video').hidden=false;$('video-note').textContent='Press Play reference to begin.';});
  }
  function finishTransition(){
   transition=null;clearViewport();workspace.classList.remove('transitioning');intro.hidden=true;dissolve.hidden=true;dissolve.removeAttribute('src');sceneElement.inert=false;sceneElement.setAttribute('aria-hidden','false');$('watch-video').hidden=false;
   if(current.task==='pick'){startFlowPreview();return;}
   mode='rollout';orbit.enabled=true;$('playback').hidden=false;$('mode-tag').textContent='3D rollout';setPlaying(true);
  }
  function startFlowPreview(){
   setPlaying(false);cameraTween=null;orbit.stopMotion();orbit.enabled=false;mode='flow-preview';flowDepth=0;setTime(0);simulation.setPreview(1);resize();setView('top',false);
   document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);$('playback').hidden=true;$('mode-tag').textContent='Top-view reference';$('phase').textContent=`${current.motion.flow.count} yellow points · Pickup to goal`;
   flowPresentation={start:performance.now(),position:camera.position.clone(),target:orbit.target.clone()};
  }
  function advanceFlowPresentation(now){
   const elapsed=(now-flowPresentation.start)/1000;if(elapsed<2.6)return;
   mode='flow-camera';$('mode-tag').textContent='Top → Side';$('phase').textContent='Moving to the rollout view';const u=linear((elapsed-2.6)/1.05),side=viewPose('perspective');blendView(flowPresentation.position,flowPresentation.target,side.position,side.target,u);simulation.setPreview(1-u);flowDepth=u;
   if(u>=1){flowPresentation=null;mode='rollout';orbit.enabled=true;orbit.stopMotion();document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=false;b.setAttribute('aria-pressed',String(b.dataset.view==='perspective'));});$('mode-tag').textContent='3D rollout';$('playback').hidden=false;setTime(0);setPlaying(true);}
  }
  function enter3D(fromVideo){if(mode!=='video')return;video.pause();intro.inert=true;intro.setAttribute('aria-hidden','true');mode='transition';updatePresentation();cameraTween=null;orbit.stopMotion();orbit.enabled=false;sceneElement.classList.add('visible');$('mode-tag').textContent='Video → 3D';if(!fromVideo){intro.hidden=true;setTime(0);setView('perspective',false);finishTransition();return;}
   const raw=relativeRect(video),ratio=video.videoWidth/video.videoHeight||current.mediaAspect||16/9,w=Math.min(raw.w,raw.h*ratio),h=w/ratio,from={x:raw.x+(raw.w-w)/2,y:raw.y+(raw.h-h)/2,w,h},to=relativeRect(viewport),cam=library.cameras[current.task],end=viewPose(current.task==='pick'?'top':'perspective');setTime(current.matchTime);workspace.classList.add('transitioning');placeViewport(from);camera.position.fromArray(cam.position);orbit.target.fromArray(cam.target);camera.fov=cam.fov;camera.lookAt(orbit.target);intro.classList.add('leaving');transition={start:performance.now(),from,to,cameraFrom:camera.position.clone(),targetFrom:orbit.target.clone(),cameraTo:end.position,targetTo:end.target,fov:cam.fov,stage:'match'};}
  document.querySelectorAll('[data-ref-type]').forEach(b=>b.addEventListener('click',()=>selectRef(lastTypeRef[b.dataset.refType]||library.references.find(r=>refType(r)===b.dataset.refType)?.id,false)));
  document.querySelectorAll('[data-environment]').forEach(b=>b.addEventListener('click',()=>{const task=b.dataset.environment==='simulation'?'pick':lastRealTask;if(task!==current.task)selectRef(lastRef[task],true);}));
  document.querySelectorAll('[data-task]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.task!==current.task)selectRef(lastRef[b.dataset.task],true);}));$('play-video').addEventListener('click',()=>{const selection=selectionRevision;video.play().catch(()=>{if(selection===selectionRevision&&mode==='video')$('video-note').textContent='Use the video controls or choose Skip to 3D.';});});video.addEventListener('play',()=>{$('play-video').hidden=true;});video.addEventListener('ended',()=>{if(video.ended&&mode==='video')enter3D(true);});video.addEventListener('error',()=>{$('video-note').textContent=compact?'Video unavailable. Select the reference again to retry.':'Video unavailable. Choose Skip to 3D.';});$('skip-video').addEventListener('click',()=>enter3D(false));$('watch-video').addEventListener('click',()=>selectRef(current.id,true));$('play').addEventListener('click',()=>{if(mode!=='rollout')return;if(time>=playbackEnd()-1e-8){if(current.task==='pick'&&!compact){startFlowPreview();return;}setTime(playbackStart());if(autoCamera&&current.task!=='libero')setView(current.defaultView||'detail',true);syncVideoTime();}setPlaying(!playing);});$('replay').addEventListener('click',()=>{if(mode==='rollout'){if(compact){setPlaying(false);setTime(playbackStart());if(current.task!=='libero'){autoCamera=hasCameraMotion();setView(current.defaultView||'detail',true);}syncVideoTime();algorithmPanel.setPrediction(false);}else if(current.task==='pick')startFlowPreview();else{setTime(0);setPlaying(true);}}});$('scrub')?.addEventListener('input',()=>{if(mode==='rollout'){setPlaying(false);setTime(Number($('scrub').value));}});
  document.addEventListener('keydown',event=>{if(mode!=='rollout'||$('method-dialog').open||event.target.closest('#algorithm-panel')||['INPUT','SELECT','BUTTON','A','VIDEO'].includes(event.target.tagName))return;if(event.code==='Space'){event.preventDefault();if(time>=playbackEnd()-1e-8){if(current.task==='pick'&&!compact){startFlowPreview();return;}setTime(playbackStart());if(autoCamera&&current.task!=='libero')setView(current.defaultView||'detail',true);syncVideoTime();}setPlaying(!playing);}});
  const linear=u=>T.MathUtils.clamp(u,0,1);
  function frame(now){requestAnimationFrame(frame);if(document.hidden||!demoVisible){lastStamp=now;return;}const dt=Math.min((now-lastStamp)/1000,.06);lastStamp=now;if(current?.task==='libero'){if(playing&&(hasPresentedFrame||!hasVideoFrameCallback)){setTime(currentVideoTime());if(video.ended){setTime(current.motion.duration);setPlaying(false);}}liberoView.draw();const p=algorithmPanel.update({time,mode,playing,videoTime:currentVideoTime()});$('scene-progress').textContent='p = '+p.toFixed(2);return;}if(transition){const tr=transition,t=(now-tr.start)/1000;if(tr.stage==='match'){const u=linear((t-.55)/.75),a=tr.from,b=tr.to;placeViewport({x:T.MathUtils.lerp(a.x,b.x,u),y:T.MathUtils.lerp(a.y,b.y,u),w:T.MathUtils.lerp(a.w,b.w,u),h:T.MathUtils.lerp(a.h,b.h,u)});camera.position.lerpVectors(tr.cameraFrom,tr.cameraTo,u);orbit.target.lerpVectors(tr.targetFrom,tr.targetTo,u);camera.fov=T.MathUtils.lerp(tr.fov,37,u);camera.updateProjectionMatrix();camera.lookAt(orbit.target);if(current.task==='pick')simulation.setPreview(u);if(t>=1.3){resize();renderer.render(scene,camera);dissolve.src=renderer.domElement.toDataURL('image/png');dissolve.style.transition='none';dissolve.style.opacity=1;dissolve.hidden=false;intro.hidden=true;clearViewport();setTime(0);tr.stage='reset';tr.resetAt=now;}}else if(tr.stage==='reset'){dissolve.style.transition='opacity .55s ease';dissolve.style.opacity=0;if(now-tr.resetAt>=580)finishTransition();}}
   else if(flowPresentation)advanceFlowPresentation(now);
   else if(cameraTween){const u=linear((now-cameraTween.start)/500);blendView(cameraTween.from,cameraTween.targetFrom,cameraTween.position,cameraTween.target,u);if(compact){viewSpan=T.MathUtils.lerp(cameraTween.fromSpan,cameraTween.span,u);updateCameraProjection();}if(u>=1){cameraTween=null;orbit.stopMotion();orbit.update();if(autoCamera)captureShot();}}else if(mode==='rollout')orbit.update();
   if(playing&&mode==='rollout'){
    if(compact&&Number.isFinite(video.duration)&&video.duration>0){if(hasPresentedFrame||!hasVideoFrameCallback)setTime(PlaybackTiming.at(timingKnots(),hasVideoFrameCallback?presentedVideoTime:video.currentTime));if(video.ended){setTime(playbackEnd());setPlaying(false);}}
    else if(!compact){setTime(time+dt);if(time>=current.motion.duration)setPlaying(false);}
   }advanceCamera(dt);presentationButtons.forEach(b=>{b.disabled=!!(transition||flowPresentation);});const shownProgress=algorithmPanel.update({time,mode,playing,videoTime:currentVideoTime()});$('scene-progress').textContent='p = '+shownProgress.toFixed(2);resize();camera.updateMatrixWorld(true);annotations();if(mode!=='video')renderer.render(scene,camera);
  }
  document.querySelectorAll('[data-inference]').forEach(b=>b.addEventListener('click',()=>selectRef(b.dataset.inference,false)));
  document.querySelectorAll('[data-paper-progress]').forEach(b=>b.addEventListener('click',()=>seekProgressClock(Number(b.dataset.paperProgress))));
  video.addEventListener('pause',()=>{if(!demoVisible||document.hidden)setPlaying(false);});
  selectRef('cup-left',false);$('loading').hidden=true;requestAnimationFrame(frame);
 }catch(error){console.error(error);$('loading').textContent='Unable to prepare the library: '+error.message;}
})();
