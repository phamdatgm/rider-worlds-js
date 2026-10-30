// Home presentation: the selected world's painted plate (environment and podium) behind the original live vehicle.
import * as THREE from 'three';
import { Render } from '../engine/render.js';
import { Game } from '../game/state.js';
import { SceneHost, TransitionScreen } from '../uiscripts/scenes.js';
import { UI_WorldNavButtons } from '../uiscripts/home.js';
import { WorldManager } from '../uiscripts/services.js';
import { UIStatics } from '../uiscripts/statics.js';
import { UISprites } from '../ugui/sprites.js';
import { setTheme, theme } from './style.js';
import { WorldManager as Worlds } from '../meta/worlds.js';
import { applyWorldCosmetics, UI_MetaTab } from '../uiscripts/garage.js';
import { CameraRig } from '../game/camera.js';

let room=null,hidden=[],background=null,wasShown=false;
// Home camera, relative to the vehicle. Fitted so the vehicle stands in the middle of the podium painted in the
// plates (art/ui2/home_plate_w<N>_v2.png: top rim centred at 958.7, 670.5 of 1920 x 1080, half-axes 314.7 x 67.5).
export const CAM={y:3.542,z:16.232,look:.697,fov:20.5};
// The whole Home environment (plate and 3D view) is drawn at ZOOM about the screen centre and DROP design px lower
// (a slightly raised camera); the plate's mirrored edges fill the margin this leaves.
export const ZOOM=1,DROP=0;
// Podium rim centre in the plate (y of 1080) and on a 16:9 screen (y of 720).
const PLATE_Y=670.5,SCREEN_Y=360+(PLATE_Y-540)*(720/1080)*ZOOM;
// Wider than 16:9 the plate fits the width and would push the podium under the tab bar. Keep the podium at
// SCREEN_Y / 720 of the screen height, as on 16:9, within what the plate can cover.
/** screen px the environment moves down: the wide-screen correction plus DROP (landscape only) */
function sceneShift(){return innerWidth>=innerHeight?wideShift()+DROP/720*innerHeight:0;}
function wideShift(){
  const W=innerWidth,H=innerHeight;if(W/H<=16/9)return 0;
  const s=W/1920*ZOOM,room=Math.max(0,(1080*s-H)/2);
  return Math.max(-room,Math.min(room,SCREEN_Y/720*H-(H/2+(PLATE_Y-540)*s)));
}
// CAM was fitted for a 1.74 radius on the podium; every vehicle is shown at VEHICLE_SHARE of the podium's diameter,
// so the camera distance scales with the vehicle's length.
const CAM_RADIUS=1.74,VEHICLE_SHARE=.44;
// Footprint of the vehicle (centre where its wheels touch, length), once per vehicle model: the models are not centred
// on the player transform. Measured only while the visual is at rest (no garage preview moving it).
const footprints=new WeakMap();
function footprint(player){
  const cv=player.CarVisuals,visual=cv?.transform?.obj;if(!visual)return null;
  if(!footprints.has(visual)){
    const rest=cv._localPosition||new THREE.Vector3();
    if(cv.transform.localPosition.distanceTo(rest)>1e-3)return null;
    const box=new THREE.Box3();
    visual.updateWorldMatrix(true,true);
    for(const r of cv.renderers||[])if(r.mesh)box.expandByObject(r.mesh);
    if(box.isEmpty())return null;
    const p=player.transform.position;
    footprints.set(visual,{at:new THREE.Vector3((box.min.x+box.max.x)/2-p.x,box.min.y-p.y,(box.min.z+box.max.z)/2-p.z),length:box.max.x-box.min.x});
  }
  const f=footprints.get(visual);
  return {at:f.at.clone().add(player.transform.position),scale:f.length/(2*VEHICLE_SHARE*CAM_RADIUS)};
}
// the home-lit clones are kept for the session: disposing them on leaving Home threw their compiled programs away,
// so every return to Home recompiled the vehicle shader (a few hundred ms hitch)
const homeMaterials=new Map();
const homeScales=new Map();
function lightVehicle(player){
  for(const r of player?.CarVisuals?.renderers||[]){
    const mesh=r.mesh;if(!mesh)continue;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const lit=materials.map(mat=>{
      if(mat.userData.ui2Home)return mat;
      if(homeMaterials.has(mat))return homeMaterials.get(mat);
      if(!mat.fragmentShader?.includes('vec3 emission = mix(emissionTex'))return mat;
      const clone=mat.clone();clone.uniforms=mat.uniforms;clone.userData={...mat.userData,ui2Home:true,original:mat};
      clone.fragmentShader=mat.fragmentShader.replace('gl_FragColor = rwLitPBR(albedo, 0.0, vec3(0.0), 0.5, 1.0, emission, 1.0);',`
        float light=.35+.65*max(0.,dot(rwNormalWS(),normalize(vec3(-.3,1.,.6))));
        vec3 body=albedo*light*mix(.16,1.,sat(coverage));
        vec3 neon=emissionTex*vec3(.12,1.3,2.1)*(1.-sat(coverage));
        gl_FragColor=vec4(body+neon+rwFresnel(3.)*vec3(.02,.04,.09),1.);`);
      homeMaterials.set(mat,clone);return clone;
    });
    mesh.material=Array.isArray(mesh.material)?lit:lit[0];
  }
}
function restoreVehicle(){
  Render.scene.traverse(obj=>{if(!obj.isMesh)return;const restore=m=>m?.userData.ui2Home?m.userData.original:m;obj.material=Array.isArray(obj.material)?obj.material.map(restore):restore(obj.material);});
  for(const [t,s] of homeScales)if(t?.obj)t.localScale=s;
  homeScales.clear();
}
function build(){
  const g=new THREE.Group();g.name='UI2 Home Showroom';
  const plate=UISprites.byName('HomePlate1');
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{map:{value:plate.texture},aspect:{value:16/9},shift:{value:0},uvRect:{value:new THREE.Vector4(...plate.outerUV)}},
    vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,1.,1.);}',
    fragmentShader:`uniform sampler2D map;uniform float aspect,shift;uniform vec4 uvRect;varying vec2 v;
      void main(){vec2 q=v-.5;float a=16./9.;if(aspect>a)q.y*=a/aspect;else q.x*=aspect/a;q=q/ZOOM;q.y+=shift;
      vec2 u=q+.5,m=1.-abs(1.-mod(u,2.));
      // the mirrored margin darkens toward the screen edge, so its fold does not read
      vec2 o=max(-u,u-1.);float out_=max(max(o.x,o.y),0.);
      gl_FragColor=vec4(texture2D(map,mix(uvRect.xy,uvRect.zw,m)).rgb*(1.-.75*smoothstep(0.,.11,out_)),1.);}`.replace('ZOOM',ZOOM.toFixed(3))
  }));
  sky.name='UI2 Home Backdrop';sky.renderOrder=-1000;sky.frustumCulled=false;g.add(sky);
  g.userData.sky=sky;
  Render.scene.add(g);return g;
}
/** the world shown on Home: the world navigation's selection, else the current world */
function shownWorld(){
  const selected=UI_WorldNavButtons.localWorldSelected;
  return selected>=0?selected:WorldManager.Instance?.CurrentWorldIndex ?? 0;
}
// The world Home is drawn for (plate, colours, vehicle, world badge): it follows the world navigated to only while the
// transition screen covers Home, so a switch goes old world -> black -> new world (owner's request); the selection
// changes on the press, which swapped the plate and colours before the screen had darkened.
function displayedWorld(){
  const w=shownWorld();
  if(theme.world<0 || (w!==theme.world && homeCovered()))theme.world=w;
  return theme.world;
}
function showPlate(sky){
  const world=displayedWorld();
  const plate=UISprites.byName('HomePlate'+(world+1))||UISprites.byName('HomePlate1');
  const u=sky.material.uniforms;
  if(u.map.value!==plate.texture){u.map.value=plate.texture;u.uvRect.value.set(...plate.outerUV);}
}
// A locked world shows its default vehicle and cosmetics on the podium (owner's request); leaving the locked world
// puts the equipped ones back. The world switch hid the vehicle (UI_WorldNavButtons.ButtonWorldChange) and only the
// end of an unlocked transition shows it again, so it is shown here.
// The swap follows the displayed world, so it is made while the transition screen covers Home (or none is up): going
// by theme.locked, set only once the locked world showed, put the previous world's vehicle on its podium for a frame.
function homeCovered(){
  const ts=TransitionScreen.Instance;
  if(!ts?.canvas?.enabled || !(ts.canvasGroup?.alpha>0))return true;
  const backdrop=ts.transform.Find('UI Container/Background')?.gameObject.GetComponent('Image');
  return ts.canvasGroup.alpha>.99 && (backdrop?.color.a??1)>.99;
}
function lockedVehicle(){
  // the browsed locked world's equipped cards (its starters) are what the garage and Home show
  const shown=displayedWorld(),world=Worlds.IsWorldUnlocked(shown)?-1:shown;
  if(world!==Worlds.BrowsedWorldIndex){Worlds.BrowsedWorldIndex=world;applyWorldCosmetics();}
  const cv=world>=0 && Game.manager?.RunState?.PlayerState?.Player?.CarVisuals;
  if(cv && !cv.gameObject.activeSelf)cv.gameObject.SetActive(true);
}
// Garage (owner's markups): the road the vehicle stands on crosses the screen falling gently to the right (ROAD_SLOPE,
// screen y down), the vehicle standing at ROAD (design px, centred under its name). Runs after the camera rig has
// placed the camera for this frame.
const ROAD={x:640,y:222},ROAD_SLOPE=Math.atan2(175,1900);
// the garage camera backs away from the vehicle by this factor of its distance (the road and vehicle read smaller)
const GARAGE_PULL_BACK=1.8;
// the landing and explosion tabs back away further (owner's request: their effects spread wider than the vehicle)
const VIEW_PULL_BACK={landing:2.6,death:2.6};
const roadA=new THREE.Vector3(),roadB=new THREE.Vector3();
// Every garage tab frames the vehicle as the Vehicles tab does (owner's request: the road stays put, the previews still
// drop or drive the vehicle with their effects). The trail, landing and explosion previews had wide shots of their own;
// their views keep their names (the tab logic reads them) and take the Vehicles tab's camera.
const PREVIEW_VIEWS=['trail','landing','death'];
const STILL_VIEWS=['menu','vehicle',...PREVIEW_VIEWS];
// the Vehicles page's tab that runs the previews (its trail preview's path is fitted to the screen below)
let metaTab=null;
const initialize=UI_MetaTab.prototype.Initialize;
UI_MetaTab.prototype.Initialize=function(button){metaTab=this;return initialize.call(this,button);};
const setStaticView=CameraRig.prototype.SetStaticView;
CameraRig.prototype.SetStaticView=function(name,blend){
  if(innerWidth<innerHeight)return setStaticView.call(this,name,blend);
  // Home <-> Vehicles cuts instead of blending: the blend slid the vehicle and the road up from below
  if(STILL_VIEWS.includes(name) && STILL_VIEWS.includes(this.staticView?.name))blend=0;
  if(!PREVIEW_VIEWS.includes(name))return setStaticView.call(this,name,blend);
  setStaticView.call(this,'vehicle',blend);
  if(this.staticView)this.staticView.name=name;
};
function screenOf(v,shift){
  // pixels of the unshifted view: the projection still carries last frame's view offset (Render.render)
  v.project(Render.camera);
  return {x:(v.x+1)/2*innerWidth+shift.cx*innerWidth,y:(1-v.y)/2*innerHeight+shift.cy*innerHeight};
}
function garageView(player){
  const cam=Render.camera,obj=player.transform.obj,vs=Render.viewShift;
  obj.updateWorldMatrix(true,false);
  const pull=VIEW_PULL_BACK[Game.cameraRig?.staticView?.name]??GARAGE_PULL_BACK;
  cam.translateZ(cam.position.distanceTo(player.transform.position)*(pull-1));cam.updateMatrixWorld();
  const along=new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld,0).normalize();
  const a=screenOf(roadA.copy(player.transform.position),vs),b=screenOf(roadB.copy(player.transform.position).add(along),vs);
  // rolling the camera by the difference between the road's screen slope (y down) and ROAD_SLOPE tilts it to ROAD_SLOPE
  cam.rotateZ(ROAD_SLOPE-Math.atan2(b.y-a.y,b.x-a.x));cam.updateMatrixWorld();
  const p=screenOf(roadA.copy(player.transform.position),vs);
  const W=innerWidth,H=innerHeight,s=W/H>16/9?H/720:W/1280;
  vs.x=(p.x-(W/2+(ROAD.x-640)*s))/W;vs.y=(p.y-(H/2+(ROAD.y-360)*s))/H;
  trailAcross(player,p.x,W/2+(ROAD.x-640)*s,W);
  landingIn(player,p.y,H/2+(ROAD.y-360)*s);
}
// The trail preview drives from the left edge of the screen to the right one (owner's markup), starting and ending
// out of view, at the original's speed (its -8 -> 12 path in 1.6 s covered part of the screen only). `px`: the
// vehicle's screen x in the unshifted view, `at`: where it shows.
const TRAIL_MARGIN=3,axis=new THREE.Vector3();
function trailAcross(player,px,at,W){
  const pv=Game.cameraRig?.staticView?.name==='trail' && metaTab?._previews?.trail,parent=player.CarVisuals?.transform?.obj?.parent;
  if(!pv || !parent)return;
  pv._ui2Speed ||= Math.abs(pv.targetPos.x-pv.startPos.x)/pv.movementDuration;
  parent.updateWorldMatrix(true,false);axis.setFromMatrixColumn(parent.matrixWorld,0);
  const k=screenOf(roadB.copy(player.transform.position).add(axis),Render.viewShift).x-px;
  if(Math.abs(k)<1e-3)return;
  // local x at the left and right edges, pushed out of view
  const dir=Math.sign(k);
  pv.startPos.x=-at/k-TRAIL_MARGIN*dir;pv.targetPos.x=(W-at)/k+TRAIL_MARGIN*dir;
  pv.movementDuration=Math.abs(pv.targetPos.x-pv.startPos.x)/pv._ui2Speed;
}
// The landing preview drops the vehicle in from above the screen (owner's request; its drop started in view): the
// original start is pushed along its own direction until it is DROP_MARGIN units past the top edge, the fall time
// growing as a fall from that height would (sqrt). `py`: the vehicle's screen y in the unshifted view, `at`: where it
// shows.
const DROP_MARGIN=3;
function landingIn(player,py,at){
  const pv=Game.cameraRig?.staticView?.name==='landing' && metaTab?._previews?.landing,parent=player.CarVisuals?.transform?.obj?.parent;
  if(!pv || !parent)return;
  pv._ui2From ||= {start:pv.startPos.clone(),duration:pv.movementDuration};
  const from=pv._ui2From;
  parent.updateWorldMatrix(true,false);axis.setFromMatrixColumn(parent.matrixWorld,1);
  const k=screenOf(roadB.copy(player.transform.position).add(axis),Render.viewShift).y-py;
  if(k>-1e-3 || from.start.y<=0)return;
  const f=Math.max(1,(-at/k+DROP_MARGIN)/from.start.y);
  pv.startPos.copy(from.start).multiplyScalar(f);pv.movementDuration=from.duration*Math.sqrt(f);
}
export function updateShowroom(){
  if(!Render.scene)return;
  // UI colours follow the world shown (World 2: mint-green frames, gold accents)
  setTheme(displayedWorld());
  // The vehicle stands on the painted podium from the start: the drive-in after a transition is skipped.
  if(UIStatics.vehicleMoveIn && !UIStatics.vehicleMoveIn.ui2)UIStatics.vehicleMoveIn=Object.assign(()=>{},{ui2:true});
  // Nor does it drive out when the world changes (owner's request): it stays put while the screen fades, and the new
  // world's vehicle is on the podium when its scene shows.
  if(UIStatics.vehicleMoveOut && !UIStatics.vehicleMoveOut.ui2)UIStatics.vehicleMoveOut=Object.assign(function*(){},{ui2:true});
  const rig=Game.cameraRig;
  const show=!!SceneHost.menuRoot && rig?.staticView?.name==='menu';
  const garage=!!SceneHost.menuRoot && ['vehicle','trail','landing','death'].includes(rig?.staticView?.name);
  const landscape=innerWidth>=innerHeight,player=Game.manager?.RunState?.PlayerState?.Player;
  if(garage && landscape && player)garageView(player);
  else{Render.viewShift.x=0;Render.viewShift.y=show?-sceneShift()/innerHeight:0;}
  lockedVehicle();
  if(!show && !wasShown)return;
  if(show){
    room ||= build();room.userData.sky.material.uniforms.aspect.value=innerWidth/innerHeight;showPlate(room.userData.sky);
    room.userData.sky.material.uniforms.shift.value=sceneShift()/(1080*Math.max(innerWidth/1920,innerHeight/1080)*ZOOM);
    const player=Game.manager?.RunState?.PlayerState?.Player;
    if(player){
      const p=player.transform.position;room.position.set(p.x,p.y-.24,p.z);lightVehicle(player);
      const visual=player.CarVisuals?.transform;
      if(visual && !homeScales.has(visual))homeScales.set(visual,visual.localScale.clone());
      if(visual)visual.localScale=homeScales.get(visual).clone().multiplyScalar(1.05);
    }
    const f=player && footprint(player);
    if(f){
      const c=f.at,k=f.scale;
      // The camera is aimed at the vehicle's footprint centre and stays square to it (a sideways offset tilts the
      // podium). Wider than 16:9 the plate fits the width, so the 3D view does too. Portrait uses the same camera:
      // the plate fits the height there, as on 4:3, so the vehicle stays on the painted podium.
      Render.camera.position.set(c.x,c.y+CAM.y*k,c.z+CAM.z*k);
      Render.camera.lookAt(c.x,c.y+CAM.look*k,c.z);
      const aspect=innerWidth/innerHeight,half=Math.tan(CAM.fov*Math.PI/360)*Math.min(1,(16/9)/aspect)/ZOOM;
      Render.camera.fov=Math.atan(half)*360/Math.PI;Render.camera.updateProjectionMatrix();
    }
    if(!wasShown)background=Render.scene.background;
    // The menu scene can still contain spawned props and particles outside the chunk roots. Hide every foreign mesh
    // so none of those quads bleed over the flat mountain plate.
    const visualRoot=player?.CarVisuals?.transform?.obj;
    const under=(obj,parent)=>{for(let p=obj;p;p=p.parent)if(p===parent)return true;return false;};
    // a mesh hidden before its render-texture camera moved it to its own layer gets shown again
    hidden=hidden.filter(([o,v])=>{if(o.layers.isEnabled(0))return true;o.visible=v;return false;});
    Render.scene.traverse(obj=>{
      // render-texture content (the lootbox chest) lives on its own layer and is drawn by its own camera
      if(!obj.isMesh || !obj.visible || !obj.layers.isEnabled(0) || under(obj,room) || under(obj,visualRoot))return;
      if(!hidden.some(([o])=>o===obj)){hidden.push([obj,obj.visible]);obj.visible=false;}
    });
    Render.scene.background=new THREE.Color(0x090418);room.visible=true;
  }else{
    restoreVehicle();
    if(room)room.visible=false;
    for(const [obj,v] of hidden)obj.visible=v;
    hidden=[];
    if(background)Render.scene.background=background;
    background=null;
  }
  wasShown=show;
}
