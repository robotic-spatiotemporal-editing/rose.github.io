/* Match the video sphere's palette and view-space lighting exactly, while
   retaining real sphere geometry and normal scene depth testing. */
(function(root){
 root.ReferenceVisualSpec=Object.freeze({sphereRadiusMeters:.008,sphereColor:0xffdb21,triadLengthMeters:.066,triadRadiusMeters:.00225,axisColors:['#ee3f32','#35f12a','#2449ef']});
 // Project a metric local TCP frame. The orientation follows the gripper,
 // while perspective is supplied by the currently selected camera.
 root.projectTCPAxes=function(position,quaternion,camera,width,height){
  const T=THREE,spec=root.ReferenceVisualSpec,p=new T.Vector3(...position),q=new T.Quaternion(...quaternion);
  const screen=v=>{const n=v.clone().project(camera);return{x:(n.x+1)*width/2,y:(1-n.y)*height/2,z:n.z};};
  const origin=screen(p);if(origin.z < -1 || origin.z > 1)return [];
  const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const rim=screen(p.clone().addScaledVector(right,spec.triadRadiusMeters));
  const strokeWidth=Math.max(1.5,2*Math.hypot(rim.x-origin.x,rim.y-origin.y));
  return [[1,0,0],[0,1,0],[0,0,1]].map((axis,i)=>{
   const endpoint=screen(p.clone().add(new T.Vector3(...axis).applyQuaternion(q).multiplyScalar(spec.triadLengthMeters)));
   return{origin,endpoint,color:spec.axisColors[i],strokeWidth};
  }).sort((a,b)=>b.endpoint.z-a.endpoint.z);
 };
 // A genuine local TCP frame: metric mesh geometry rotates with grasp_site.
 // No camera-facing sprite and no extra Panda hand rotation are applied here.
 // Like a transform gizmo, the frame stays visible over the grasped object;
 // perspective, foreshortening, lighting and orientation remain genuinely 3D.
 root.createTCPFrameTracker=function(){
  const T=THREE,spec=root.ReferenceVisualSpec,group=new T.Group();
  group.name='End-effector local XYZ axes';
  const length=spec.triadLengthMeters,headLength=.00945,shaftLength=length-headLength;
  const y=new T.Vector3(0,1,0);
  [[1,0,0],[0,1,0],[0,0,1]].forEach((axis,i)=>{
   const direction=new T.Vector3(...axis),rig=new T.Group();rig.name=['TCP X','TCP Y','TCP Z'][i];rig.userData.axisIndex=i;
   rig.quaternion.setFromUnitVectors(y,direction);
   const material=new T.MeshPhongMaterial({color:new T.Color(spec.axisColors[i]).convertSRGBToLinear(),specular:0x151515,shininess:20,depthTest:false,depthWrite:false,toneMapped:false});
   const shaft=new T.Mesh(new T.CylinderGeometry(spec.triadRadiusMeters,spec.triadRadiusMeters,shaftLength,12),material);shaft.position.y=shaftLength/2;
   const tip=new T.Mesh(new T.ConeGeometry(spec.triadRadiusMeters*2.2,headLength,16),material);tip.position.y=shaftLength+headLength/2;
   shaft.renderOrder=tip.renderOrder=1000;rig.add(shaft,tip);group.add(rig);
  });
  group.setPose=function(position,quaternion){
   group.position.fromArray(position);group.quaternion.fromArray(quaternion).normalize();
   group.updateMatrixWorld(true);
  };
  group.dispose=function(){group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const rig of group.children)rig.children[0].material.dispose();};
  return group;
 };
 root.referenceFlowColor=function(t){
  const stops=[[255,242,166],[255,207,45],[238,125,49]],u=Math.max(0,Math.min(1,t))*2,i=Math.min(1,Math.floor(u)),f=u-i;
  return stops[i].map((v,k)=>(v+(stops[i+1][k]-v)*f)/255);
 };
 root.createGradientReferenceFlow=function(path){
  const T=THREE,group=new T.Group(),curve=new T.CurvePath(),points=path.map(p=>new T.Vector3(...p));
  for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>1e-9)curve.add(new T.LineCurve3(points[i-1],points[i]));
  if(!curve.curves.length)return group;
  for(const [radius,border] of [[.0045,true],[.003,false]]){
   const geometry=new T.TubeGeometry(curve,Math.max(96,points.length*2),radius,10,false);
   if(!border){const colors=[];for(let i=0;i<geometry.attributes.position.count;i++){const rgb=root.referenceFlowColor(geometry.attributes.uv.getX(i)),c=new T.Color(...rgb).convertSRGBToLinear();colors.push(c.r,c.g,c.b);}geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));}
   const material=new T.MeshBasicMaterial({color:0xffffff,vertexColors:!border,side:border?T.BackSide:T.FrontSide,toneMapped:false,depthTest:true,depthWrite:true});
   const tube=new T.Mesh(geometry,material);tube.userData.ownMaterial=true;tube.renderOrder=border?8:9;group.add(tube);
  }
  return group;
 };
 // Local X is thickness, Y is jaw opening and +Z points toward the fingertips.
 root.GraspReferenceParts=[
  {center:[0,0,-.030],size:[.010,.009,.040]},
  {center:[0,0,-.010],size:[.010,.084,.009]},
  {center:[0,-.0375,.013],size:[.010,.009,.046]},
  {center:[0,.0375,.013],size:[.010,.009,.046]}
 ];
 root.createGraspReference3D=function(){
  const T=THREE,group=new T.Group();group.name='Solid target gripper';
  group.scale.setScalar(1.25);
  for(const part of root.GraspReferenceParts){
   const material=new T.MeshLambertMaterial({color:new T.Color(ReferenceVisualSpec.sphereColor).convertSRGBToLinear(),toneMapped:false,depthTest:true,depthWrite:true});
   const mesh=new T.Mesh(new T.BoxGeometry(...part.size),material);mesh.position.fromArray(part.center);mesh.castShadow=true;mesh.userData.ownMaterial=true;group.add(mesh);
  }
  return group;
 };
 // The video-only LIBERO view uses the same solid shape as an oblique icon.
 root.drawGraspReferenceSolid=function(ctx,x,y,size,angle=0,handFrame=null){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);const scale=size/.084;
  // A supplied hand frame uses the same local Y opening / +Z fingertip
  // convention as the 3D mesh. Preserve its projected lengths and depth.
  const view=v=>handFrame?[0,1,2].map(axis=>v.reduce((sum,n,i)=>sum+n*handFrame[i][axis],0)):[v[1]+v[0]*.65,v[2]-v[0]*.5,-v[0]];
  const project=v=>view(v).slice(0,2).map(n=>n*scale);
  const faces=[[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]],colors=['#e5c31d','#ffe75b','#ffdb21','#d6b51a','#f2ce1f','#ffe248'];
  const polygons=[];
  for(const part of root.GraspReferenceParts){const v=[];for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])v.push(part.center.map((n,i)=>n+[a,b,c][i]*part.size[i]/2));faces.forEach((f,i)=>polygons.push({depth:f.reduce((n,j)=>n+view(v[j])[2],0)/4,points:f.map(j=>project(v[j])),color:colors[i]}));}
  polygons.sort((a,b)=>b.depth-a.depth).forEach(f=>{ctx.beginPath();f.points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();});ctx.restore();
 };
 root.createReferenceSphereMaterial=function(){return new THREE.ShaderMaterial({
  vertexShader:`varying vec3 n; void main(){n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 n; void main(){vec3 v=normalize(n); float light=max(0.0,dot(v,vec3(-.35,.45,.82))); float highlight=pow(max(0.0,dot(v,vec3(-.3,.4,.86))),32.0); vec3 c=vec3(255.0,219.0,33.0)/255.0*(.82+.18*light)+vec3(12.0/255.0)*highlight; gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);}`,
  depthTest:true,depthWrite:true,toneMapped:false});};
 // The ground footprint and depth-tested drop line establish a real height,
 // without introducing another target point or a screen-space overlay.
 root.createReferenceDepthGuide=function(position,floorZ=.003){
  const T=THREE,group=new T.Group();group.name='Reference height and ground footprint';
  const top=new T.Vector3(...position),base=new T.Vector3(position[0],position[1],floorZ);
  if(top.z<=floorZ+.015)return group;
  const guideMaterial=new T.MeshBasicMaterial({color:0xb5a451,transparent:true,opacity:.42,depthTest:true,depthWrite:false,toneMapped:false});
  for(let z=floorZ;z<top.z-.012;z+=.015){
   const length=Math.min(.008,top.z-.012-z);
   const dash=new T.Mesh(new T.CylinderGeometry(.0009,.0009,length,8),guideMaterial);
   dash.rotation.x=Math.PI/2;dash.position.set(base.x,base.y,z+length/2);group.add(dash);
  }
  const ring=new T.Mesh(new T.RingGeometry(.010,.012,40),new T.MeshBasicMaterial({color:0x9b9160,transparent:true,opacity:.18,depthTest:true,depthWrite:false,side:T.DoubleSide,toneMapped:false}));
  ring.position.copy(base);group.add(ring);
  group.traverse(o=>{if(o.material)o.userData.ownMaterial=true;});return group;
 };
})(typeof window==='undefined'?globalThis:window);

/* Recorded PickCube renderer with typed reference overlays. All scene objects belong to root;
   this module neither plans a new trajectory nor creates interactive refs. */
(function(global){
  'use strict';
  async function createPickSimulation({scene,motion,models,graspMarker}){
    const T=THREE,required=[...Array.from({length:8},(_,i)=>'link'+i),'hand','finger'];
    if(!scene||!motion?.samples?.length)throw Error('Pick Cube requires a scene and recorded motion.');
    const loader=new T.GLTFLoader(),loaded={};
    await Promise.all(required.map(async name=>{
      if(!models[name])throw Error('Missing Panda model: '+name);
      const response=await fetch(models[name]);
      if(!response.ok)throw Error('Unable to load Panda model: '+name);
      const bytes=pako.ungzip(new Uint8Array(await response.arrayBuffer()));
      const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      const gltf=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));
      loaded[name]=gltf.scene;
    }));
    const root=new T.Group();root.name='Pick Cube 042 recorded simulation';
    const material=(color,roughness=.6)=>new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness});
    function mesh(geometry,mat,parent=root,position=[0,0,0]){
      const object=new T.Mesh(geometry,mat);object.position.fromArray(position);object.castShadow=object.receiveShadow=true;parent.add(object);return object;
    }
    function box(size,position,mat,parent=root){return mesh(new T.BoxGeometry(...size),mat,parent,position);}
    // Same deterministic wood appearance and tabletop reconstruction as the
    // original Pick Cube page. The simulator actor origin is not its surface.
    const woodCanvas=document.createElement('canvas');woodCanvas.width=woodCanvas.height=512;
    const context=woodCanvas.getContext('2d');context.fillStyle='#ad845c';context.fillRect(0,0,512,512);let seed=42;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1000;i++){
      const y=random()*512;context.strokeStyle=`rgba(${random()>.6?'236,213,175':'86,51,28'},${.018+random()*.08})`;context.lineWidth=.3+random();
      context.beginPath();context.moveTo(0,y);context.bezierCurveTo(130,y+random()*5,360,y-random()*5,512,y+random()*2);context.stroke();
    }
    const texture=new T.CanvasTexture(woodCanvas);texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2,2);texture.anisotropy=8;
    const wood=material(0xffffff,.85);wood.map=texture;box(motion.table.visualSize,motion.table.visualCenter,wood).name='Reconstructed wooden tabletop';
    const robot=new T.Group();robot.name='Franka Panda';robot.position.fromArray(motion.robotBase);
    if(motion.robotQuaternion)robot.quaternion.fromArray(motion.robotQuaternion).normalize();root.add(robot);
    const materialStates=[],meshStates=[];
    function addModel(name,parent){
      const object=loaded[name].clone(true);
      object.traverse(part=>{
        if(!part.isMesh)return;
        part.castShadow=part.receiveShadow=true;
        // Clones own their materials: preview fading cannot alter another
        // Panda instance or the real-robot renderer's materials.
        const clone=mat=>{const own=mat.clone();materialStates.push({material:own,opacity:own.opacity,transparent:own.transparent,depthWrite:own.depthWrite});return own;};
        part.material=Array.isArray(part.material)?part.material.map(clone):clone(part.material);
        meshStates.push({mesh:part,castShadow:part.castShadow,receiveShadow:part.receiveShadow});
      });parent.add(object);return object;
    }
    addModel('link0',robot);
    const offsets=[[0,0,.333],[0,0,0],[0,-.316,0],[.0825,0,0],[-.0825,.384,0],[0,0,0],[.088,0,0]];
    const rolls=[0,-Math.PI/2,Math.PI/2,Math.PI/2,-Math.PI/2,Math.PI/2,Math.PI/2],joints=[];let parent=robot;
    for(let i=0;i<7;i++){
      const origin=new T.Group();origin.position.fromArray(offsets[i]);origin.rotation.x=rolls[i];parent.add(origin);
      const joint=new T.Group();joint.name='panda_joint'+(i+1);origin.add(joint);addModel('link'+(i+1),joint);joints.push(joint);parent=joint;
    }
    const hand=new T.Group();hand.name='Panda hand';hand.position.z=.107;hand.rotation.z=-Math.PI/4;parent.add(hand);addModel('hand',hand);
    const fingers=[];
    for(const sign of [1,-1]){
      const finger=new T.Group();finger.position.z=.0584;if(sign<0)finger.rotation.z=Math.PI;
      hand.add(finger);addModel('finger',finger);fingers.push(finger);
    }
    const tcp=new T.Object3D();tcp.name='Panda TCP';tcp.position.z=.1034;hand.add(tcp);const tcpTracker=createTCPFrameTracker();tcp.add(tcpTracker);
    const cube=new T.Group();root.add(cube);cube.name='Recorded manipulated object';
    function objectVisual(){
      cube.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});cube.clear();
      if(motion.objectKind==='peg'){
        const [length,width,height]=motion.objectSize;
        box([length/2,width,height],[-length/4,0,0],material(0xd62525,.53),cube);
        box([length/2,width,height],[length/4,0,0],material(0x225dcc,.53),cube);
      }else box([motion.cubeSize,motion.cubeSize,motion.cubeSize],[0,0,0],material(0xd62525,.53),cube);
    }
    objectVisual();
    const overlay=(color,opacity)=>new T.MeshBasicMaterial({color,opacity,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
    const goal=new T.Group();goal.name='Pick Cube goal';goal.position.fromArray(motion.goal);root.add(goal);
    const goalBall=new T.Mesh(new T.SphereGeometry(motion.goalRadius,32,24),new T.MeshPhongMaterial({color:0x29b852,specular:0x214f2b,shininess:35,transparent:false,opacity:1,depthTest:true,depthWrite:true,toneMapped:false}));goalBall.name='Airborne green goal sphere';goalBall.renderOrder=20;goal.add(goalBall);
    const goalRegion=new T.Mesh(new T.RingGeometry(.085,.10,64),new T.MeshBasicMaterial({color:0x25a45b,side:T.DoubleSide,depthTest:true,depthWrite:false}));goal.add(goalRegion);
    let source=motion.samples,last=source[source.length-1],planeZ=motion.flow?.planeZ??.004;
    let time=0,previewWeight=0,latest=source[0],tableProjection=false;
    const floorZ=(motion.table.surfaceZ||0)+.003;
    const flowLayer=new T.Group();flowLayer.name='Typed reference annotations';flowLayer.visible=false;root.add(flowLayer);
    // Draw the annotations over occluding fingers while retaining their selected
    // plane orientation and perspective, so the projected path stays legible.
    const floorMaterial=color=>new T.MeshBasicMaterial({color:new T.Color(color).convertSRGBToLinear(),transparent:true,depthTest:true,depthWrite:false,toneMapped:false,side:T.DoubleSide});
    const amber=floorMaterial(0x886300),yellow=floorMaterial(0xffdb21),cyan=floorMaterial(0x00b5cc),white=floorMaterial(0xffffff);
    const sphereYellow=createReferenceSphereMaterial();
    const referenceLayer=new T.Group();flowLayer.add(referenceLayer);
    let markers=[],components=[],projectionPlane='xy',projectionX=0,planarPushFlow=false;
    function clearReference(){
      referenceLayer.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.userData.ownMaterial)o.material.dispose();});
      referenceLayer.clear();markers=[];
    }
    function orientationMarker(point,isPose,useGripper=isPose,markerOffset=[0,0,0]){
      const rig=new T.Group();rig.position.fromArray(point.position);rig.quaternion.fromArray(point.quaternion);referenceLayer.add(rig);
      function stroke(a,b,radius,mat,order){
        const delta=b.clone().sub(a),object=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),8),mat);
        object.position.copy(a).add(b).multiplyScalar(.5);object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());object.renderOrder=order;rig.add(object);
      }
      if(useGripper){
        const symbol=createGraspReference3D(),offset=new T.Vector3(...markerOffset);rig.position.add(offset);
        if(offset.lengthSq()>0)stroke(offset.clone().negate().applyQuaternion(rig.quaternion.clone().invert()),new T.Vector3(),.0005,white,20);
        rig.add(symbol);rig.name='Solid target gripper in local YZ plane';markers.push({dot:rig,time:point.time,hideOnReach:false});return;
      }
      function dash(a,b){stroke(a,b,.0017,amber,10);stroke(a,b,.001, yellow,11);}
      for(let axis=0;axis<3;axis++){
        const tip=new T.Vector3();tip.setComponent(axis,.065);
        for(let i=0;i<6;i++)dash(tip.clone().multiplyScalar(i/6),tip.clone().multiplyScalar((i+.62)/6));
      }
      for(let i=0;i<18;i++){
        const angle=(25+i*275/18)*Math.PI/180,end=angle+9*Math.PI/180;
        dash(new T.Vector3(.026*Math.cos(angle),.026*Math.sin(angle),0),new T.Vector3(.026*Math.cos(end),.026*Math.sin(end),0));
      }
      if(isPose){
        const center=new T.Mesh(new T.SphereGeometry(.006,16,12),yellow);center.renderOrder=11;rig.add(center);
        // Parallel jaws explicitly visualize the seventh coordinate: opening G.
        for(const sign of [-1,1]){
          const jaw=new T.Mesh(new T.BoxGeometry(.006,.006,.030),yellow);jaw.position.set(0,sign*(point.gripper/2+.003),-.015);jaw.renderOrder=10;rig.add(jaw);
        }
      }
      rig.name=isPose?'7D target: XYZ, rotation, gripper':'Target orientation';
    }
    function dashedSegments(points,dashLength=.018,gap=.014){
      const segments=[],period=dashLength+gap;let phase=0;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<1e-10)continue;
        let distance=0;
        while(distance<length-1e-10){
          const on=phase<dashLength-1e-10,step=Math.min(length-distance,(on?dashLength:period)-phase);
          if(step<1e-10){phase=0;continue;}
          if(on)segments.push([a.clone().lerp(b,distance/length),a.clone().lerp(b,(distance+step)/length)]);
          distance+=step;phase=(phase+step)%period;
        }
      }
      return segments;
    }
    function setReference(reference){
      if(reference.motion!==motion){
        motion=reference.motion;source=motion.samples;last=source[source.length-1];planeZ=motion.flow?.planeZ??.004;
        robot.position.fromArray(motion.robotBase);robot.quaternion.fromArray(motion.robotQuaternion);goal.position.fromArray(motion.goal);
      }
      objectVisual();goalBall.visible=!motion.goalKind||motion.goalKind==='sphere';goalRegion.visible=motion.goalKind==='region';if(goalRegion.visible)goal.position.z=.002;
      const pins=[motion.events.closeStart,motion.events.liftStart,motion.events.successTime,...(reference.components||[]).flatMap(c=>c.type.includes('flow')?[]:c.points.map(p=>p.time))];
      source=ReplaySmoothing.smooth(motion.samples,s=>s.time,s=>s.qpos,(s,qpos)=>({...s,qpos}),pins);last=source.at(-1);
      clearReference();components=reference.components||[{type:'2d-flow',points:motion.flow.points}];
      planarPushFlow=motion.task==='PushCube-v1'&&components.some(c=>c.type==='2d-flow');
      // During a tabletop push, local Z can extend beneath the table. Respect
      // scene depth instead of painting that hidden blue shaft over the Ref.
      tcpTracker.traverse(o=>{if(o.material)o.material.depthTest=planarPushFlow&&o.parent?.userData.axisIndex===2;});
      // Keep the moving cyan projection underneath the planar Ref stroke.
      projection.renderOrder=planarPushFlow?7:12;
      for(const component of components){
        const type=component.type;
        // 2D Flow uses metric dashed strips on its plane; spatial Flow is a tube.
        if(type.includes('flow')){
          const points=(component.pathPoints||component.points.map(p=>p.position)).map(p=>new T.Vector3(...p));
          if(type==='3d-flow'){referenceLayer.add(createGradientReferenceFlow(points.map(p=>p.toArray())));continue;}
          const is2d=type.startsWith('2d'),normal=new T.Vector3(...(component.plane==='yz'?[1,0,0]:[0,0,1]));
          for(const [radius,mat,order] of (is2d?[[.0025,white,9]]:[[.0045,white,8],[.003,sphereYellow,9]])){
            if(is2d){
              // World-space strips stay in the reference plane; their width foreshortens naturally.
              const vertices=[],segments=dashedSegments(points);
              for(const [a,b] of segments){
                const side=b.clone().sub(a).cross(normal).normalize().multiplyScalar(radius);
                const v=[a.clone().add(side),a.clone().sub(side),b.clone().add(side),b.clone().sub(side)];
                for(const j of [0,1,2,2,1,3])vertices.push(...v[j].toArray());
              }
              const basis=component.plane==='yz'?[new T.Vector3(0,1,0),new T.Vector3(0,0,1)]:[new T.Vector3(1,0,0),new T.Vector3(0,1,0)];
              for(const point of segments.flat())for(let i=0;i<16;i++){
                vertices.push(...point.toArray());
                for(const angle of [i*Math.PI/8,(i+1)*Math.PI/8])vertices.push(...point.clone().addScaledVector(basis[0],radius*Math.cos(angle)).addScaledVector(basis[1],radius*Math.sin(angle)).toArray());
              }
              const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
              const ribbon=new T.Mesh(geometry,mat);ribbon.renderOrder=order;referenceLayer.add(ribbon);
            }else{
              const curve=new T.CurvePath();for(let i=1;i<points.length;i++)curve.add(new T.LineCurve3(points[i-1],points[i]));
              const tubeMaterial=mat===white?mat.clone():mat;if(mat===white)tubeMaterial.side=T.BackSide;
              const tube=new T.Mesh(new T.TubeGeometry(curve,Math.max(64,points.length*2),radius,8,false),tubeMaterial);tube.userData.ownMaterial=mat===white;tube.renderOrder=order;referenceLayer.add(tube);
            }
          }
          continue;
        }
        for(const [i,point] of component.points.entries()){
          if(type==='pose'||type==='orientation'){orientationMarker(point,type==='pose',type==='pose'||component.marker==='gripper',component.markerOffset);continue;}
          const is2d=type.startsWith('2d'),dense=type.includes('flow'),radius=dense?(is2d?.0052:.0035):(is2d?.008:ReferenceVisualSpec.sphereRadiusMeters);
          const geometry=is2d?new T.CircleGeometry(radius,24):new T.SphereGeometry(radius,32,24);
          const dot=new T.Mesh(geometry,is2d?yellow:sphereYellow);dot.position.fromArray(point.position);if(is2d&&component.plane==='yz'){dot.rotation.y=Math.PI/2;}else if(is2d)dot.position.z=floorZ;
          if(!is2d)dot.castShadow=true;
          dot.name=type+' reference '+(i+1);dot.renderOrder=9;referenceLayer.add(dot);markers.push({dot,time:point.time});
          if(is2d){const border=new T.Mesh(is2d?new T.CircleGeometry(radius*(dense?1.18:1.6),24):new T.SphereGeometry(radius*(dense?1.18:1.6),16,12),dense?amber:white);border.position.copy(dot.position);border.quaternion.copy(dot.quaternion);border.renderOrder=8;referenceLayer.add(border);markers.push({dot:border,time:point.time});}

        }
      }
      const planar=components.find(c=>c.type.startsWith('2d'));
      if(planar&&planar.type.includes('flow')&&planar.plane==='yz'){
        const axes=planar.plane==='yz'?[1,2]:[0,1],fixed=planar.plane==='yz'?0:2,points=planar.pathPoints?.length?planar.pathPoints:planar.points.map(p=>p.position),origin=points[0][fixed];
        const bounds=axes.map(a=>[Math.floor((Math.min(...points.map(p=>p[a]))-.025)/.025)*.025,Math.ceil((Math.max(...points.map(p=>p[a]))+.025)/.025)*.025]);
        const vertices=[];for(let axis=0;axis<2;axis++)for(let v=bounds[axis][0];v<bounds[axis][1]+.001;v+=.025){for(const end of bounds[1-axis]){const p=[0,0,0];p[fixed]=origin;p[axes[axis]]=v;p[axes[1-axis]]=end;vertices.push(...p);}}
        const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
        const grid=new T.LineSegments(geometry,new T.LineDashedMaterial({color:0x89b4b8,transparent:true,opacity:.18,dashSize:.008,gapSize:.006,depthTest:true,depthWrite:false}));grid.computeLineDistances();grid.renderOrder=5;grid.userData.ownMaterial=true;referenceLayer.add(grid);
      }
      const c2=components.find(c=>c.type.startsWith('2d')),has2d=!!c2;projectionPlane=c2?.plane||'xy';projectionX=c2?.points[0].position[0]||0;projection.rotation.y=projectionPlane==='yz'?Math.PI/2:0;projection.visible=dropLine.visible=has2d;
      applyAt(0);
    }
    const projection=new T.Group();projection.name='TCP projection on reference plane';projection.renderOrder=12;flowLayer.add(projection);
    const projectionRing=new T.Mesh(new T.RingGeometry(.0075,.0105,40),cyan);projection.add(projectionRing);
    const projectionCore=new T.Mesh(new T.CircleGeometry(.003,24),white);projectionCore.position.z=.0001;projection.add(projectionCore);
    // Mesh dashes retain visible thickness on WebGL platforms with 1px-only lines.
    const dropLine=new T.Group(),dropGeometry=new T.CylinderGeometry(.0015,.0015,1,8),dropMaterial=new T.MeshBasicMaterial({color:0x79a7a9,transparent:true,opacity:.55,depthWrite:false,depthTest:true,toneMapped:false});
    for(let i=0;i<96;i++){const dash=new T.Mesh(dropGeometry,dropMaterial);dash.visible=false;dropLine.add(dash);}flowLayer.add(dropLine);
    const dropDelta=new T.Vector3(),dropUp=new T.Vector3(0,1,0);
    const projectedTCP=new T.Vector3();
    function updateProjection(){
      if(!tableProjection)return;
      tcp.getWorldPosition(projectedTCP);
      const projected=projectedTCP.clone();if(projectionPlane==='yz')projected.x=projectionX;else projected.z=floorZ+(planarPushFlow?-.0003:.0003);projection.position.copy(projected);
      dropDelta.subVectors(projectedTCP,projected);const dropLength=dropDelta.length();
      if(dropLength>1e-8)dropDelta.divideScalar(dropLength);
      dropLine.children.forEach((dash,i)=>{const start=i*.014,length=Math.min(.008,dropLength-start);dash.visible=length>1e-6;if(!dash.visible)return;dash.position.copy(projected).addScaledVector(dropDelta,start+length/2);dash.scale.y=length;dash.quaternion.setFromUnitVectors(dropUp,dropDelta);});
      markers.forEach(marker=>marker.dot.visible=!marker.hideOnReach||time<marker.time);
    }
    function setTableProjection(value){tableProjection=!!value;flowLayer.visible=tableProjection;goal.visible=true;updateProjection();}
    function interpolate(value){
      if(value<=source[0].time)return source[0];if(value>=last.time)return last;
      let lo=0,hi=source.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(source[mid].time<=value)lo=mid;else hi=mid;}
      const a=source[lo],b=source[hi],u=(value-a.time)/(b.time-a.time),lerp=(x,y)=>x.map((v,i)=>T.MathUtils.lerp(v,y[i],u));
      return{time:value,qpos:ReplaySmoothing.interpolate(source,value,s=>s.time,s=>s.qpos),cubePosition:lerp(a.cubePosition,b.cubePosition),cubeQuaternion:new T.Quaternion(...a.cubeQuaternion).slerp(new T.Quaternion(...b.cubeQuaternion),u).toArray()};
    }
    function applyAt(value){
      time=T.MathUtils.clamp(Number.isFinite(value)?value:0,0,motion.duration);latest=interpolate(time);
      joints.forEach((joint,i)=>joint.rotation.z=latest.qpos[i]);
      fingers.forEach((finger,i)=>finger.position.y=(i===0?1:-1)*latest.qpos[7+i]);
      cube.position.fromArray(latest.cubePosition);cube.quaternion.fromArray(latest.cubeQuaternion);root.updateMatrixWorld(true);updateProjection();
    }
    function setPreview(value){
      previewWeight=T.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);const faded=previewWeight>0,opacity=1-previewWeight;
      for(const state of materialStates){const mat=state.material,transparent=state.transparent||faded;if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true;}mat.opacity=state.opacity*opacity;mat.depthWrite=faded?false:state.depthWrite;}
      for(const state of meshStates){state.mesh.castShadow=faded?false:state.castShadow;state.mesh.receiveShadow=faded?false:state.receiveShadow;}
      goal.position.z=T.MathUtils.lerp(motion.goal[2],planeZ,previewWeight);
    }
    function setVisible(visible){root.visible=!!visible;}
    function tcpWorld(target=new T.Vector3()){root.updateMatrixWorld(true);return tcp.getWorldPosition(target);}
    function getPose(){
      root.updateMatrixWorld(true);return{time,previewWeight,qpos:[...latest.qpos],cubePosition:cube.position.toArray(),cubeQuaternion:cube.quaternion.toArray(),tcpPosition:tcp.getWorldPosition(new T.Vector3()).toArray(),tcpQuaternion:tcp.getWorldQuaternion(new T.Quaternion()).toArray(),goalPosition:goal.position.toArray()};
    }
    scene.add(root);setReference({motion});applyAt(0);setPreview(0);
    return{root,hand,applyAt,setPreview,setVisible,tcpWorld,getPose,setTableProjection,setReference};
  }
  global.createPickSimulation=createPickSimulation;
})(typeof window==='undefined'?globalThis:window);
