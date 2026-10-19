import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id);
let state=null, mode='hover', cameraMode='follow', trail=[], lastTrail=-1, lastTime=0;
const names={hover:'Precision hover',waypoints:'Five-beacon mission',disturbance:'Disturbance rejection',linkloss:'Connection failsafe'};
async function command(action, data={}) {
  try { const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})}); if(!r.ok) throw Error('Command rejected'); state=await r.json(); update(); }
  catch(e){$('connection').textContent='COMMAND FAILED';console.error(e);}
}
function reset(){trail=[];lastTrail=-1;return command('reset',{scenario:mode,gain:+$('gain').value,wind:+$('wind').value});}
document.querySelectorAll('.scenario').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.scenario').forEach(n=>n.classList.toggle('active',n===b));$('missionTitle').textContent=names[mode];reset();});
$('start').onclick=()=>command(state?.running?'pause':'start');$('reset').onclick=reset;
['gust','land','disconnect'].forEach(a=>$(a).onclick=()=>command(a));
$('gain').oninput=()=>{$('gainValue').textContent=(+$('gain').value).toFixed(2)+'×';};
$('wind').oninput=()=>{$('windValue').textContent=(+$('wind').value).toFixed(1);};
['help','notes'].forEach(id=>$(id).onclick=()=>$('modelDialog').showModal());$('closeDialog').onclick=()=>$('modelDialog').close();
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{cameraMode=b.dataset.camera;document.querySelectorAll('[data-camera]').forEach(n=>n.classList.toggle('selected',n===b));});

const scene=new THREE.Scene();scene.background=new THREE.Color('#101c28');scene.fog=new THREE.Fog('#101c28',9,23);
const renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const camera=new THREE.PerspectiveCamera(43,1,.01,80);
scene.add(new THREE.HemisphereLight(0xc3e7ff,0x223039,2.2));
const key=new THREE.DirectionalLight(0xd4f5ff,3.5);key.position.set(3,7,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});key.shadow.bias=-.0004;scene.add(key);
const rim=new THREE.PointLight(0x3ceac7,8,10);rim.position.set(-3,2,-3);scene.add(rim);
const mat=(c,metalness=.2,roughness=.6)=>new THREE.MeshStandardMaterial({color:c,metalness,roughness});
const floor=new THREE.Mesh(new THREE.BoxGeometry(7,.14,7),mat(0x172633,.25,.8));floor.position.y=-.08;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(7,28,0x3a5967,0x233e4c);grid.position.y=.002;scene.add(grid);
function line(points,color,opacity=1){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity}));scene.add(l);return l;}
line([[-3,.01,-3],[3,.01,-3],[3,.01,3],[-3,.01,3],[-3,.01,-3]],0x65aeaa,.65);
// Architectural wireframe: an uncluttered test volume, not collision obstacles.
for(const x of [-3,3])for(const z of [-3,3]){line([[x,0,z],[x,3,z]],0x355362,.35);}
line([[-3,3,-3],[3,3,-3],[3,3,3],[-3,3,3],[-3,3,-3]],0x355362,.28);
function textSprite(text,color='#7faaa9',scale=.35){const c=document.createElement('canvas');c.width=256;c.height=80;const ctx=c.getContext('2d');ctx.font='500 30px Segoe UI';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,128,51);const m=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false});const s=new THREE.Sprite(m);s.scale.set(scale*3.2,scale,1);return s;}
for(let i=-3;i<=3;i++){const s=textSprite(i+' m','#658c9d',.12);s.position.set(i,.04,3.23);scene.add(s);}
const pad=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.012,64),mat(0x203d44));pad.position.y=.012;pad.receiveShadow=true;scene.add(pad);
const padRing=new THREE.Mesh(new THREE.RingGeometry(.34,.35,64),new THREE.MeshBasicMaterial({color:0x55e6cf,side:THREE.DoubleSide}));padRing.rotation.x=-Math.PI/2;padRing.position.y=.02;scene.add(padRing);
const h=textSprite('H','#71cfbd',.32);h.position.set(0,.03,0);h.material.rotation=0;scene.add(h);
const beaconCoords=[[0,0],[1.8,0],[0,1.8],[-1.8,0],[0,-1.8]];
const beacons=beaconCoords.map(([x,y],i)=>{const g=new THREE.Group();g.position.set(x,0,-y);const ring=new THREE.Mesh(new THREE.TorusGeometry(.19,.008,8,48),new THREE.MeshBasicMaterial({color:0xe9b56c}));ring.rotation.x=Math.PI/2;ring.position.y=.035;g.add(ring);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.16,10),mat(0x9da5a3));pole.position.set(.27,.08,0);g.add(pole);const label=textSprite('B'+(i+1),'#f5c78d',.12);label.position.set(.27,.26,0);g.add(label);scene.add(g);return {g,ring};});
const route=line(beaconCoords.map(([x,y])=>[x,1.2,-y]).concat([[0,1.2,0]]),0xcca15d,.28);
const target=new THREE.Group();const targetRing=new THREE.Mesh(new THREE.TorusGeometry(.085,.0025,8,48),new THREE.MeshBasicMaterial({color:0xf7bc70}));targetRing.rotation.x=Math.PI/2;target.add(targetRing);target.add(new THREE.AxesHelper(.06));scene.add(target);
const drone=new THREE.Group();scene.add(drone);
// Renderer uses X right, Y up, -Z forward. Body geometry is in physics X/Y/Z,
// transformed through a fixed basis quaternion before applying the body attitude.
const bodyGroup=new THREE.Group();drone.add(bodyGroup);
function mesh(geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;bodyGroup.add(m);return m;}
const carbon=mat(0x1a2831,.65,.35), board=mat(0x125a4e,.3,.5), metal=mat(0xb7c2c8,.8,.3), batteryMat=mat(0xaebcc5,.5,.5);
mesh(new THREE.BoxGeometry(.058,.039,.012),board,0,0,.015);
mesh(new THREE.BoxGeometry(.026,.023,.006),metal,.006,0,.024);
mesh(new THREE.BoxGeometry(.039,.023,.022),batteryMat,-.004,0,-.012);
const band=mesh(new THREE.BoxGeometry(.012,.027,.025),mat(0x24303c),-.005,0,-.012);
const props=[];
[[.045,-.045],[-.045,-.045],[-.045,.045],[.045,.045]].forEach(([x,y],i)=>{
 const len=Math.hypot(x,y);const arm=mesh(new THREE.BoxGeometry(len,.007,.006),carbon,x/2,y/2,0);arm.rotation.z=Math.atan2(y,x);
 const motor=mesh(new THREE.CylinderGeometry(.0043,.0043,.02,16),metal,x,y,.002);motor.rotation.x=Math.PI/2;
 const guard=mesh(new THREE.TorusGeometry(.026,.0012,6,48),mat(i<2?0x54b6a6:0x627b95),x,y,.012);
 const rotor=new THREE.Group();rotor.position.set(x,y,.015);bodyGroup.add(rotor);
 for(let j=0;j<2;j++){const blade=new THREE.Mesh(new THREE.BoxGeometry(.046,.005,.0009),mat(i===0||i===3?0x75f0d5:0xb0c3d4,.2,.4));blade.rotation.z=j*Math.PI/2;rotor.add(blade);}
 const disc=new THREE.Mesh(new THREE.CircleGeometry(.024,40),new THREE.MeshBasicMaterial({color:i<2?0x77ecd4:0xb9d2e5,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));rotor.add(disc);props.push({rotor,disc});
 const led=mesh(new THREE.SphereGeometry(.0025,8,8),new THREE.MeshBasicMaterial({color:i<2?0x55e6cf:0xf7bc70}),x,y,-.009);
});
const antenna=mesh(new THREE.BoxGeometry(.018,.004,.001),mat(0xd2bc71),-.02,.012,.024);
const marker=new THREE.Mesh(new THREE.ConeGeometry(.007,.018,3),new THREE.MeshBasicMaterial({color:0x55e6cf}));marker.rotation.y=Math.PI/2;marker.rotation.z=-Math.PI/2;marker.position.set(.038,0,.021);bodyGroup.add(marker);
// Drone rendered at its physical scale. Camera inspection zoom is available.
const basis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.12,40),new THREE.MeshBasicMaterial({color:0x02090d,transparent:true,opacity:.35,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;scene.add(shadow);
const droneLabel=textSprite('ESP32 · 8520','#b9e8df',.035);scene.add(droneLabel);
let trailLine=line([],0x55e6cf,.65);const dropLine=line([[0,0,0],[0,1,0]],0x5aa596,.3);
let azimuth=.72,elevation=.61,distance=7.0,drag=false,px=0,py=0;
$('world').addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;$('world').setPointerCapture(e.pointerId);});
$('world').addEventListener('pointermove',e=>{if(!drag)return;cameraMode='orbit';azimuth-=(e.clientX-px)*.008;elevation=Math.max(.10,Math.min(1.5,elevation+(e.clientY-py)*.006));px=e.clientX;py=e.clientY;});
$('world').addEventListener('pointerup',()=>drag=false);
$('world').addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(.45,Math.min(14,distance+e.deltaY*.006));},{passive:false});
function resize(){const r=$('viewport').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe($('viewport'));
let animTime=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-animTime)/1000,.1);animTime=now;
 if(state){const [x,y,z]=state.position;drone.position.lerp(new THREE.Vector3(x,z,-y),.35);const q=new THREE.Quaternion(...state.quaternion);drone.quaternion.copy(basis).multiply(q);shadow.position.set(x,.025,-y);shadow.scale.setScalar(1+z*.13);shadow.material.opacity=.35/(1+z);droneLabel.position.copy(drone.position).add(new THREE.Vector3(0,.17,0));target.position.set(state.target[0],state.target[2],-state.target[1]);
 props.forEach((p,i)=>{p.rotor.rotation.z+=dt*(state.running?state.motors[i]*140:0)*(i%2?1:-1);p.disc.material.opacity=state.running?state.motors[i]*.21:0;});
 const dropPoints=[new THREE.Vector3(x,.028,-y),new THREE.Vector3(x,z,-y)];dropLine.geometry.setFromPoints(dropPoints);
 beacons.forEach((b,i)=>{b.g.visible=mode==='waypoints';b.ring.material.color.set(state.visited.includes(i)?0x55e6cf:0xe9b56c);});route.visible=mode==='waypoints';
 if(state.time<lastTime){trail=[];lastTrail=-1;trailLine.geometry.dispose();trailLine.geometry=new THREE.BufferGeometry();}lastTime=state.time;
 if(state.running&&state.time-lastTrail>.12){trail.push(new THREE.Vector3(x,z,-y));if(trail.length>1500)trail.shift();lastTrail=state.time;trailLine.geometry.dispose();trailLine.geometry=new THREE.BufferGeometry().setFromPoints(trail);}
 }
 let look=new THREE.Vector3(0,.6,0),desired;
 if(cameraMode==='top'){desired=new THREE.Vector3(.001,8,.001);look.set(0,0,0);}
 else if(cameraMode==='follow'){look.copy(drone.position);look.y+=.02;desired=look.clone().add(new THREE.Vector3(.35,.25,.43));}
 else{desired=new THREE.Vector3(distance*Math.sin(azimuth)*Math.cos(elevation),distance*Math.sin(elevation),distance*Math.cos(azimuth)*Math.cos(elevation));if(distance<2)look.copy(drone.position);desired.add(look);}
 camera.position.lerp(desired,.09);camera.lookAt(look);renderer.render(scene,camera);
}requestAnimationFrame(animate);

function chart(id,series,range){const c=$(id),dpr=devicePixelRatio,rect=c.getBoundingClientRect();c.width=rect.width*dpr;c.height=rect.height*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);const w=rect.width,h=rect.height,L=30,R=8,T=7,B=18;ctx.font='8px Segoe UI';ctx.fillStyle='#648096';ctx.strokeStyle='#223441';ctx.lineWidth=.7;for(let i=0;i<4;i++){let y=T+(h-T-B)*i/3;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillText((range[1]-(range[1]-range[0])*i/3).toFixed(1),0,y+3);}const hist=state?.history||[],start=Math.max(0,(state?.time||0)-25),end=Math.max(10,state?.time||10);for(let i=0;i<3;i++){const t=start+(end-start)*i/2;ctx.fillText(t.toFixed(0)+'s',L+(w-L-R)*i/2-4,h-2);}series.forEach(([col,color,dash])=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.setLineDash(dash?[4,4]:[]);let first=true;for(const r of hist){if(r[0]<start)continue;const x=L+(r[0]-start)/(end-start)*(w-L-R),y=T+(range[1]-r[col])/(range[1]-range[0])*(h-T-B);if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}ctx.stroke();ctx.setLineDash([]);});}
function minimap(){const c=$('minimap'),r=c.getBoundingClientRect(),dpr=devicePixelRatio;c.width=r.width*dpr;c.height=r.height*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);let w=r.width,h=r.height,s=Math.min(w,h)/6.7;const xy=(x,y)=>[w/2+x*s,h/2-y*s];ctx.strokeStyle='#223947';ctx.lineWidth=.6;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(...xy(-3,i));ctx.lineTo(...xy(3,i));ctx.moveTo(...xy(i,-3));ctx.lineTo(...xy(i,3));ctx.stroke();}if(mode==='waypoints'){ctx.strokeStyle='#b88d5266';ctx.beginPath();beaconCoords.forEach(([x,y],i)=>i?ctx.lineTo(...xy(x,y)):ctx.moveTo(...xy(x,y)));ctx.stroke();beaconCoords.forEach(([x,y],i)=>{ctx.fillStyle=state?.visited.includes(i)?'#55e6cf':'#e9b56c';ctx.beginPath();ctx.arc(...xy(x,y),3,0,7);ctx.fill();});}ctx.strokeStyle='#55e6cf66';ctx.beginPath();trail.forEach((p,i)=>i?ctx.lineTo(...xy(p.x,-p.z)):ctx.moveTo(...xy(p.x,-p.z)));ctx.stroke();if(state){const t=xy(state.target[0],state.target[1]);ctx.strokeStyle='#f7bc70';ctx.strokeRect(t[0]-4,t[1]-4,8,8);ctx.save();ctx.translate(...xy(state.position[0],state.position[1]));ctx.rotate(-state.angles[2]+Math.PI/2);ctx.fillStyle='#55e6cf';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();}}
for(let i=0;i<4;i++)$('motorBars').insertAdjacentHTML('beforeend','<div><i></i></div>');
function update(){if(!state)return;mode=state.scenario;$('missionTitle').textContent=names[mode];document.querySelectorAll('.scenario').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('offline').style.display='none';document.body.classList.remove('disconnected');$('connection').textContent='ENGINE ONLINE';$('connectionDot').style.background='#55e6cf';$('phase').textContent=state.phase;$('start').textContent=state.running?'Ⅱ Pause experiment':state.complete?'↻ Run again':state.time?'▶ Resume experiment':'▶ Run experiment';
 $('altitude').innerHTML=state.position[2].toFixed(2)+' <small>m</small>';$('targetAltitude').textContent=state.target[2].toFixed(2)+' m';$('error').innerHTML=state.error.toFixed(3)+' <small>m</small>';$('attitude').innerHTML=(state.angles[0]*180/Math.PI).toFixed(1)+' <small>°</small>';$('pitch').textContent=(state.angles[1]*180/Math.PI).toFixed(1)+'°';$('time').innerHTML=String(Math.floor(state.time/60)).padStart(2,'0')+':'+String(Math.floor(state.time%60)).padStart(2,'0')+' <small>s</small>';
 $('missionProgress').textContent=mode==='waypoints'?state.visited.length+' / 5 beacons acquired':state.complete?'Touchdown · disarmed':state.running?'Physics integration active':state.time?'Simulation paused':'Awaiting arm command';$('speed').textContent=Math.hypot(...state.velocity).toFixed(2)+' m/s';$('rmse').textContent=state.time>4?state.rmse.toFixed(3)+' m':'Collecting…';$('linkState').textContent=state.link?'CONNECTED':'TIMED OUT';$('linkState').style.color=state.link?'#55e6cf':'#f7bc70';$('flightMode').textContent=state.phase==='FAILSAFE'?'Assisted landing':'Position assisted';$('batteryValue').textContent=state.battery.toFixed(1)+'%';$('batteryFill').style.width=state.battery+'%';
 state.motors.forEach((v,i)=>{document.querySelector('.m'+(i+1)+' b').textContent=Math.round(v*100)+'%';$('motorBars').children[i].firstChild.style.width=v*100+'%';});['posX','posY','posZ'].forEach((id,i)=>$(id).textContent=state.position[i].toFixed(2));
 const captions={READY:'Ready for takeoff',TAKEOFF:'Climbing to the hover setpoint',HOVER:'Closed-loop hover active',MISSION:'Navigating the five-beacon route',RETURN:'Mission complete · returning home',LANDING:'Controlled descent in progress',FAILSAFE:'Link timeout · assisted landing',LANDED:'Successful touchdown · disarmed',ABORTED:'Flight envelope exceeded'};$('missionCaption').textContent=captions[state.phase]||state.phase;$('missionDetail').textContent=state.phase==='LANDED'?'Flight data ready to export':'Target ['+state.target.map(v=>v.toFixed(2)).join(', ')+'] m · virtual position feedback';
 $('events').replaceChildren(...state.events.slice().reverse().map(e=>{const div=document.createElement('div');div.className='event';const time=document.createElement('time');time.textContent=e.t.toFixed(1)+'s';const span=document.createElement('span');span.textContent=e.text;div.append(time,span);return div;}));
 chart('altChart',[[1,'#55e6cf'],[2,'#f7bc70',true]],[0,Math.max(1.6,state.target[2]+.3,state.position[2]+.3)]);const hist=state.history;const angleLimit=Math.max(5,...hist.flatMap(r=>[Math.abs(r[4]),Math.abs(r[5])]))*1.15;chart('attChart',[[4,'#55e6cf'],[5,'#b7a5ff']],[-angleLimit,angleLimit]);minimap();}
async function poll(){try{const r=await fetch('/api/state');if(!r.ok)throw Error('Engine offline');state=await r.json();update();}catch(e){document.body.classList.add('disconnected');$('connection').textContent='ENGINE OFFLINE';$('offline').textContent='Physics engine offline. Keep the launcher window running.';$('offline').style.display='flex';}setTimeout(poll,75);}poll();
// Keyboard mobile-command surrogate. Every nudge goes through the server controller.
window.addEventListener('keydown',e=>{if($('modelDialog').open||e.target.matches('input'))return;if(e.code==='Space'){e.preventDefault();$('start').click();}if(e.key.toLowerCase()==='g')command('gust');if(e.key.toLowerCase()==='l')command('land');if(!state||!state.link)return;const changes={ArrowUp:[.25,0],ArrowDown:[-.25,0],ArrowLeft:[0,.25],ArrowRight:[0,-.25]};if(changes[e.key]){e.preventDefault();command('target',{x:state.target[0]+changes[e.key][0],y:state.target[1]+changes[e.key][1],z:state.target[2]});}});
