// Landscape re-layout of the original uGUI objects. Portrait snapshots are restored on rotation.
import * as THREE from 'three';
import { InstantiateHooks } from '../engine/instantiate.js';
import { getPrefabJson } from '../engine/assets.js';
import { GameObject, MonoBehaviour, awakeObject, World } from '../engine/scene.js';
import { UISystem, Canvas, CanvasGroup, GraphicRaycaster } from '../ugui/canvas.js';
import { RectTransform, bumpLayout } from '../ugui/rect.js';
import { Image, Mask, RectMask2D } from '../ugui/graphic.js';
import { UISprites } from '../ugui/sprites.js';
import { Meta } from '../meta/data.js';
import { rects, scenes } from './rects.js';
import { homeLayout, worldArrow, homePageShown } from './home.js';
import { styleObject, textStyle, skin, color, tokens, homeGlyph, theme, accent, barFill, barTrack, muted, chamferMask, themeSprite } from './style.js';
import { updateShowroom } from './showroom.js';
import { LoopHooks } from '../engine/loop.js';
import { SceneHost } from '../uiscripts/scenes.js';

const pending=[], contexts=new Set(), originals=new WeakMap();
const enabled=new URLSearchParams(location.search).get('ui2')!=='0';
const layoutTypes=/LayoutGroup|ContentSizeFitter|AspectRatioFitter|AutoLayoutElement|UI_SpaceManager/;
const FULL=new Set(['tr.bg','ru.bg','lx.bg']);
const asRect=r=>Array.isArray(r)?{x:r[0],y:r[1],w:r[2],h:r[3],anchor:'canvas'}:r;
const depth=t=>{let d=0;while(t?.parent){d++;t=t.parent;}return d;};
// level-row stars shown whole in landscape (portrait stacks them into one star again)
const STAR_WHOLE='Sprite/SA_Icons/S_Icon_Star_LevelBar_4',starPieces=new Set();
// level rows hidden on a locked page in landscape (shown again in portrait)
const lockedRows=new Set();
// Images drawn as chamfered mask shapes in landscape (their original drawing in portrait)
const chamferMasks=new Set();
// Star Rank reward cards (owner's mockup): a 3-column grid, 16 apart; the list keeps 14 under the last row for its
// cards' bottom-corner badges
const TRACK_CARD={w:344,h:84,gap:16,cols:3,top:4,bottom:14};
// The Star Rank grid's scrollbar (owner's request); the thumb follows the list (wheel, drag, ScrollToRank). Grabbing
// the thumb keeps the point it was grabbed at under the pointer; pressing the track elsewhere centres the thumb there.
// `hot` (hovered or dragged) brightens the thumb.
class UI2Scrollbar extends MonoBehaviour {
  OnPointerEnter(){this.hover=true;}
  OnPointerExit(){this.hover=false;}
  OnPointerDown(e){
    const ly=this.localY(e);if(ly===null)return;
    const c=this.thumbCentre();this.grab=Math.abs(ly-c)<=(this.thumbH||0)/2?ly-c:0;this.dragging=true;
    this.follow(e);
  }
  OnPointerUp(){this.dragging=false;}
  OnBeginDrag(){this.dragging=true;}
  OnDrag(e){this.follow(e);}
  OnEndDrag(){this.dragging=false;}
  get hot(){return !!(this.hover || this.dragging);}
  localY(e){const l=this.transform.worldToLocal2(e.position.x,e.position.y);return l && this.scroll?.isActiveAndEnabled?l.y:null;}
  /** thumb centre in the track's local space (y up) */
  thumbCentre(){const r=this.transform.rect,h=this.thumbH||0;return r.y+h/2+(r.height-h)*this.scroll.verticalNormalizedPosition;}
  follow(e){
    const ly=this.localY(e);if(ly===null)return;
    const r=this.transform.rect,h=this.thumbH||0;
    this.scroll.verticalNormalizedPosition=Math.max(0,Math.min(1,(ly-(this.grab||0)-r.y-h/2)/Math.max(1,r.height-h)));
  }
}
export const UI2={landscape:innerWidth>=innerHeight,contexts,rects,version:4};
window.__ui2=UI2;

function remember(t){
  if(!t?.isRectTransform)return null;
  if(!originals.has(t)) originals.set(t,{
    min:t.anchorMin.clone(),max:t.anchorMax.clone(),pivot:t.pivot.clone(),pos:t.anchoredPosition.clone(),size:t.sizeDelta.clone(),scale:t.localScale.clone(),parent:t.parent,
    w:t.gameObject._ui2BaseSize?.[0]||Math.max(1,t.rect.width),h:t.gameObject._ui2BaseSize?.[1]||Math.max(1,t.rect.height),active:t.gameObject.activeSelf,
  });
  return originals.get(t);
}
function restore(t){
  const s=originals.get(t);if(!s)return;
  if(t.parent!==s.parent)t.SetParent(s.parent,false);
  const r=t.gameObject._ui2OriginalRect;
  if(r)t.setFromData(r);
  else {t.anchorMin=s.min;t.anchorMax=s.max;t.pivot=s.pivot;t.anchoredPosition=s.pos;t.sizeDelta=s.size;}
  t.localScale=s.scale;
}
function walk(t,fn){fn(t);for(const ch of t.children)walk(ch,fn);}
function rootCanvas(t){while(t){const c=t.gameObject.GetComponent('Canvas');if(c?.isRootCanvas)return c;t=t.parent;}return null;}

// Absolute design coordinates are converted through the existing parents, preserving tutorial and script references.
function place(t,rect){
  if(!t?.isRectTransform || !t.parent)return;
  const r=asRect(rect), canvas=rootCanvas(t);if(!canvas)return;
  const u=canvas.scaleFactor||1,W=UISystem.width/u,H=UISystem.height/u;
  let ox=(W-1280)/2,oy=(H-720)/2;
  if(r.anchor==='top-left'){ox=0;oy=0;}
  if(r.anchor==='top-right'){ox=W-1280;oy=0;}
  if(r.anchor==='bottom')oy=H-720;
  // screen edge horizontally, centred design canvas vertically (the world arrows beside the vehicle)
  if(r.anchor==='left')ox=0;
  if(r.anchor==='right')ox=W-1280;
  const p=t.parent;
  const pt=p.worldToLocal2?.((ox+r.x+r.w/2)*u,(H-oy-r.y-r.h/2)*u);
  if(!pt)return;
  const s=p.lossyScale;
  t.anchorMin=t.anchorMax=new THREE.Vector2(.5,.5);
  t.pivot=new THREE.Vector2(.5,.5);
  t.localScale=new THREE.Vector3(1,1,1);
  t.sizeDelta=new THREE.Vector2(r.w*u/Math.max(1e-6,Math.abs(s.x)),r.h*u/Math.max(1e-6,Math.abs(s.y)));
  t.localPosition=new THREE.Vector3(pt.x,pt.y,0);
}
function local(t,x,y,w,h){
  if(!t?.isRectTransform)return;
  t.anchorMin=t.anchorMax=new THREE.Vector2(0,1);t.pivot=new THREE.Vector2(0,1);
  t.anchoredPosition=new THREE.Vector2(x,-y);t.sizeDelta=new THREE.Vector2(w,h);t.localScale=new THREE.Vector3(1,1,1);
}
function stretch(t){if(!t?.isRectTransform)return;t.anchorMin=new THREE.Vector2(0,0);t.anchorMax=new THREE.Vector2(1,1);t.pivot=new THREE.Vector2(.5,.5);t.sizeDelta=new THREE.Vector2(0,0);t.anchoredPosition=new THREE.Vector2(0,0);t.localScale=new THREE.Vector3(1,1,1);}

function makeContext(root,gos){
  const paths=new Map();
  const visit=(t,path)=>{paths.set(path,t);for(const ch of t.children)visit(ch,path+'/'+ch.gameObject.name);};
  visit(root.transform,root.name);
  const records=new Map(),disabled=new Map(),hidden=new Map(),scalers=new Map(),onFrame=[],onEveryFrame=[],reparents=[];
  for(const go of gos){remember(go.transform);styleObject(go);const s=go.GetComponent('CanvasScaler');if(s)scalers.set(s,{res:[...s.m_ReferenceResolution],mode:s.m_ScreenMatchMode});}
  function find(path){return paths.get(path)||paths.get(root.name+'/'+path)||root.transform.Find(path);}
  function disable(t,deep=false){if(!t)return;const f=t=>{for(const c of t.gameObject.components)if(layoutTypes.test(c._typeName)){if(!disabled.has(c))disabled.set(c,c.enabled);c.enabled=false;}};deep?walk(t,f):f(t);}
  function add(t,r,fs=null,id=null){
    if(!t?.isRectTransform)return;
    remember(t);records.set(t,{t,r:asRect(r),fs,id});
    disable(t);
  }
  function frame(t,r,fs){add(t,r,fs);}
  function map(t,id){if(rects[id])add(t,rects[id],rects[id].fs,id);}
  function hide(t){if(!t)return;if(!hidden.has(t))hidden.set(t,t.gameObject.activeSelf);t.gameObject.SetActive(false);}
  // objects of the approved layout that the original authored inactive (UI_SPEC §7), on in landscape only
  const shown=new Map();
  function show(t){if(!t)return;if(!shown.has(t))shown.set(t,t.gameObject.activeSelf);t.gameObject.SetActive(true);}
  function reparent(t,p){if(!t||!p)return;remember(t);reparents.push([t,p]);t.SetParent(p,false);}
  const ctx={root,gos,find,map,frame,hide,show,disable,onFrame,onEveryFrame,rects,records,reparent,local,stretch,scalers,disabled,hidden,reparents,landscapeComponents:[]};
  ctx.relative=[];
  ctx.place=place;
  ctx.relativeFrame=(t,r,fs)=>{if(t){remember(t);ctx.relative.push({t,r,fs});disable(t);}};
  const name=root._prefabId?.replace('Scenes/','') || (root.name==='Main Menu'?'Menu':root.name);
  const profile=scenes[name];
  if(profile){
    for(const b of profile.bindings)map(find(b.path),b.id);
    for(const b of profile.frames)frame(find(b.path),b.rect);
  }
  if(root.name==='Main Menu'){
    const home=find('UI Container/BodyContainer/PageContainer/Home Screen');
    const bar=find('UI Container/BodyContainer/BottomButtonContainer');
    for(const n of ['ChallengeButton','LevelsButton'])reparent(home?.Find('BottomContainer/'+n),bar);
    for(const n of ['ChallengeOverlay','Timed Level Overlay','WorldStatsScreen','ClaimBonusOverlay']){
      const t=home?.Find(n);reparent(t,find('UI Container'));modal(ctx,t,n);
    }
  }
  homeLayout(ctx);
  configure(ctx);
  // Intermediate containers become a neutral design frame. Mapped descendants keep all original parents.
  for(const {t} of [...records.values()]){
    for(let p=t.parent;p && !p.gameObject.GetComponent('Canvas')?.isRootCanvas;p=p.parent){
      if(!p.isRectTransform)continue;
      if(!records.has(p))records.set(p,{t:p,r:asRect([0,0,1280,720]),neutral:true});
      disable(p);
    }
  }
  ctx.ordered=[...records.values()].sort((a,b)=>depth(a.t)-depth(b.t));
  ctx.animations=gos.flatMap(g=>g.components).filter(c=>/MMFeedbacks|MMF_Player|DOTweenAnimation/.test(c._typeName));
  ctx.apply=()=>{
    for(const go of gos)if(go._ui2Added)go.SetActive(true);
    for(const c of ctx.landscapeComponents)c.enabled=true;
    for(const [s] of scalers){s.m_ReferenceResolution=[1280,720];s.m_ScreenMatchMode=1;}
    for(const [c] of disabled)c.enabled=false;
    for(const [t,p] of reparents)if(t.parent!==p)t.SetParent(p,false);
    for(const [t] of hidden)t.gameObject.SetActive(false);
    for(const [t] of shown)t.gameObject.SetActive(true);
    for(const e of ctx.ordered){
      if(e.skip)continue;
      // full-screen backdrops cover every aspect ratio, not only the 1280 x 720 design canvas
      place(e.t,FULL.has(e.id)?asRect([-1280,-720,3840,2160]):e.r);
      if(e.neutral){const img=e.t.gameObject.GetComponent('Image');if(img && !e.t.gameObject.GetComponent('Mask')){if(!disabled.has(img))disabled.set(img,img.enabled);img.enabled=false;}}
      if(!e.neutral)fitChildren(e.t,e.r.w,e.r.h,records,ctx);
      const text=e.t.gameObject.GetComponent('TextMeshProUGUI');
      if(text && e.fs)textStyle(text,e.fs,/title|hsLabel|name/.test(e.id||'') || /ChallengesText|LevelsText/.test(e.t.name));
      const b=e.t.gameObject.GetComponent('Button'),img=e.t.gameObject.GetComponent('Image')||b?.image;
      if(img && e.id?.endsWith('.bg')){
        if(['tr.bg','ru.bg','lx.bg'].includes(e.id)){img.sprite=null;img.getDrawCalls=undefined;img.color=color(tokens.bg);}
        // the shop backdrop is the violet Home art on World 1 and World 2's own Home plate, as dim, on World 2
        else if(e.id==='sp.bg'){img._ui2Skin=null;img.getDrawCalls=undefined;img.sprite=UISprites.get(theme.suffix?'Sprite/UI2/HomePlate2':'Sprite/UI2/HomeBackdrop');img.type=0;img.preserveAspect=false;img.color=color(theme.suffix?'#5c6864':'#6a6288');}
        else if(!img._ui2Skin)skin(img);
      }
      if(img && b){const u=Math.min(UISystem.width/1280,UISystem.height/720);const pad=Math.max(0,(40/u-Math.min(e.r.w,e.r.h))/2);img.m_RaycastPadding=[-pad,-pad,-pad,-pad];}
    }
    const relativeRecords=new Map([...records,...ctx.relative.map(e=>[e.t,e])]);
    for(const e of ctx.relative){local(e.t,...e.r);fitChildren(e.t,e.r[2],e.r[3],relativeRecords,ctx);if(e.fs)textStyle(e.t.gameObject.GetComponent('TextMeshProUGUI'),e.fs);}
    for(const go of gos)for(const img of go.GetComponents('Image'))if(img._ui2Skin?.kind!=='shade' && img._ui2Skin)img.overrideSprite=null;
    for(const f of onFrame)f();
    bumpLayout();
  };
  ctx.restore=()=>{
    for(const go of gos)restore(go.transform);
    for(const go of gos)for(const text of go.GetComponents('TextMeshProUGUI'))text.fontSize=Math.max(15,text._data?.m_fontSize||36);
    for(const [s,o] of scalers){s.m_ReferenceResolution=o.res;s.m_ScreenMatchMode=o.mode;}
    for(const [c,e] of disabled)c.enabled=e;
    for(const [t,a] of hidden)t.gameObject.SetActive(a);
    for(const [t,a] of shown)t.gameObject.SetActive(a);
    for(const go of gos)if(go._ui2Added)go.SetActive(false);
    for(const c of ctx.landscapeComponents)c.enabled=false;
    for(const img of starPieces)if(img._overrideSprite)img.overrideSprite=null;
    for(const go of lockedRows)if(!go._destroyed)go.SetActive(true);
    for(const img of chamferMasks){img.getDrawCalls=undefined;img._chromeKey=null;}
  };
  contexts.add(ctx);
  if(!UI2.landscape)ctx.restore();
  return ctx;
}

const scaled=new WeakSet();
function fitChildren(t,w,h,records,ctx){
  const o=remember(t);if(!o)return;
  // A parent sized by a layout group has no authored size (remembered as 1): its children keep their own size.
  const sx=o.w>2?w/o.w:1,sy=o.h>2?h/o.h:1;
  const fit=ch=>{
    if(!ch.isRectTransform || records.has(ch))return;
    if(ch.name==='Content' || ch.name==='Scroll Content' || /UI_MetaGrid|UI_MetaDividerBanner/.test(ch.name))return;
    const s=remember(ch);ctx.disable(ch);
    ch.anchorMin=s.min;ch.anchorMax=s.max;ch.pivot=s.pivot;
    ch.anchoredPosition=new THREE.Vector2(s.pos.x*sx,s.pos.y*sy);
    ch.sizeDelta=new THREE.Vector2(s.size.x*sx,s.size.y*sy);
    // the scale is set once: feedbacks animate it afterwards (a lootbox card is remembered mid reveal, at 1.5)
    if(!scaled.has(ch)){scaled.add(ch);ch.localScale=s.scale;}
    const text=ch.gameObject.GetComponent('TextMeshProUGUI');
    if(text)textStyle(text,Math.max(15,Math.min(24,(text._data?.m_fontSize||32)*Math.min(sx,sy))));
    for(const c of ch.children)fit(c);
  };
  for(const ch of t.children)fit(ch);
}

/** stop drawing an original Image in landscape (restored with the portrait layout) */
// Opaque bounds of a sprite (sprite px, top-down), measured once: the card pictures carry very different margins
// (vehicles sit small in their canvas, effects fill it).
const opaque=new Map();
// one CPU-backed canvas for every measure: a fresh GPU canvas per sprite made each getImageData a GPU readback
// (hundreds of ms when the Vehicles page first showed its cards)
let measureCtx=null;
function opaqueBounds(sp){
  if(opaque.has(sp))return opaque.get(sp);
  let b=null;
  try{
    // the sprite's place in its page comes from its UVs (v up); its rect is in its own pixels
    const img=sp.texture?.image,r=sp.rect;
    measureCtx||=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    const g=measureCtx,c=g.canvas;
    if(c.width<r.width||c.height<r.height){c.width=Math.max(c.width,r.width);c.height=Math.max(c.height,r.height);}
    const sx=sp.u0*img.width,sy=(1-sp.v1)*img.height,sw=(sp.u1-sp.u0)*img.width,sh=(sp.v1-sp.v0)*img.height;
    g.clearRect(0,0,r.width,r.height);g.drawImage(img,sx,sy,sw,sh,0,0,r.width,r.height);
    const d=g.getImageData(0,0,r.width,r.height).data;let x0=r.width,y0=r.height,x1=-1,y1=-1;
    for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)if(d[(y*r.width+x)*4+3]>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    if(x1>=x0)b={x0,y0,x1:x1+1,y1:y1+1,w:r.width,h:r.height};
  }catch{}
  opaque.set(sp,b);return b;
}
/** frame of an Image (local, top-left) that fits its sprite's opaque part into the box, centred */
function fitPicture(img,[bx,by,bw,bh]){
  const b=img?.sprite&&opaqueBounds(img.sprite);
  if(!b)return [bx,by,bw,bh];
  const k=Math.min(bw/(b.x1-b.x0),bh/(b.y1-b.y0));
  return [bx+(bw-(b.x1-b.x0)*k)/2-b.x0*k,by+(bh-(b.y1-b.y0)*k)/2-b.y0*k,b.w*k,b.h*k];
}
/** keep an Image's picture fitted to the box (the card layout passes reset it; its sprite changes) */
function keepFitted(ctx,icon,box){
  let sprite=null,f=null;
  remember(icon.transform);ctx.disable(icon.transform);
  ctx.onEveryFrame.push(()=>{
    if(sprite!==icon.sprite){sprite=icon.sprite;f=fitPicture(icon,box());}
    const t=icon.transform,p=t.anchoredPosition,d=t.sizeDelta;
    if(t.anchorMin.x!==0 || t.anchorMax.y!==1 || Math.abs(p.x-f[0])>.01 || Math.abs(p.y+f[1])>.01 || Math.abs(d.x-f[2])>.01 || Math.abs(d.y-f[3])>.01 || t.localScale.x!==1){
      icon.preserveAspect=false;local(t,...f);
    }
  });
}
/** give a band inside a chamfered card its cut-corner sprite (kept Filled for fill bars) */
function band(root,path,name){
  const img=root.Find(path)?.gameObject.GetComponent('Image');if(!img)return;
  const s=UISprites.get('Sprite/UI2/'+name);if(img.sprite!==s)img.sprite=s;
  if(img.type!==3)img.type=0;img.preserveAspect=false;
}
function off(ctx,img){if(!img)return;if(!ctx.disabled.has(img))ctx.disabled.set(img,img.enabled);img.enabled=false;}
/** Cuts what `t` holds to a chamfered shape on its rect (landscape only): its Image becomes the octagon of a Mask
 *  that does not draw itself. Components it lacked are added for landscape only. */
function chamferHolder(ctx,t,corner){
  if(!t)return;
  let img=t.gameObject.GetComponent('Image'),mask=t.gameObject.GetComponent('Mask');
  if(!img){img=t.gameObject.AddComponent(Image);ctx.landscapeComponents.push(img);}
  if(!mask){mask=t.gameObject.AddComponent(Mask);mask.showMaskGraphic=false;ctx.landscapeComponents.push(mask);}
  img.raycastTarget=false;chamferMasks.add(img);
  ctx.onFrame.push(()=>chamferMask(img,corner));
}

function modal(ctx,t,name){
  if(!t)return;
  let c=t.gameObject.GetComponent('Canvas');
  if(!c)c=t.gameObject.AddComponent(Canvas);
  // Draw order (landscape): Home Play tab 100 < popups 104 < their close 105 < lootbox 106 < rank up 107 < a popup
  // over a popup (challenge skip) 108 < tutorial 110,
  // so tutorial focus and hands always stay above the popup they point into.
  c.overrideSorting=true;c.sortingOrder=104;
  if(!t.gameObject.GetComponent('GraphicRaycaster'))t.gameObject.AddComponent(GraphicRaycaster);
  let bg=t.Find('Background');
  if(!bg || name==='Timed Level Overlay' || name==='WorldStatsScreen'){
    const go=new GameObject('UI2 Shade',RectTransform);go._ui2Added=true;go.transform.SetParent(t,false);
    t.children.splice(t.children.indexOf(go.transform),1);t.children.unshift(go.transform);
    go.AddComponent(Image);awakeObject(go);bg=go.transform;ctx.gos.push(go);
  }
  const img=bg.gameObject.GetComponent('Image');if(img)skin(img,'shade');
  // close buttons with their own canvas draw above the shade and the panel
  walk(t,ch=>{
    const cv=ch.gameObject.GetComponent('Canvas');if(cv && ch!==t && /Close/.test(ch.name)){cv.overrideSorting=true;cv.sortingOrder=105;}
    if(ch.name==='CloseButton'){const i=ch.gameObject.GetComponent('Image');if(i)skin(i,'panel','hex');}
    if(['Shadow Bottom','Divider'].includes(ch.name) || (ch.name==='Overlay' && /Close/.test(ch.parent?.name||'')))off(ctx,ch.gameObject.GetComponent('Image'));
  });
  ctx.frame(bg,[-2000,-2000,5280,4720]);
  ctx.onFrame.push(()=>{if(img)img.color=color('#000000',.65);});
  for(const n of ['PopUpBackground','PausePopup']){
    const panel=t.Find(n)?.gameObject.GetComponent('Image');
    if(panel){skin(panel);ctx.onFrame.push(()=>{panel.color=color(tokens.panel,.93);});}
  }
  walk(t,ch=>{
    if(['BackgroundImage','BackgroundGradient','TopBanner','Glow','World Background Left','World Background Right'].includes(ch.name)){
      const i=ch.gameObject.GetComponent('Image');if(i){ctx.disabled.set(i,i.enabled);i.enabled=false;}
    }
  });
}

/** A challenge slot's rewards (spawned per challenge by UpdateRewards, sometimes a cluster): each reward's opaque
 *  picture fitted into its share of the w × h column, at most `size` high. */
function slotRewards(ctx,rewards,w,h,size){
  if(!rewards)return;
  ctx.onEveryFrame.push(()=>{
    const items=rewards.children.filter(c=>c.gameObject.activeSelf),n=items.length;
    items.forEach((it,k)=>{
      const iw=w/n;if(Math.abs(it.sizeDelta.x-iw)>.5 || Math.abs(it.sizeDelta.y-h)>.5 || it.anchorMin.x!==0 || Math.abs(it.anchoredPosition.x-k*iw)>.5)local(it,k*iw,0,iw,h);
      const icon=it.Find('Icon')?.gameObject.GetComponent('Image');if(!icon)return;
      let fit=icon._ui2Fit;
      const s=Math.min(size,iw-4);
      if(fit?.sprite!==icon.sprite || fit.w!==iw)fit=icon._ui2Fit={sprite:icon.sprite,w:iw,f:fitPicture(icon,[(iw-s)/2,(h-s)/2,s,s])};
      const t=icon.transform,p=t.anchoredPosition,d=t.sizeDelta,f=fit.f;
      if(t.anchorMin.x!==0 || Math.abs(p.x-f[0])>.01 || Math.abs(p.y+f[1])>.01 || Math.abs(d.x-f[2])>.01 || Math.abs(d.y-f[3])>.01){icon.preserveAspect=false;local(t,...f);}
    });
  });
}
/** a plain progress bar: the original mask is a slanted 9-slice (S_Challenge_Fillbar), a wedge at row heights */
function plainBar(t){
  const mask=t.Find('FillBarMask')?.gameObject.GetComponent('Image');if(mask){mask.sprite=null;mask.type=0;mask.color=color(barTrack());}
  const track=t.Find('FillBarMask/BackgroundBar')?.gameObject.GetComponent('Image');if(track){track.sprite=null;track.color=color(barTrack());}
}
/** A read-only challenge row (Pause, the Revive reason) at the absolute rect: text over a plain bar on one left edge,
 *  then the hard icon, the check and the reward. */
function readonlyRow(ctx,t,[x,y,w,h]){
  const {frame,onFrame}=ctx;
  frame(t,[x,y,w,h]);
  const plate=t.gameObject.GetComponent('Image')||t.gameObject.AddComponent(Image);plate.raycastTarget=false;skin(plate,'row');
  // right to left: reward, check, hard icon; the text and the bar take the rest
  const tw=w-128,cy=y+(h-28)/2;
  for(const [n,r,fs] of [['ChallengeText (TMP)',[x+16,y+5,tw,h-17],16],['FillBarMask',[x+16,y+h-11,tw,5]],['FillBarMask/BackgroundBar',[x+16,y+h-11,tw,5]],['FillBarMask/BackgroundBar/BarFiller',[x+16,y+h-11,tw,5]],
    ['HardChallenge Icon',[x+w-106,cy,28,28]],['ChallengeCompleted',[x+w-76,cy,28,28]],['ChallengeCompleted/Checkmark',[x+w-76,cy,28,28]],['RewardContainer',[x+w-46,y+(h-40)/2,40,40]]])frame(t.Find(n),r,fs);
  slotRewards(ctx,t.Find('RewardContainer'),40,40,32);
  onFrame.push(()=>{
    // 16, down to 15, then a second line above the bar
    const text=t.Find('ChallengeText (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    if(text){text.enableWordWrapping=true;text.m_enableAutoSizing=1;text.m_fontSizeMax=16;text.m_fontSizeMin=15;text.horizontalAlignment=1;text.verticalAlignment=512;}
    plainBar(t);
    for(const n of ['HardChallenge Icon','ChallengeCompleted/Checkmark']){const im=t.Find(n)?.gameObject.GetComponent('Image');if(im)im.preserveAspect=true;}
    const check=t.Find('ChallengeCompleted/Checkmark')?.gameObject.GetComponent('Image');
    if(check){themeSprite(check,'badge_claimed');check.type=0;check.color=color('#ffffff');}
  });
  ctx.onEveryFrame.push(()=>{const f=t.Find('FillBarMask/BackgroundBar/BarFiller')?.gameObject.GetComponent('Image'),c=color(barFill());if(f && !f.color.equals(c))f.color=c;});
}

function configure(ctx){
  const {root,find,map,frame,relativeFrame:rel,onFrame,hide,disable}=ctx;
  const all=type=>ctx.gos.flatMap(g=>g.GetComponents(type));
  const named=(name)=>ctx.gos.filter(g=>g.name===name).map(g=>g.transform);
  // Repeated challenges: the original three slots retain their states, reward instances and tutorial sockets.
  for(const container of all('UI_ChallengeSlotContainer')){
    const readonly=container.gameObject.name==='ChallengesContainer' && !container.transform.parent?.gameObject.name.includes('PopUp');
    const slots=container.GetComponentsInChildren('UI_ChallengeSlotVisualsMainMenu',true);
    slots.forEach((s,i)=>{
      const x=360,y=222+i*82;frame(s.transform,[x,y,560,70]);
      const face=s.gameObject.GetComponent('Image')||s.gameObject.AddComponent(Image);face.raycastTarget=false;skin(face,'row');
      // laid out like the Pause rows (owner's request): one line of text over a thin bar on the left edge, then the
      // hard icon, the check and the reward on the right
      for(const [n,r,fs] of [['HardChallenge Icon',[x+436,y+19,32,32]],['ChallengeText (TMP)',[x+20,y+10,410,28],17],['FillBarMask',[x+20,y+48,410,8]],['ChallengeCompleted/Checkmark',[x+472,y+18,34,34]],['RewardContainer',[x+510,y+11,44,48]],['SkipChallengeButton',[x+508,y+16,44,38]],['ResetTimerButton',[x+506,y+16,44,38]],['Locked State',[x,y,560,70]],['Completed Timed State',[x,y,560,70]],['Completed World State',[x,y,560,70]]])frame(s.transform.Find(n),r,fs);
      // centred on the row left of the reset button
      frame(s.transform.Find('Completed Timed State/NextText (TMP)'),[x+30,y+10,460,24],17);
      frame(s.transform.Find('Completed Timed State/NextText (TMP)/Timer (TMP)'),[x+30,y+36,460,24],17);
      frame(s.transform.Find('Completed Timed State/SkipButton'),[x+506,y+16,44,38]);
      frame(s.transform.Find('Locked State/Text (TMP)'),[x+40,y+12,480,46],17);
      const rewards=s.transform.Find('RewardContainer');
      // no frame around the reward: a hex next to the skip hex read as two buttons
      slotRewards(ctx,rewards,50,44,36);
      // what the locked view hid, restored when the slot opens (before the first data, every slot reads as locked)
      const lockedView=new Map();
      onFrame.push(()=>{
        const text=s.transform.Find('ChallengeText (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
        if(text){text.enableWordWrapping=false;text.m_enableAutoSizing=1;text.m_fontSizeMax=17;text.m_fontSizeMin=15;text.horizontalAlignment=1;text.verticalAlignment=512;}
        plainBar(s.transform);
        const check=s.transform.Find('ChallengeCompleted/Checkmark')?.gameObject.GetComponent('Image');
        if(check){themeSprite(check,'badge_claimed');check.type=0;check.preserveAspect=true;check.color=color('#ffffff');}
        const hard=s.transform.Find('HardChallenge Icon')?.gameObject.GetComponent('Image');if(hard)hard.preserveAspect=true;
        // the skip glyph is grey in the original art: white like the close button's ✕
        for(const n of ['SkipChallengeButton/Icon','ResetTimerButton/Icon']){const im=s.transform.Find(n)?.gameObject.GetComponent('Image');if(im){im.color=color('#ffffff');im.preserveAspect=true;}}
      });
      // no skip button in landscape (owner's request, 2026-10-29); the game turns it on again with each update
      const skipBtn=s.transform.Find('SkipChallengeButton');
      ctx.onEveryFrame.push(()=>{if(skipBtn?.gameObject.activeSelf)skipBtn.gameObject.SetActive(false);});
      ctx.onEveryFrame.push(()=>{const f=s.transform.Find('FillBarMask/BackgroundBar/BarFiller')?.gameObject.GetComponent('Image'),c=color(barFill());if(f && !f.color.equals(c))f.color=c;});
      const lockState=()=>{
        if(!s.challengeSlot?.IsUnlocked){
          s.gameObject.SetActive(true);
          for(const ch of s.transform.children)if(['Locked State','HardChallenge Icon','ChallengeText (TMP)','FillBarMask','RewardContainer','SkipChallengeButton','ResetTimerButton','Completed Timed State','Completed World State'].includes(ch.name)){
            if(!lockedView.has(ch))lockedView.set(ch,ch.gameObject.activeSelf);
            ch.gameObject.SetActive(ch.name==='Locked State');
          }
          const txt=s.transform.Find('Locked State/Text (TMP)')?.gameObject.GetComponent('SetTextI2');
          const required=Meta.data.challenges.settings[i===1?'slot1':'slot2'];
          txt?.SetText(required);
          if(txt?.localize && !Meta.data.loc[txt.localize.mTerm]){
            const text=txt.gameObject.GetComponent('TextMeshProUGUI');
            if(text)text.text=text._data.m_text.replace('Needs  stars','Needs '+required+' stars');
          }
        }else{
          s.transform.Find('Locked State')?.gameObject.SetActive(false);
          if(lockedView.size){for(const [ch,a] of lockedView)if(ch.name!=='Locked State')ch.gameObject.SetActive(a);lockedView.clear();s.UpdateChallenge?.();}
        }
      };
      onFrame.push(lockState);
      // a slot can open while the popup stays up (claiming unlocks the next): run the check every frame, cheaply
      ctx.onEveryFrame.push(()=>{if(lockedView.size && s.challengeSlot?.IsUnlocked)lockState();});
    });
    if(readonly){
      // Pause: one row plate per challenge, text over its progress bar, reward star on the right (wireframe 16)
      const ss=container.GetComponentsInChildren('UI_ChallengeSlotVisualsReadOnly',true);
      // as wide as the Pause panel (owner's request)
      ss.forEach((s,i)=>readonlyRow(ctx,s.transform,[440,428+i*62,400,56]));
      // then left out of Pause altogether (owner's request, 2026-10-29); portrait shows them again
      const go=container.gameObject;hide(container.transform);
      ctx.onEveryFrame.push(()=>{if(go.activeSelf)go.SetActive(false);});
    }
  }
  // World Stats: each section is one row plate with its title on top; bars are violet on a dark track
  const sections=[];for(const w of named('WorldStatsScreen'))walk(w,t=>{if(/^Statistics - /.test(t.name))sections.push(t);});
  for(const sec of sections){
    const plate=sec.gameObject.GetComponent('Image')||sec.gameObject.AddComponent(Image);plate.raycastTarget=false;skin(plate,'row');
    for(const n of ['AnimationParent/Stats Top/BackgroundBar','AnimationParent/Bars Container'])off(ctx,sec.Find(n)?.gameObject.GetComponent('Image'));
    // Rows spread evenly over the section, each a label and its value over a full-width bar; the title's icon stands
    // clear of the centred title (the heavy face is wider than the original's, the icon sat on the first letters).
    const r=rects[{'Statistics - Endless':'s.endless','Statistics - Levels':'s.levels','Statistics - Collection':'s.coll'}[sec.name]];
    if(r){
      const top=sec.Find('AnimationParent/Stats Top'),barsBox=sec.Find('AnimationParent/Bars Container'),title=top?.Find('Title (TMP)');
      const words=title?.gameObject.GetComponent('TextMeshProUGUI')?.text?.length||8;
      rel(top,[0,6,r.w,30]);rel(title,[0,0,r.w,30],18);rel(top?.Find('Icon'),[Math.round(r.w/2-words*7.5-40),2,28,26]);
      const inset=r.w>400?90:24,rows=(barsBox?.children||[]).filter(b=>/^Stats Bar/.test(b.name) && b.gameObject.activeSelf).sort((a,b)=>(remember(b)?.pos.y??0)-(remember(a)?.pos.y??0));
      const rowH=(r.h-46)/Math.max(1,rows.length);
      rel(barsBox,[0,40,r.w,r.h-46]);
      rows.forEach((row,i)=>{
        rel(row,[0,Math.round(i*rowH),r.w,Math.round(rowH)]);
        const y=Math.round(rowH/2-14);
        rel(row.Find('Title (TMP)'),[inset,y,r.w-inset*2-90,20],15);rel(row.Find('Value (TMP)'),[r.w-inset-90,y,90,20],15);rel(row.Find('Fill Bar'),[inset,y+23,r.w-inset*2,6]);
      });
    }
    onFrame.push(()=>{
      textStyle(sec.Find('AnimationParent/Stats Top/Title (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'),18,true);
      const bars=[];walk(sec,b=>{if(b.name==='Fill Bar')bars.push(b);});
      for(const bar of bars){
        const i=bar.gameObject.GetComponent('Image');if(i)i.color=color(barTrack());
        for(const f of bar.children){const fi=f.gameObject.GetComponent('Image');if(fi)fi.color=color(barFill());}
      }
    });
  }
  for(const w of named('WorldStatsScreen')){
    const bg=w.Find('World Banner/Fill Bar - Background');
    onFrame.push(()=>{const i=bg?.gameObject.GetComponent('Image');if(i)i.color=color(barTrack());const f=bg?.Find('Filler')?.gameObject.GetComponent('Image');if(f)f.color=color(barFill());});
  }
  // Claim Bonus (runtime prefab): concept A with the two buttons stacked as in concept B (wireframe 13)
  for(const cb of all('UI_ClaimBonusOverlay')){
    const t=cb.transform,pop=t.Find('PopUpBackground');
    modal(ctx,t,'Claim Bonus');
    frame(pop,[460,130,360,420]);skin(pop?.gameObject.GetComponent('Image'),'gold');
    for(const n of ['ImageMask/BackgroundImage','TopBanner'])off(ctx,pop?.Find(n)?.gameObject.GetComponent('Image'));
    frame(pop?.Find('ImageMask'),[466,136,348,408]);
    frame(pop?.Find('ClaimTitleText'),rects['cb.title'],20);frame(pop?.Find('GemsText'),rects['cb.amount'],20);
    const icon=pop?.Find('GemsIcons');frame(icon,rects['cb.icon']);onFrame.push(()=>{const i=icon?.gameObject.GetComponent('Image');if(i)i.preserveAspect=true;});
    frame(pop?.Find('ButtonContainer'),[460,384,360,122]);
    for(const [n,id,kind,label,ad] of [['RVButton','cb.rv','gold','x2GemsText','AdIcon'],['ClaimButton','cb.claim','active','ClaimText',null]]){
      const b=pop?.Find('ButtonContainer/'+n),r=rects[id];
      frame(b,r);frame(b?.Find('Background'),r);skin(b?.Find('Background')?.gameObject.GetComponent('Image'),kind);
      frame(b?.Find(label),ad?[r.x+64,r.y,r.w-84,r.h]:[r.x,r.y,r.w,r.h],18);
      if(ad){const a=b?.Find(ad);frame(a,[r.x+22,r.y+9,36,36]);}
      onFrame.push(()=>textStyle(b?.Find(label)?.gameObject.GetComponent('TextMeshProUGUI'),18,true));
    }
    onFrame.push(()=>textStyle(pop?.Find('ClaimTitleText')?.gameObject.GetComponent('TextMeshProUGUI'),20,true));
  }
  // World transition: the same world plate and chevrons as the Home top bar (wireframe 02)
  if(root.name==='Transition Screen'){
    const ind=find('UI Container/WorldTransition/WorldTransitionIndicator');
    const fill=ind?.Find('World FillColor');frame(fill,rects['tr.world']);
    const plate=fill?.gameObject.GetComponent('Image');if(plate){plate._ui2Skin=null;plate.getDrawCalls=()=>[];}
    for(const n of ['World Image - Other World','World Image Prev','World Image New']){const i=ind?.Find(n)?.gameObject.GetComponent('Image');if(i)ctx.onEveryFrame.push(()=>{if(i.color.a>0)i.color=color(tokens.active,0);});}
    // no world name: Home's world badge is an info button (the locked world's name is in its unlock pill)
    for(const n of ['World (TMP)','WorldNumber(TMP)']){const t=ind?.Find(n)?.gameObject.GetComponent('TextMeshProUGUI');if(t)ctx.onEveryFrame.push(()=>{if(t.color.a>0)t.color=color('#ffffff',0);});}
    for(const [n,id] of [['Left','tr.navL'],['Right','tr.navR']]){
      const nav=find('UI Container/WorldTransition/WorldNav/'+n),face=nav?.gameObject.GetComponent('Image');
      if(face){face._ui2Skin=null;face.sprite=null;face.getDrawCalls=()=>[];}
      const arrow=nav?.Find('Arrow');frame(arrow,rects[id]);homeGlyph(arrow?.gameObject.GetComponent('Image'),'left');
      // only over a shown locked world (and on Home): the black between two worlds is empty (owner's request)
      ctx.onEveryFrame.push(worldArrow(nav,n,find('UI Container/WorldTransition/WorldNav')?.gameObject.GetComponent('UI_WorldNavButtons'),()=>!lockedShown() || !homePageShown()));
    }
    // Locked world: the screen stays up until the player navigates back. Its backdrop turns clear, so Home shows through
    // with the locked world's plate and colours; a padlock stands on the empty podium and the unlock rank takes the
    // place of the high score (src/ui2/home.js hides it while theme.locked).
    const lockedGo=find('UI Container/Background/LockedFade'),lock=lockedGo?.gameObject.GetComponent('Image');
    const backdrop=find('UI Container/Background')?.gameObject.GetComponent('Image');
    const req='UI Container/Background/LockedFade/Star Requirement Indicator - Large';
    // standing on the podium painted in the Home plates (rim centre 639, 447 design px, half-width 210)
    frame(lockedGo,[591,344,96,114]);
    // drawn never: TransitionOverlay is the original's black fade stretched over LockedFade, which is shrunk to the
    // podium here, so it showed as a black box over the vehicle while switching worlds; and the unlock line is text
    // only (owner's request), without the pill behind it
    const blank=img=>{if(img){img._ui2Skin=null;img.getDrawCalls=()=>[];}};
    blank(find('UI Container/Background/LockedFade/TransitionOverlay')?.gameObject.GetComponent('Image'));
    // the unlock line and its explanation sit above the podium, between the top bar and the vehicle (owner's markup,
    // 2026-10-29: was y 70 / 124, under the star bar)
    const LY=192;
    frame(find(req),[360,LY,560,46]);frame(find(req+'/Underlay'),[360,LY,560,46]);
    blank(find(req+'/Underlay')?.gameObject.GetComponent('Image'));
    frame(find(req+'/Underlay/UnlocksAt'),[380,LY,436,46],19);
    frame(find(req+'/Underlay/Star'),[824,LY+11,24,24]);
    frame(find(req+'/Underlay/Requirement (TMP)'),[852,LY,56,46],22);
    frame(find(req+'/Underlay/ExplanationTxtBg'),[290,LY+54,700,34]);
    frame(find(req+'/Underlay/ExplanationTxtBg/ExplanationTxt'),[290,LY+54,700,34],18);
    frame(find('UI Container/Background/LockedFade/ComingSoon'),[490,LY,300,46]);
    frame(find('UI Container/Background/LockedFade/ComingSoon/ComingSoonText'),[490,LY,300,46],20);
    const text=n=>find(req+'/Underlay/'+n)?.gameObject.GetComponent('TextMeshProUGUI');
    const star=find(req+'/Underlay/Star')?.gameObject.GetComponent('Image');
    const bgPanel=find(req+'/Underlay/ExplanationTxtBg')?.gameObject.GetComponent('Image');
    onFrame.push(()=>{
      const unlocks=text('UnlocksAt'),rank=text('Requirement (TMP)'),about=text('ExplanationTxtBg/ExplanationTxt');
      textStyle(unlocks,19,true);textStyle(rank,22,true);textStyle(about,18,false,tokens.secondary);
      for(const t of [unlocks,rank])if(t){t.enableWordWrapping=false;t.verticalAlignment=512;}
      if(unlocks)unlocks.horizontalAlignment=4;if(rank)rank.horizontalAlignment=1;if(about)about.horizontalAlignment=2;
      if(bgPanel)bgPanel.color=color('#000000',0);
      if(lock){lock.type=0;lock.preserveAspect=true;lock.color=color('#ffffff');}
    });
    // A locked world can still be browsed (owner's request): the overlay draws under Home's popups (102 < 104) and
    // lets clicks through to Home except on its arrows; off Home (Shop, Vehicles) it is hidden. Only Play is off
    // (src/ui2/home.js). Fades and unlocked transitions keep the screen's own order and raycasts.
    const graphics=[],underNav=t=>{for(let x=t;x;x=x.parent)if(x.name==='WorldNav')return true;return false;};
    walk(root.transform,t=>{for(const c of t.gameObject.components)if('raycastTarget' in c)graphics.push([c,c.raycastTarget,underNav(t)]);});
    let ownOrder=null,offHome=false;
    // off Home the locked overlay is faded out here (its arrows hide themselves: worldArrow). The way back to an
    // unlocked world leaves LockedFade active through its fade, so the target world must be locked and the canvas up
    // and opaque, unless faded out here. Read by the arrows too, which run earlier in the frame.
    function lockedShown(){
      const screen=root.GetComponent('TransitionScreen'),canvas=screen?.canvas,group=screen?.canvasGroup;
      return !!lockedGo?.gameObject.activeInHierarchy && !screen.canLoadTargetWorld && !!canvas?.enabled && (group?.alpha>.99 || offHome);
    }
    // the unlock line and Coming Soon show with the locked world only, not on the black before it (owner's request)
    const lockTexts=[find(req),find('UI Container/Background/LockedFade/ComingSoon')].filter(Boolean).map(t=>t.gameObject.GetComponent('CanvasGroup')||t.gameObject.AddComponent(CanvasGroup));
    ctx.onEveryFrame.push(()=>{
      const screen=root.GetComponent('TransitionScreen');
      const canvas=screen?.canvas,group=screen?.canvasGroup;
      const locked=lockedShown();
      theme.locked=locked;
      for(const g of lockTexts)if(g.alpha!==(locked?1:0))g.alpha=locked?1:0;
      if(!locked)offHome=false;
      if(locked && !screen.IsTransitioning && group){
        ownOrder ||= [canvas.overrideSorting,canvas.sortingOrder];
        canvas.overrideSorting=true;canvas.sortingOrder=102;
        offHome=!homePageShown();group.alpha=offHome?0:1;
        for(const [g,v,nav] of graphics)g.raycastTarget=nav?v:false;
      }else if(ownOrder && canvas){
        [canvas.overrideSorting,canvas.sortingOrder]=ownOrder;ownOrder=null;
        for(const [g,v] of graphics)g.raycastTarget=v;
      }
      if(backdrop){const a=locked?0:1;if(backdrop.color.a!==a)backdrop.color=color(tokens.bg,a);}
      // UpdateTargetWorldStatus puts the world picture back on this Image
      // no padlock: the locked world's default vehicle stands on the podium (src/ui2/showroom.js)
      if(lock && lock.enabled)lock.enabled=false;
      if(star && !star.color.equals(color(accent())))star.color=color(accent());
    });
  }
  // HUD (wireframe 15): hexagon plates behind the pause / restart icons, a pill behind the gems, a large score.
  // Icons and figures keep their plate's screen anchor, or they drift off the plate on screens wider / narrower than 16:9.
  if(root.name==='HUD'){
    const top='UI Container/HUD TopContainer/';
    for(const [n,id] of [['PauseButton','hd.pause'],['RestartButton','hd.restart']]){
      const b=find(top+n),r=rects[id];if(!b)continue;
      const icon=b.gameObject.GetComponent('Button')?.image;
      if(icon && icon.gameObject!==b.gameObject){
        icon._ui2Skin=null;icon.getDrawCalls=undefined;icon.preserveAspect=true;frame(icon.transform,{x:r.x+15,y:r.y+12,w:r.w-30,h:r.h-24,anchor:r.anchor});
        const plate=b.gameObject.GetComponent('Image')||b.gameObject.AddComponent(Image);plate.raycastTarget=true;skin(plate,'panel','hex');
      }
    }
    const gem=find(top+'SoftCurencyBar'),gr=rects['hd.gem'];
    if(gem){const plate=gem.gameObject.GetComponent('Image')||gem.gameObject.AddComponent(Image);plate.raycastTarget=false;skin(plate,'panel','pill');
      frame(gem.Find('Image'),{x:gr.x+12,y:gr.y+3,w:30,h:gr.h-6,anchor:gr.anchor});frame(gem.Find('Text (TMP)'),{x:gr.x+46,y:gr.y+2,w:gr.w-60,h:gr.h-4,anchor:gr.anchor},17);}
    const sc=rects['hd.score'],score=find(top+'ScoreBar/Score Display - Gameplay');
    frame(score?.Find('Value text container'),sc);frame(score?.Find('Value text container/Score Text'),sc,46);
    // "New Best!" is a small gold plate above the score (hd.best), not the original 432-wide banner
    const best=score?.Find('Value text container/NewSticker'),br=rects['hd.best'];
    map(best,'hd.best');frame(best?.Find('ImageBanner'),br);frame(best?.Find('NewText (TMP)'),br,br.fs);
    skin(best?.Find('ImageBanner')?.gameObject.GetComponent('Image'),'gold');
    const bestText=best?.Find('NewText (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    onFrame.push(()=>{textStyle(score?.Find('Value text container/Score Text')?.gameObject.GetComponent('TextMeshProUGUI'),46,true);textStyle(gem?.Find('Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'),17,true);
      if(bestText){textStyle(bestText,br.fs,true,tokens.gold);bestText.enableWordWrapping=false;bestText.horizontalAlignment=2;bestText.verticalAlignment=512;}});
    // The level timer keeps its own proportions (870 x 136, hd.timer 480 x 75): its star times and level name stay on
    // one line (squeezed, a 14 px label broke into a column of letters).
    const timer=score?.Find('Level Timer');
    if(timer)onFrame.push(()=>{for(const t of timer.gameObject.GetComponentsInChildren('TextMeshProUGUI',true))t.enableWordWrapping=false;});
  }
  for(const menu of all('UI_TimedLevelMenu')){
    const t=menu.transform;
    // the close sits above the shade and the panel; its own full-screen overlay is replaced by the UI2 shade
    const closeCanvas=t.Find('Timed Level Close')?.gameObject.GetComponent('Canvas');
    if(closeCanvas){closeCanvas.overrideSorting=true;closeCanvas.sortingOrder=105;}
    for(const n of ['Timed Level Close/Overlay','Timed Level Close/Overlay/Shadow Bottom'])off(ctx,t.Find(n)?.gameObject.GetComponent('Image'));
    const total=t.Find('TotalStarsBar'),r=rects['l.total'];
    // text only beside the title, no plate (owner's request)
    ctx.show(total);off(ctx,total?.gameObject.GetComponent('Image'));
    frame(total?.Find('Text (TMP)'),[r.x,r.y+4,r.w-66,r.h-8],17);frame(total?.Find('TotalStars (TMP)'),[r.x+r.w-60,r.y+4,60,r.h-8],17);
    const label=total?.Find('Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'),count=total?.Find('TotalStars (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    onFrame.push(()=>{if(label)label.horizontalAlignment=4;if(count)count.horizontalAlignment=1;});
    // Page dots under the rows (owner's request): one per page, the page shown lit. Display only.
    const scroll=t.Find('Level Scroll View')?.gameObject.GetComponent('ScrollSnapRect'),dr=rects['l.dots'];
    if(scroll && !t.Find('UI2 Page Dots')){
      const box=new GameObject('UI2 Page Dots',RectTransform);box._ui2Added=true;box.transform.SetParent(t,false);
      awakeObject(box);ctx.gos.push(box);frame(box.transform,dr);
      const dots=[];
      for(let i=0;i<6;i++){
        const d=new GameObject('Dot',RectTransform);d.transform.SetParent(box.transform,false);
        const img=d.AddComponent(Image);img.sprite=UISprites.get('Texture2D/Circle');img.raycastTarget=false;awakeObject(d);dots.push(img);
      }
      let shown='';
      // apply() fits the box's children to the box: lay the dots out again after it
      onFrame.push(()=>{shown='';});
      ctx.onEveryFrame.push(()=>{
        const n=Math.min(dots.length,scroll.pageCount||0),cur=scroll.targetPage,key=n+':'+cur+':'+theme.suffix;
        if(key===shown)return;shown=key;
        const size=12,step=24,x0=(dr.w-(n-1)*step-size)/2;
        dots.forEach((img,i)=>{
          // SetActive bumps the hierarchy version, which re-runs apply(): only when it changes
          if(img.gameObject.activeSelf!==(i<n))img.gameObject.SetActive(i<n);if(i>=n)return;
          local(img.transform,x0+i*step,(dr.h-size)/2,size,size);img.color=color(i===cur?accent():muted());
        });
      });
    }
  }
  for(const p of all('UI_PauseMenu')){
    const settings=root.name==='Main Menu';modal(ctx,p.transform,settings?'Settings':'Pause');
    frame(p.transform.Find('PausePopup'),settings?[440,210,400,260]:[440,140,400,270]);
    if(!settings)frame(p.transform.Find('PausePopup/Header (TMP)'),rects['p.title'],30);
    if(settings){const t=p.transform.Find('PausePopup/cpr')?.gameObject.GetComponent('TextMeshProUGUI');if(t)onFrame.push(()=>{t.font={ $so:'Resources/fonts & materials/LiberationSans SDF' };t.fontSize=15;});}
  }
  // Dynamic UI prefabs are configured by their original component types.
  for(const c of all('UI_ChallengeResetPopup')){
    modal(ctx,c.transform,'Reset');
    // it opens over the Challenges popup (also 104), so it draws above that popup and its close (105)
    const cv=c.gameObject.GetComponent('Canvas');if(cv)cv.sortingOrder=108;
    walk(c.transform,ch=>{const k=ch.gameObject.GetComponent('Canvas');if(k && ch!==c.transform && k.overrideSorting)k.sortingOrder=109;});
    frame(c.transform.Find('SettingsPopup'),[420,230,440,240]);
    for(const [n,id] of [['Header (TMP)','cr.title'],['info','cr.info'],['X Button','cr.close'],['Answers/AdButton','cr.ad'],['Answers/HardCurrencyButton','cr.ruby']])map(c.transform.Find('SettingsPopup/'+n),id);
  }
  for(const p of all('UI_TimedLevelsPage')){
    const page=p.transform;
    // Positions stay local to each sliding page; ScrollSnapRect owns the page offset.
    // page origin = the panel's top-left (l.bg 150, 124)
    const group=page.Find('LevelsGroup');if(group){disable(group);rel(group,[0,0,980,380]);}
    rel(page.Find('Top Banner'),[130,16,720,50],28);
    // the title is plain text on the panel (wireframe 05)
    for(const n of ['Top Banner','Top Banner/LevelDifficultyBackground'])off(ctx,page.Find(n)?.gameObject.GetComponent('Image'));
    onFrame.push(()=>textStyle(page.Find('Top Banner/LevelDifficultyBackground/Difficulty (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'),28,true));
    rel(page.Find('Top Banner/LevelDifficultyBackground'),[0,0,720,50]);
    rel(page.Find('Top Banner/LevelDifficultyBackground/Difficulty (TMP)'),[0,0,720,50],28);
    hide(page.Find('Top Banner/Divider'));
    p.GetComponentsInChildren('UI_TimedLevelMode',true).forEach((entry,i)=>{
      const t=entry.transform;rel(t,[90+(i%2)*420,81+Math.floor(i/2)*66,380,56]);
      rel(t.Find('Level Name - TXT'),[16,8,140,40],17);rel(t.Find('Time - TXT'),[150,8,110,40],16);rel(t.Find('Stars Container'),[266,14,100,28]);
      onFrame.push(()=>{const n=t.Find('Level Name - TXT')?.gameObject.GetComponent('TextMeshProUGUI'),m=t.Find('Time - TXT')?.gameObject.GetComponent('TextMeshProUGUI');for(const [x,al] of [[n,1],[m,2]])if(x){x.m_margin=[0,0,0,0];x.horizontalAlignment=al;}});
      for(let k=1;k<=3;k++)rel(t.Find('Stars Container/Star - '+k),[4+(k-1)*31,0,26,26]);
      // The 3-star highlight lights the row's own chamfered frame; as a hexagon (its S_Button_Main sprite) it drew a
      // second, pointed outline around the row.
      for(const n of ['CompletionHighlight','PressedHighlight']){
        const h=t.Find(n),img=h?.gameObject.GetComponent('Image');if(!img)continue;
        // the pressed flash stays transparent until its feedback fades it in
        const a=img.color.a;rel(h,[0,0,380,56]);skin(img,'active','panel');img.color=color('#ffffff',a);
      }
      // The original stacks the three stars into one star that fills by thirds: stars 1 and 2 light up as pieces
      // (LevelBar_2, _3). Side by side (wireframe 05) every lit star shows the whole star (LevelBar_4).
      for(const k of [1,2]){
        const img=t.Find('Stars Container/Star - '+k)?.gameObject.GetComponent('Image');if(!img)continue;
        starPieces.add(img);
        ctx.onEveryFrame.push(()=>{const s=/LevelBar_[23]$/.test(img.sprite?.name||'')?UISprites.get(STAR_WHOLE):null;if(img._overrideSprite!==s)img.overrideSprite=s;});
      }
    });
    // Locked page (owner's request): only its title, the total and "Needs ★ n" as one line of plain text in the middle
    // (l.locked; the original stacks label, star and figure in a column over a glow). The rows are hidden and the fade
    // is clear, so the title reads at full strength.
    const fade=page.Find('LockedFade');rel(fade,[0,0,980,380]);off(ctx,fade?.gameObject.GetComponent('Image'));
    if(group && fade)ctx.onEveryFrame.push(()=>{
      const show=!fade.gameObject.activeSelf;
      if(group.gameObject.activeSelf!==show){group.gameObject.SetActive(show);lockedRows.add(group.gameObject);}
    });
    const lock=page.Find('LockedFade/Star Requirement Indicator - Large');rel(lock,[340,185,300,46]);
    const under=lock?.Find('Underlay');rel(under,[0,0,300,46]);off(ctx,under?.gameObject.GetComponent('Image'));
    rel(under?.Find('Need (TMP)'),[0,0,170,46],24);rel(under?.Find('Star'),[178,10,26,26]);rel(under?.Find('Requirement (TMP)'),[210,0,80,46],24);
    const need=under?.Find('Need (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'),req=under?.Find('Requirement (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    const lockStar=under?.Find('Star')?.gameObject.GetComponent('Image');
    onFrame.push(()=>{
      for(const [x,al] of [[need,4],[req,1]])if(x){textStyle(x,24,true);x.enableWordWrapping=false;x.horizontalAlignment=al;x.verticalAlignment=512;x.m_margin=[0,0,0,0];}
      if(lockStar)lockStar.preserveAspect=true;
    });
  }
  for(const c of all('ScrollSnapRect')){
    const panel=rects['l.bg'];
    frame(c.transform,panel);
    frame(c.viewPort,panel);
    if(!c.viewPort.gameObject.GetComponent('RectMask2D'))c.viewPort.gameObject.AddComponent(RectMask2D);
    // Keep native page scrolling and its anchors after converting the viewport.
    onFrame.push(()=>{const e=ctx.records.get(c.content);if(e)e.skip=true;});
    onFrame.push(()=>{
      const pageWidth=panel.w, content=c.content;
      content.anchorMin=content.anchorMax=new THREE.Vector2(0,1);content.pivot=new THREE.Vector2(0,1);content.sizeDelta=new THREE.Vector2(c.pageCount*pageWidth,panel.h);
      [...c.activeChildren()].forEach((p,i)=>{local(p,i*pageWidth,0,pageWidth,panel.h);});
      if(c._ui2W!==pageWidth){c._ui2W=pageWidth;c.OpenPage(Math.max(0,c.targetPage));}
    });
  }
  // Collection tab, world grids, and skin buttons keep their original selection handlers.
  // Garage tabs: icon-only plates, the selected one lit (wireframe 08), along the top of the collection frame
  const tabs=all('UI_MetaTabButton'),gt=rects['g.tabs'];tabs.forEach((t,i)=>{
    const x=gt.x+i*122,y=gt.y;
    frame(t.transform,[x,y,116,60]);frame(t.transform.Find('Icon'),[x+32,y+8,52,44]);frame(t.transform.Find('GameNotification'),[x+94,y-8,22,22]);
    const img=t.gameObject.GetComponent('Image');skin(img);
    const title=t.tabTitle?.transform||t.transform.Find('TabTitle (TMP)');
    ctx.onEveryFrame.push(()=>{if(img)img._ui2Active=!!t.isActive;if(UI2.landscape)title?.gameObject.SetActive(false);});
  });
  // the selected card's tiers / previews sit centred between the road and the collection frame (owner's markup)
  for(const skinCard of ctx.gos.filter(g=>/^UI_MetaCardSkin_/.test(g.name))){
    const i=Number(skinCard.name.split('_').pop())-1,r=rects['g.skins'],t=skinCard.transform;
    frame(t,[r.x+i*(r.w+8),r.y,r.w,r.h],15);
    // one chamfered shape for every slot (the plate and its mask), the picture in the middle, the count bar and the
    // "Preview" banner inside the slot; the selection shows as the lit plate
    const img=n=>t.Find(n)?.gameObject.GetComponent('Image');
    skin(skinCard.GetComponent('Image'),'panel','panel');skin(img('MaskGroup'),'panel','panel');off(ctx,img('MaskGroup/SelectedBorder'));
    const L=(path,rr,fs)=>{const c=t.Find(path);if(!c)return;remember(c);ctx.disable(c);local(c,...rr);if(fs){
      const text=c.gameObject.GetComponent('TextMeshProUGUI');textStyle(text,fs);
      if(text){text.enableAutoSizing=true;text.m_fontSizeMin=10;text.m_fontSizeMax=fs;text.horizontalAlignment=2;text.verticalAlignment=512;}
    }};
    ctx.onFrame.push(()=>{
      // the count bar runs along the slot's bottom edge, cut to its chamfered outline (band sprites); the picture's
      // opaque part is fitted, centred, above it (keepFitted)
      const W=r.w,H=r.h,bh=16;
      L('MaskGroup',[0,0,W,H]);L('MaskGroup/SelectedOverlay',[0,0,W,H]);
      L('MaskGroup/FillbarBackground',[3,H-bh-3,W-6,bh]);L('MaskGroup/FillbarBackground/Fillbar',[0,0,W-6,bh]);
      L('MaskGroup/FillbarBackground/TextShadow',[0,0,W-6,bh]);L('MaskGroup/FillbarBackground/CardAmount (TMP)',[0,0,W-6,bh],15);
      band(t,'MaskGroup/FillbarBackground','band_slot_bottom');band(t,'MaskGroup/FillbarBackground/Fillbar','band_slot_bottom');
      // "Preview" sits where the count bar is on the first slot
      L('MaskGroup/PreviewText',[3,H-bh-3,W-6,bh]);L('MaskGroup/PreviewText/PreviewText',[6,0,W-18,bh],15);
    });
    const icon=img('MaskGroup/Icon');if(icon)keepFitted(ctx,icon,()=>[14,5,r.w-28,r.h-25]);
    ctx.onEveryFrame.push(()=>{const p=skinCard.GetComponent('Image'),sel=t.Find('MaskGroup/SelectedOverlay')?.gameObject.activeSelf;if(p)p._ui2Active=!!sel;});
  }
  if(root.name==='UI_MetaGrid'){
    const group=root.GetComponent('GridLayoutGroup');
    if(group){group.m_CellSize=[110,123];group.m_Spacing=[10,10];group.m_Constraint=1;group.m_ConstraintCount=5;onFrame.push(()=>{group.m_Padding.m_Bottom=0;});}
  }
  // the collection lists one world at a time, so its "World n" divider is off (owner's request)
  if(root.name==='UI_MetaDividerBanner')onFrame.push(()=>hide(root.transform));
  if(root.name==='Main Menu'){
    const content=find('UI Container/BodyContainer/PageContainer/Meta Screen/SelectionContainer/MetaTab/ScrollView/Content');
    // The collection scrolls only over its cards: the content is as tall as their rows (5 per row, 123 + 10) and the
    // scroll view is clamped to it. Cards spawn over several frames, so the height follows them.
    const scroll=find('UI Container/BodyContainer/PageContainer/Meta Screen/SelectionContainer/MetaTab/ScrollView')?.gameObject.GetComponent('ScrollRect');
    if(scroll){ctx.disabled.set(scroll,scroll.enabled);scroll.movementType=2;}
    // the content's ContentSizeFitter would add the grid's bottom padding (UI_MetaTabBase.lastGridBottomPadding)
    const fitter=content?.gameObject.GetComponent('ContentSizeFitter');if(fitter){ctx.disabled.set(fitter,fitter.enabled);fitter.enabled=false;}
    let rows=-1;
    ctx.onEveryFrame.push(()=>{
      if(!content?.gameObject.activeInHierarchy)return;
      let n=0;const count=t=>{for(const ch of t.children){if(!ch.gameObject.activeSelf)continue;if(/^UI_MetaCard/.test(ch.name))n++;else count(ch);}};count(content);
      const r=Math.max(1,Math.ceil(n/5));if(r===rows)return;rows=r;
      content.anchorMin=new THREE.Vector2(0,1);content.anchorMax=new THREE.Vector2(1,1);content.pivot=new THREE.Vector2(.5,1);
      content.SetSizeWithCurrentAnchors(1,r*123+(r-1)*10+16);content.anchoredPosition=new THREE.Vector2(content.anchoredPosition.x,0);
    });
    const shopScroll=find('UI Container/BodyContainer/PageContainer/Shop Screen/Shop/Scroll View')?.gameObject.GetComponent('ScrollRect');
    if(shopScroll){ctx.disabled.set(shopScroll,shopScroll.enabled);shopScroll.enabled=false;}
    // Free Rewards track (owner's mockup): one bar over the four rewards, each step number centred under its reward
    for(const track of all('UI_RVRewardTrack')){
      const item=rects['sp.freeItem'],bar=rects['sp.freeBar'],pitch=(bar.w-item.w)/3;
      track.rewardEntries.forEach((entry,i)=>{
        const x=item.x+i*pitch;
        frame(entry.transform,[x,bar.y,i<3?pitch:item.w,bar.h]);
        frame(entry.RewardSocket,[x,item.y,item.w,item.h]);
        frame(entry.transform.Find('Indicator'),[x+item.w/2-20,item.y+item.h+6,40,28]);
        frame(entry.transform.Find('Indicator/Number (TMP)'),[x+item.w/2-20,item.y+item.h+6,40,28],15);
      });
    }
    // The section headers are the panels of the shop (owner's mockup): the title at the top left with its countdown
    // beside it, the section's items laid over the plate (the header draws first in its section).
    for(const e of [...ctx.records.values()])if(/^sp\..*H$/.test(e.id||'')){
      const {x,y}=e.r,timer=e.t.Find('TimerBanner'),title=e.t.Find('Text (TMP)'),chests=e.id==='sp.chestH';
      skin(e.t.gameObject.GetComponent('Image'),chests?'gold':'row');
      frame(title,chests?[x+20,y,110,e.r.h]:[x+20,y+10,200,26],18);frame(timer,[x+232,y+10,400,26]);frame(timer?.Find('Text (TMP)'),[x+232,y+10,400,26],15);
      off(ctx,timer?.gameObject.GetComponent('Image'));
      const texts=e.t.gameObject.GetComponentsInChildren('TextMeshProUGUI',true);
      onFrame.push(()=>{for(const t of texts){
        const head=t.transform.parent===e.t;textStyle(t,head?18:15,head,head?(chests?tokens.gold:tokens.secondary):tokens.secondary);
        t.enableWordWrapping=false;t.horizontalAlignment=1;t.verticalAlignment=512;t.m_margin=[0,0,0,0];
      }});
    }
    const explain=ctx.records.get(find('UI Container/BodyContainer/PageContainer/Shop Screen/Shop/Scroll View/Viewport/Scroll Content/RVTrackShopSection/Content/RV_Track/Explanation (TMP)'))?.t.gameObject.GetComponent('TextMeshProUGUI');
    if(explain)onFrame.push(()=>{explain.enableWordWrapping=false;explain.horizontalAlignment=4;explain.verticalAlignment=512;textStyle(explain,15,false,tokens.secondary);});
    // Refresh: a blue button with its label at the top right of the Daily Deals panel
    const refresh=ctx.records.get(find('UI Container/BodyContainer/PageContainer/Shop Screen/Shop/Scroll View/Viewport/Scroll Content/DailyDealsShopSection/Content/RefreshButton'));
    if(refresh){
      const {x,y,w,h}=refresh.r;skin(refresh.t.gameObject.GetComponent('Image'),'blue');hide(refresh.t.Find('Icon'));
      const label=refresh.t.Find('Text (TMP)');frame(label,[x,y,w,h],16);
      const text=label?.gameObject.GetComponent('TextMeshProUGUI');if(text)onFrame.push(()=>{text.enableWordWrapping=false;text.horizontalAlignment=2;text.verticalAlignment=512;});
    }
    // Shop page: the dimmed Home mountain plate replaces the grey page art; decorative sweeps and bottom fades are off.
    // the UI2 rank star carries its own glow
    off(ctx,find('UI Container/TopContainer/TopBar/Left/StarRankBar-OpenRewardTrack/Icon/Shadow')?.gameObject.GetComponent('Image'));
    const meta=find('UI Container/BodyContainer/PageContainer/Meta Screen');
    if(meta){
      for(const n of ['Overlay','Overlay/Fade','SelectionContainer/DividerTop','SelectionContainer/TabButtons','SelectionContainer/MetaTab','SelectionContainer/MetaTab/ScrollView'])off(ctx,meta.Find(n)?.gameObject.GetComponent('Image'));
      // one frame behind the tabs and one row of the collection, centred above the tab bar (owner's markups: from the
      // top, the vehicle's name, the road with the vehicle, its tiers, this frame)
      const sel=meta.Find('SelectionContainer');frame(sel,[325,360,630,226]);
      const plate=sel?.gameObject.GetComponent('Image')||sel?.gameObject.AddComponent(Image);if(plate){plate.raycastTarget=false;skin(plate,'row');}
    }
    const shop=find('UI Container/BodyContainer/PageContainer/Shop Screen');
    const backdrop=ctx.records.get(shop?.Find('Background'));
    if(backdrop)backdrop.r=asRect([-320,-180,1920,1080]);
    if(shop)walk(shop,t=>{if(['Shine','Overlay','Fade'].includes(t.name) && (t.name!=='Overlay' || t.parent===shop))off(ctx,t.gameObject.GetComponent('Image'));});
    // Free Rewards panel: a thin line between the track and the small chest (owner's mockup)
    const freeH=ctx.records.get(find('UI Container/BodyContainer/PageContainer/Shop Screen/Shop/Scroll View/Viewport/Scroll Content/RVTrackShopSection/Header'));
    if(freeH && !freeH.t.Find('UI2 Divider')){
      const go=new GameObject('UI2 Divider',RectTransform);go._ui2Added=true;go.transform.SetParent(freeH.t,false);
      const img=go.AddComponent(Image);img.raycastTarget=false;img.color=color(tokens.muted);awakeObject(go);ctx.gos.push(go);
      const c=rects['sp.chest'];frame(go.transform,[c.x-18,c.y,2,c.h]);
    }
  }
  // vehicle, colour and effect cards share the layout
  if(/^UI_MetaCard(Color| - FX)?$/.test(root.name)){
    // GridLayoutGroup controls the card itself; its internals get a fixed 110 x 123 layout (owner's markups): the name on
    // top, the picture, then the count bar, all clear of the card's cut corners. Texts shrink (down to 10) to stay inside.
    const L=(path,r,fs)=>{const t=root.transform.Find(path);if(!t)return;remember(t);ctx.disable(t);local(t,...r);if(fs){
      const text=t.gameObject.GetComponent('TextMeshProUGUI');textStyle(text,fs);
      if(text){text.enableAutoSizing=true;text.m_fontSizeMin=10;text.m_fontSizeMax=fs;text.horizontalAlignment=2;text.verticalAlignment=512;}
    }};
    onFrame.push(()=>{
      const W=root.transform.rect.width,H=root.transform.rect.height,bw=W-6;
      fitChildren(root.transform,W,H,new Map(),ctx);
      // name band on the top edge, count bar / unlock band on the bottom edge, all cut to the card's chamfered outline
      // (band sprites); the picture is centred between them
      L('MaskGroup/NameObject',[3,3,bw,22]);L('MaskGroup/NameObject/NameText',[10,0,bw-20,22],15);
      L('MaskGroup/FillbarBackground',[3,H-19,bw,16]);L('MaskGroup/FillbarBackground/Fillbar',[0,0,bw,16]);
      L('MaskGroup/FillbarBackground/TextShadow',[0,0,bw,16]);L('MaskGroup/FillbarBackground/CardAmount (TMP)',[0,0,bw,16],15);
      L('MaskGroup/UnlocksAt',[3,H-39,bw,36]);L('MaskGroup/UnlocksAt/UnlocksAtText',[10,0,bw-20,36],15);
      L('GameNotification',[W-17,-5,22,22]);
      band(root.transform,'MaskGroup/NameObject','band_card_top');band(root.transform,'MaskGroup/UnlocksAt','band_card_unlock');
      band(root.transform,'MaskGroup/FillbarBackground','band_card_bottom');band(root.transform,'MaskGroup/FillbarBackground/Fillbar','band_card_bottom');
    });
    const icon=root.transform.Find('MaskGroup/Icon')?.gameObject.GetComponent('Image');
    // locked cards still show their picture (owner's request): dimmed grey under a lighter overlay, not a silhouette
    const card=root.components.find(c=>c.Card!==undefined && 'lockedOverlay' in c);
    const overlay=card?.lockedOverlay;
    if(card)ctx.onEveryFrame.push(()=>{
      const locked=card.Card?.IsLocked;if(!locked)return;
      const icon=card.icon;if(icon && !icon.color.equals(color('#8c8aa0')))icon.color=color('#8c8aa0');
      if(overlay && Math.abs(overlay.color.a-.35)>.01)overlay.color=overlay.color.withAlpha(.35);
    });
    // the grid cell is 110 x 123 (UI_MetaGrid); the card's own rect is not settled on its first frames
    if(icon)keepFitted(ctx,icon,()=>[16,30,78,64]);
  }
  for(const track of all('UI_RewardTrack')){
    modal(ctx,track.transform,'Reward Track');
    const content=track.transform.Find('Container/Scroll View/Viewport/Content');
    onFrame.push(()=>{const e=ctx.records.get(content);if(e)e.skip=true;});
    const viewport=track.transform.Find('Container/Scroll View/Viewport');
    if(viewport && !viewport.gameObject.GetComponent('RectMask2D'))viewport.gameObject.AddComponent(RectMask2D);
    // A popup like Progress (owner's mockup): a panel (r.bg) with STAR RANK on the left of its header and the rank bar
    // on the right, the rewards a 3-column grid of cards under it. The header band of the old art is off; the
    // container's mask (as wide as the design canvas) keeps masking but no longer draws its black rectangle.
    off(ctx,track.transform.Find('TopBar')?.gameObject.GetComponent('Image'));
    frame(track.transform.Find('TopBar'),{...rects['r.bg'],h:80});
    const backdrop=track.transform.Find('Container/Background'),panelImg=backdrop?.gameObject.GetComponent('Image');
    frame(backdrop,rects['r.bg']);skin(panelImg);onFrame.push(()=>{if(panelImg)panelImg.color=color(tokens.panel,.93);});
    const containerMask=track.transform.Find('Container')?.gameObject.GetComponent('Mask');
    if(containerMask)containerMask.showMaskGraphic=false;
    const title=track.transform.Find('TopBar/Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    // the title is centred and the rank stars + star bar are off (owner's request: Home shows the same bar)
    if(title)onFrame.push(()=>{title.horizontalAlignment=2;});
    hide(track.transform.Find('TopBar/StarCurrencyBar/FillbarBackground'));
    hide(track.transform.Find('TopBar/StarCurrencyBar/Icon'));hide(track.transform.Find('TopBar/StarCurrencyBar/Icon - Next Level'));
    for(const n of ['TopBar/StarCurrencyBar/Shadow','TopBar/StarCurrencyBar/Icon/Shadow','TopBar/StarCurrencyBar/Icon - Next Level/Shadow','TopBar/Shadow Top','TopBar/Divider','Overlay','Overlay/Shadow Bottom'])off(ctx,track.transform.Find(n)?.gameObject.GetComponent('Image'));
    skin(track.transform.Find('TopBar/StarCurrencyBar/FillbarBackground')?.gameObject.GetComponent('Image'),'panel','pill');
    // the star progress fills the inside of the bar with the bar's pointed ends, as the Home star bar (r.fill is the
    // same 335 x 34; star_fill is drawn for it); a tinted square stuck out of the bar's left tip
    const rf=rects['r.fill'],fill=track.transform.Find('TopBar/StarCurrencyBar/FillbarBackground/Fillbar');
    rel(fill,[6,5,rf.w-12,rf.h-10]);
    const fillImage=fill?.gameObject.GetComponent('Image');
    if(fillImage){themeSprite(fillImage,'star_fill');onFrame.push(()=>{fillImage.color=color('#ffffff');});}
    // The entries keep their order (the original VerticalLayoutGroup is off) in a grid: 3 columns of 344 x 84 cards,
    // 16 apart, room under the last row for its badges (TRACK_CARD). Each card is centred on its position, so
    // ScrollToRank / GetVerticalPositionInScreen scroll to the target's row.
    const CARD=TRACK_CARD,gridW=CARD.cols*CARD.w+(CARD.cols-1)*CARD.gap;
    ctx.onEveryFrame.push(()=>{
      if(!content || !UI2.landscape)return;
      content.anchorMin=content.anchorMax=new THREE.Vector2(0,1);content.pivot=new THREE.Vector2(0,1);
      let i=0;
      for(const ch of content.children){
        if(!ch.gameObject.activeSelf || ch.name==='NextRewardHighlight' || !ch.isRectTransform)continue;
        // the spacer row (created with the list, the target of rank 0) is an empty line on top of the grid
        const empty=/Empty Banner/.test(ch.name);
        if(empty)off(ctx,ch.gameObject.GetComponent('Image'));
        const [x,y,w,h]=empty?[gridW/2,0,gridW,0]:[(i%CARD.cols)*(CARD.w+CARD.gap)+CARD.w/2,-(CARD.top+Math.floor(i/CARD.cols)*(CARD.h+CARD.gap)+CARD.h/2),CARD.w,CARD.h];
        if(!empty)i++;
        if(ch.sizeDelta.x!==w || ch.sizeDelta.y!==h || ch.anchoredPosition.x!==x || ch.anchoredPosition.y!==y || ch.anchorMin.x!==0){
          ch.anchorMin=ch.anchorMax=new THREE.Vector2(0,1);ch.pivot=new THREE.Vector2(.5,.5);
          ch.anchoredPosition=new THREE.Vector2(x,y);ch.sizeDelta=new THREE.Vector2(w,h);ch.localScale=new THREE.Vector3(1,1,1);
        }
      }
      const height=CARD.top+Math.ceil(i/CARD.cols)*(CARD.h+CARD.gap)-CARD.gap+CARD.bottom;
      if(content.sizeDelta.x!==gridW || content.sizeDelta.y!==height)content.sizeDelta=new THREE.Vector2(gridW,height);
    });
    // the next reward is shown by its own row lighting up (below) instead of the portrait glow band
    for(const n of ['Glow - Bottom','Divider - Bottom'])off(ctx,content?.Find('NextRewardHighlight/'+n)?.gameObject.GetComponent('Image'));
    hide(track.transform.Find('TopBar/SoftCurencyBar'));hide(track.transform.Find('TopBar/HardCurrencyBar'));
    // The grid's scrollbar on the right (r.scroll, owner's request), landscape only: the thumb is as tall as the share
    // of the list in view (36 at least) and shown only while the list is longer than the view.
    const sv=track.transform.Find('Container/Scroll View')?.gameObject.GetComponent('ScrollRect'),sr=rects['r.scroll'];
    if(sv && !track.transform.Find('UI2 Scrollbar')){
      const bar=new GameObject('UI2 Scrollbar',RectTransform);bar._ui2Added=true;bar.transform.SetParent(track.transform,false);
      const barImg=bar.AddComponent(Image);awakeObject(bar);ctx.gos.push(bar);frame(bar.transform,sr);
      const thumb=new GameObject('Thumb',RectTransform);thumb.transform.SetParent(bar.transform,false);
      const thumbImg=thumb.AddComponent(Image);thumbImg.raycastTarget=false;awakeObject(thumb);
      for(const [img,name] of [[barImg,'scroll_track'],[thumbImg,'scroll_thumb']]){themeSprite(img,name);img.type=1;img.pixelsPerUnitMultiplier=2;}
      const ctl=bar.AddComponent(UI2Scrollbar);ctl.scroll=sv;
      // the 8-wide track takes the pointer over 32 (owner: it was hard to catch with the mouse)
      barImg.m_RaycastPadding=[-10,0,-14,0];
      // apply() fits the bar's child to the bar: place the thumb again after it
      let shown='';onFrame.push(()=>{shown='';});
      ctx.onEveryFrame.push(()=>{
        const view=sv.viewport?.rect.height||1,list=sv.content?.rect.height||1,on=list>view+1;
        if(barImg.enabled!==on){barImg.enabled=on;thumbImg.enabled=on;}
        if(!on)return;
        const a=ctl.hot?1:.75;if(thumbImg.color.a!==a)thumbImg.color=color('#ffffff',a);
        const h=Math.max(36,Math.min(sr.h,sr.h*view/list)),y=(1-sv.verticalNormalizedPosition)*(sr.h-h);ctl.thumbH=h;
        const key=Math.round(h)+':'+Math.round(y);if(key===shown)return;shown=key;
        local(thumb.transform,0,y,sr.w,h);
      });
    }
  }
  for(const entry of all('UI_RewardTrackEntry')){
    const t=entry.transform;
    // A 344 x 84 card (owner's mockup): rank star, picture, name over type, the currency (icon then amount) on the right,
    // and on the bottom-right corner one neon disc (owner's request): a lock while locked, a green ✓ once claimed.
    for(const [n,r] of [['Rank',[10,16,52,52]],['RewardBox',[72,14,56,56]],['Lock',[314,60,36,36]],['RewardDescription',[138,14,128,56]]])rel(t.Find(n),r);
    for(const item of t.Find('RewardBox')?.children||[]){
      // the currency sits right of the description (RewardBox-relative: card x 268)
      if(/Reward - Item - Currency/.test(item.name)){
        rel(item,[196,12,70,32]);rel(item.Find('Icon'),[0,8,14,16]);rel(item.Find('Text (TMP)'),[18,0,52,32],17);
        const amount=item.Find('Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
        if(amount)onFrame.push(()=>{amount.enableWordWrapping=false;amount.horizontalAlignment=1;amount.verticalAlignment=512;amount.m_margin=[0,0,0,0];});
      }
      // a level card's stopwatch (260 px wide original, centred left of the row) sits in the picture slot
      if(/Reward - Item - Levels/.test(item.name))rel(item,[0,2,56,52]);
    }
    // the next reward shows by its card lighting up; its label has no room on a card
    off(ctx,t.Find('RewardDescription/NextReward (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'));
    rel(t.Find('RewardDescription/NextReward (TMP)'),[0,0,128,1],15);
    rel(t.Find('RewardDescription/RewardName (TMP)'),[0,4,128,24],17);
    rel(t.Find('RewardDescription/RewardDescription (TMP)'),[0,30,128,20],15);
    for(const n of ['RewardName (TMP)','RewardDescription (TMP)']){
      const x=t.Find('RewardDescription/'+n)?.gameObject.GetComponent('TextMeshProUGUI');
      if(x)onFrame.push(()=>{x.enableWordWrapping=false;x.horizontalAlignment=1;x.m_margin=[0,0,0,0];});
    }
    // two-digit ranks broke into a column in the 52 px star
    const rankNo=t.Find('Rank/RankNumber (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
    if(rankNo)onFrame.push(()=>{rankNo.enableWordWrapping=false;rankNo.m_margin=[0,0,0,0];});
    // the vertical progress line, row dividers and shine sweeps of the portrait track are off; the glow stays in the row
    for(const n of ['Fillbar','Divider - Top','Divider - Bottom','ClaimedOverlay/Shine','Rank/Shadow'])off(ctx,t.Find(n)?.gameObject.GetComponent('Image'));
    // The row's glow, a level row's world banner and the next-reward shine / flash are rectangles: they are cut to the
    // row's chamfer, 3 px inside it so the neon rim stays on top (rectangular corners poked past the chamfer, and an
    // inset rectangle left a hard edge before the rim).
    const holder=t.Find('Background Container'),highlight=t.Find('NextRewardHighlight');
    rel(holder,[3,3,338,78]);rel(t.Find('Background Container/Glow'),[0,0,338,78]);chamferHolder(ctx,holder,14);
    rel(highlight,[3,3,338,78]);chamferHolder(ctx,highlight,14);
    // the next reward lights the row's own frame (active kind, below); the original magenta block covered the rim
    off(ctx,t.Find('NextRewardHighlight/BrighterBackground')?.gameObject.GetComponent('Image'));
    // A level card's world banner (1024 x 256, kept 4:1) fills the card and is cut by its mask, as the original's
    // aspect fitter did; drawn with its aspect kept it was a small dark patch in the middle.
    const banner=t.Find('Background Container/Banner Image');
    if(banner){
      rel(banner,[-10,-6,358,90]);
      const img=banner.gameObject.GetComponent('Image');if(img)onFrame.push(()=>{img.preserveAspect=false;});
    }
    // The corner discs (tools/ui2-art.mjs): the lock Image draws badge_locked, the claimed overlay's own plate draws
    // badge_claimed (its ✓ glyph and "Claimed" label are off; the disc carries the tick)
    const claimed=t.Find('ClaimedOverlay'),badge=claimed?.gameObject.GetComponent('Image'),lockImg=t.Find('Lock')?.gameObject.GetComponent('Image');
    rel(claimed,[314,60,36,36]);rel(t.Find('ClaimedOverlay/CheckMark'),[0,0,36,36]);rel(t.Find('ClaimedOverlay/Claimed (TMP)'),[0,0,36,36],15);
    off(ctx,t.Find('ClaimedOverlay/Claimed (TMP)')?.gameObject.GetComponent('TextMeshProUGUI'));
    off(ctx,t.Find('ClaimedOverlay/CheckMark')?.gameObject.GetComponent('Image'));
    // the plate was a translucent dark block: the disc starts opaque, then keeps the alpha its feedbacks give it
    if(badge)badge.color=color('#ffffff');
    onFrame.push(()=>{
      for(const [img,name] of [[badge,'badge_claimed'],[lockImg,'badge_locked']])if(img){
        img._ui2Skin=null;img.getDrawCalls=undefined;themeSprite(img,name);img.type=0;img.preserveAspect=true;img.color=color('#ffffff',img.color.a);
      }
    });
    const plate=t.gameObject.GetComponent('Image');skin(plate,'row');
    const next=t.Find('RewardDescription/NextReward (TMP)');
    ctx.onEveryFrame.push(()=>{if(plate)plate._ui2Active=!!next?.gameObject.activeInHierarchy;});
    onFrame.push(()=>fitChildren(t,TRACK_CARD.w,TRACK_CARD.h,new Map(ctx.relative.map(e=>[e.t,e])),ctx));
  }
  const pref=root._prefabId||'';
  // Home challenge progress (owner's markup, 2026-10-29): a row plate under the currency pills (h.chpop) with the
  // challenge over its bar and the reward on the right, instead of a band across the lower right of the podium. It
  // fades in and out in place: the original's 50-unit rise ran into the pills.
  if(/ChallengeSlotReadOnlyPopup/.test(pref)){
    const t=root.transform,W=rects['h.chpop'].w,H=rects['h.chpop'].h,R=52;
    rel(t,[0,0,W,H]);
    const plate=t.gameObject.GetComponent('Image')||t.gameObject.AddComponent(Image);plate.raycastTarget=false;skin(plate,'row');
    off(ctx,t.Find('Gradient')?.gameObject.GetComponent('Image'));
    // text and bar share one left edge and stop before the reward column
    const tw=W-16-R-18;
    rel(t.Find('ChallengeText (TMP)'),[16,7,tw,20],15);
    rel(t.Find('FillBarMask'),[16,33,tw,5]);
    rel(t.Find('HardChallenge Icon'),[W-R-14-28,13,24,24]);
    // the reward (one star or a cluster) fitted by its opaque part into the right column; the original reward box is
    // 93 x 16 here, which shrank it to a dot
    rel(t.Find('RewardContainer'),[W-R-10,6,R,38]);rel(t.Find('RewardContainer/ChallengeSlotReward'),[0,0,R,38]);
    const reward=t.Find('RewardContainer/ChallengeSlotReward/Icon')?.gameObject.GetComponent('Image');
    if(reward)keepFitted(ctx,reward,()=>[9,5,R-18,28]);
    for(const f of t.gameObject.GetComponents('MMFeedbackPosition'))f.Active=0;
    onFrame.push(()=>{
      const text=t.Find('ChallengeText (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
      if(text){text.enableWordWrapping=false;text.horizontalAlignment=1;text.verticalAlignment=512;}
      // a plain bar: the original mask is a slanted 9-slice (S_Challenge_Fillbar), a wedge at this height
      const mask=t.Find('FillBarMask')?.gameObject.GetComponent('Image');if(mask){mask.sprite=null;mask.type=0;mask.color=color(barTrack());}
      const track=t.Find('FillBarMask/BackgroundBar')?.gameObject.GetComponent('Image');if(track){track.sprite=null;track.color=color(barTrack());}
      const fill=t.Find('FillBarMask/BackgroundBar/BarFiller')?.gameObject.GetComponent('Image');if(fill)fill.color=color(barFill());
      const hard=t.Find('HardChallenge Icon')?.gameObject.GetComponent('Image');if(hard)hard.preserveAspect=true;
    });
    // a hard challenge's icon takes room from the text
    ctx.onEveryFrame.push(()=>{
      const hard=t.Find('HardChallenge Icon'),text=t.Find('ChallengeText (TMP)');
      if(!hard||!text)return;const w=hard.gameObject.activeSelf?tw-34:tw;if(Math.abs(text.sizeDelta.x-w)>.5)local(text,16,7,w,20);
    });
  }
  if(/ShopConfirmation/.test(pref)){
    modal(ctx,root.transform,'Shop confirmation');
    frame(root.transform.Find('Popup'),[40,460,1200,230]);
    skin(root.transform.Find('Popup')?.gameObject.GetComponent('Image'));
    for(const [names,id] of [[['Item icon'],'sc.icon'],[['Title','Title (TMP)'],'sc.title'],[['Rarity','Rarity (TMP)'],'sc.rarity'],[['Info Container'],'sc.info'],[['BuyButton'],'sc.buy'],[['CloseButton'],'sc.close']])for(const n of names)for(const t of named(n))map(t,id);
  }
  if(/DailyDealShopRefreshPopUp/.test(pref)){
    modal(ctx,root.transform,'Refresh');frame(root.transform.Find('SettingsPopup'),[410,126,460,220]);
    for(const [n,id] of [['Header (TMP)','sr.title'],['RefreshCount','sr.count'],['info','sr.info'],['AdButton','sr.ad']])for(const t of named(n))map(t,id);
    // The original ruby alternative and cancel button remain available inside the approved popup panel.
    frame(root.transform.Find('SettingsPopup/Answers/HardCurrencyButton'),[740,276,100,50],18);
    frame(root.transform.Find('SettingsPopup/X Button'),[826,108,52,46]);
  }
  if(/RankupPopup/.test(pref)){
    const canvas=root.GetComponent('Canvas')||root.AddComponent(Canvas);
    canvas.overrideSorting=true;canvas.sortingOrder=107;
    if(!root.GetComponent('GraphicRaycaster'))root.AddComponent(GraphicRaycaster);
    for(const [n,id] of [['Background','ru.bg'],['RankUp (TMP)','ru.title'],['LevelBaseStar','ru.star'],['TapToContinue (TMP)','ru.tap']])for(const t of named(n))map(t,id);
    map(find('Container/DoubleReward RV/Button'),'ru.rv');
    skin(find('Container/DoubleReward RV/Button')?.gameObject.GetComponent('Image'),'gold');
  }
  if(/RankUpReward_/.test(pref)){
    // the rewards of one rank sit side by side, centred under the star (wireframe 12)
    frame(root.transform,rects['ru.reward']);
    // a cosmetic's name and type each get a line under the picture (scaled down they shared one 25 px band)
    const front=root.transform.Find('Back/CardFront');
    if(front){
      rel(front.Find('Icon'),[20,6,200,62]);rel(front.Find('TextUnderlay'),[2,70,236,38]);
      rel(front.Find('TextUnderlay/Name (TMP)'),[0,1,236,18],15);rel(front.Find('TextUnderlay/Type (TMP)'),[0,19,236,17],15);
    }
    ctx.onEveryFrame.push(()=>{
      const rec=ctx.records.get(root.transform),p=root.transform.parent;if(!rec || !p)return;
      const row=p.children.filter(c=>/^RankUpReward_/.test(c.name) && c.gameObject.activeSelf),i=row.indexOf(root.transform),w=rects['ru.reward'].w,gap=20;
      const x=640-(row.length*w+(row.length-1)*gap)/2+Math.max(0,i)*(w+gap);
      if(rec.r.x!==x){rec.r={...rects['ru.reward'],x};place(root.transform,rec.r);}
    });
  }
  // Shop items (owner's mockup): the small chest sits at the right of the Free Rewards panel, the large one fills the
  // Chests panel, the daily deals are three wide cards. Each prefab keeps its own purchase and payment components.
  for(const type of ['LootboxShopItem','DailyDealShopItem']){
    const item=root.GetComponent(type),ui=root.GetComponent('ShopItemUI');if(!item || !ui)continue;
    const siblings=root.transform.parent?.children.filter(t=>t.gameObject.GetComponent(type))||[root.transform];
    const i=Math.max(0,siblings.indexOf(root.transform));
    const tf=(t,r,fs,al=1)=>{
      frame(t,r,fs);const text=t?.gameObject.GetComponent('TextMeshProUGUI');
      if(text)onFrame.push(()=>{text.enableWordWrapping=false;text.horizontalAlignment=al;text.verticalAlignment=512;text.m_margin=[0,0,0,0];});
    };
    const sticker=ui.stickerImage?.transform||root.transform.Find('Sticker');
    // the sticker keeps only its text (a subtitle); its banner and mask plate are not drawn
    for(const img of [sticker?.gameObject.GetComponent('Image'),sticker?.Find('Mask')?.gameObject.GetComponent('Image')])if(img){img.raycastTarget=false;img.getDrawCalls=()=>[];}
    walk(root.transform,t=>{if(t.name==='Shine')off(ctx,t.gameObject.GetComponent('Image'));});
    if(ui.contentImage)ui.contentImage.preserveAspect=true;
    const buy=ui.purchaseButton?.transform===root.transform?root.transform.Find('BuyButton'):ui.purchaseButton?.transform;
    const overlay=ui.backgroundImage?.transform.Find('ItemOverlay')?.gameObject.GetComponent('Image');
    if(type==='DailyDealShopItem'){
      const c=rects['sp.deal'],x=c.x+i*(c.w+15),y=c.y,w=c.w,h=c.h;
      frame(root.transform,[x,y,w,h]);
      frame(ui.backgroundImage?.transform,[x,y,w,h]);skin(ui.backgroundImage);
      frame(ui.metaCard?.transform,[x+12,y+10,80,88],15);
      frame(ui.contentImage?.transform,[x+16,y+16,72,76]);
      tf(ui.headerText?.transform,[x+104,y+22,w-236,28],c.fs);
      tf(ui.rarityText?.transform,[x+104,y+56,w-236,22],15);
      // the price is plain text at the card's right (no button plate)
      frame(buy,[x+w-124,y+30,108,48]);off(ctx,buy?.gameObject.GetComponent('Image'));tf(ui.purchaseText?.transform,[x+w-124,y+30,108,48],c.fs,4);
      frame(sticker,[x+104,y-10,w-208,20]);tf(ui.stickerText?.transform,[x+104,y-10,w-208,20],15,2);
      frame(root.transform.Find('GameNotification'),[x+w-19,y-5,22,22]);
      off(ctx,overlay);
    }else if(/Large/.test(root.name) || i>0){
      const {x,y,w,h}=rects['sp.chestL'];
      frame(root.transform,[x,y,w,h]);
      // the gold plate is the Chests panel (its header): the item's own background only catches the clicks
      frame(ui.backgroundImage?.transform,[x,y,w,h]);if(ui.backgroundImage)ui.backgroundImage.getDrawCalls=()=>[];
      frame(overlay?.transform,[x+20,y+4,84,84]);skin(overlay,'gold');
      frame(ui.contentImage?.transform,[x+26,y+10,72,72]);
      tf(ui.headerText?.transform,[x+124,y+18,520,48],rects['sp.chestL'].fs);
      tf(ui.rarityText?.transform,[x+124,y+62,520,22],15);
      frame(sticker,[x+124,y+62,520,22]);tf(ui.stickerText?.transform,[x+124,y+62,520,22],15);
      frame(buy,[x+w-150,y+22,130,48]);skin(buy?.gameObject.GetComponent('Image'),'gold');tf(ui.purchaseText?.transform,[x+w-150,y+22,130,48],18,2);
      frame(root.transform.Find('GameNotification'),[x+w-31,y+12,22,22]);
    }else{
      const {x,y,w,h}=rects['sp.chest'];
      frame(root.transform,[x,y,w,h]);
      // the item's background is the picture's frame, the title and the claim button sit at its right
      frame(ui.backgroundImage?.transform,[x+2,y+4,88,88]);skin(ui.backgroundImage);
      frame(ui.contentImage?.transform,[x+10,y+12,72,72]);
      tf(ui.headerText?.transform,[x+106,y+8,w-140,28],rects['sp.chest'].fs);
      tf(ui.rarityText?.transform,[x+106,y+8,w-140,28],15,4);
      frame(sticker,[x+106,y+8,w-140,28]);tf(ui.stickerText?.transform,[x+106,y+8,w-140,28],15,4);
      frame(buy,[x+106,y+44,w-110,48]);skin(buy?.gameObject.GetComponent('Image'),'blue');tf(ui.purchaseText?.transform,[x+106,y+44,w-110,48],17,2);
      frame(root.transform.Find('GameNotification'),[x+w-26,y+10,22,22]);
      off(ctx,overlay);
    }
    for(const img of root.GetComponentsInChildren('Image',true))if(img._ui2Skin)img._ui2Skin.shape='panel';
    break;
  }
  for(const reward of all('UI_RVRewardTrackReward')){
    rel(reward.transform,[0,0,rects['sp.freeItem'].w,rects['sp.freeItem'].h],15);
    // the wide cells would stretch the reward pictures
    for(const img of reward.GetComponentsInChildren('Image',true))if(!img._ui2Skin)img.preserveAspect=true;
  }
  for(const lx of all('UI_LootboxOpenAnimation')){
    // above the menu popups (a challenge overlay may open under a queued lootbox), below the tutorial "tap to open"
    const lc=lx.gameObject.GetComponent('Canvas')||lx.gameObject.AddComponent(Canvas);lc.overrideSorting=true;lc.sortingOrder=106;
    if(!lx.gameObject.GetComponent('GraphicRaycaster'))lx.gameObject.AddComponent(GraphicRaycaster);
    // RenderTextureLootbox stays full screen: its render target is screen sized and maps the 3D chest 1:1
    for(const [n,id] of [['Background','lx.bg'],['CardsLeft','lx.left'],['LootboxVisuals','lx.tap'],['CollectionGrid','lx.overview'],['CardBase','lx.card'],['LoseButton','lx.lose'],['RVButton','lx.rv'],['ClaimButton','lx.claim']])for(const t of named(n))map(t,id);
    frame(lx.transform.Find('LootboxCollectionOverview/CollectionOverviewContainer'),rects['lx.overview']);
    // The original fade dims the chest under the reward cards (bottom 69% of the screen). Framed into the overview box it
    // covered the cards, so it spans the screen again and draws under the grid: the chest dims, the cards stay lit.
    const fade=lx.transform.Find('LootboxCollectionOverview/CollectionOverviewContainer/GradientBottom');
    if(fade){frame(fade,{x:0,y:0,w:1280,h:720,anchor:'canvas'});fade.SetAsFirstSibling();}
    const grid=lx.transform.Find('LootboxCollectionOverview/CollectionOverviewContainer/CollectionGrid');
    const gl=grid?.gameObject.GetComponent('CenteredGridLayoutGroup');
    if(gl)onFrame.push(()=>{ctx.disabled.delete(gl);gl.enabled=true;gl.m_CellSize=[187,234];gl.m_Spacing=[10,10];gl.m_Constraint=1;gl.m_ConstraintCount=4;gl.m_ChildAlignment=0;});
    // Owner's request: once the first card comes out, the chest slides up and left so the chest and the card stand side
    // by side in the middle of the screen (the card at lx.card, the cards-left count and the ad buttons by the chest).
    // The whole render texture moves, so the chest keeps its 1:1 mapping.
    const rt=lx.transform.Find('RenderTextureLootbox'),cards=lx.transform.Find('CardContainer');
    if(rt){
      const base=remember(rt).pos;let k=0,out=false;
      ctx.onEveryFrame.push(()=>{
        out||=!!cards?.children.some(c=>c.gameObject.activeSelf);
        if(!out || k===1)return;
        k=Math.min(1,k+(1-k)*.15+.002);
        rt.anchoredPosition=new THREE.Vector2(base.x-230*k,base.y+80*k);
      });
    }
  }
  for(const card of all('UI_CardBase')){
    if(card.transform.parent?.name==='CollectionGrid')onFrame.push(()=>fitChildren(card.transform,187,234,new Map(),ctx));
    else if(card.GetComponentInParent('UI_LootboxOpenAnimation')){
      map(card.transform,'lx.card');
      // the "Quality Increased / rarity" banner of an upgraded card: a band just above the card (it sat above the screen)
      const c=rects['lx.card'],banner=card.transform.Find('Upgrade Banner');
      frame(banner,[c.x-20,c.y-104,c.w+40,54]);
      frame(banner?.Find('Quality (TMP)'),[c.x-20,c.y-102,c.w+40,20],15);frame(banner?.Find('Rarity (TMP)'),[c.x-20,c.y-82,c.w+40,30],22);
      const texts=banner?.gameObject.GetComponentsInChildren('TextMeshProUGUI',true)||[];
      onFrame.push(()=>{for(const t of texts){t.enableWordWrapping=false;t.horizontalAlignment=2;t.verticalAlignment=512;t.m_margin=[0,0,0,0];}});
    }
  }
  if(root.name==='TutorialUtility')onFrame.push(()=>{
    const tap=find('TutorialCanvas/UI Container/TutorialText/TapToContinue');
    const text=tap?.gameObject.GetComponent('TextMeshProUGUI');
    const e=ctx.records.get(tap);
    if(e){const id=text?.text===Meta.data.loc['UI/Shop/Lootbox/TapToOpen']?'lx.tap':'tu.tap';e.id=id;e.r=rects[id];place(tap,e.r);textStyle(text,id==='lx.tap'?22:15,id==='lx.tap');}
  });
  for(const rv of all('UI_Revive')){
    modal(ctx,rv.transform,'Revive');
    frame(rv.transform.Find('Popup'),[490,130,300,330]);
    skin(rv.transform.Find('Popup')?.gameObject.GetComponent('Image'));
    for(const [n,id] of [['HardCurrencyBar','rv.rubybar'],['Skip Button','rv.skip'],['Revive Timer','rv.timer'],['Revive Test (TMP)','rv.title'],['Ad Button','rv.ad'],['HardCurrency Button','rv.ruby'],['TriggerBox','rv.trigger']])for(const t of named(n))map(t,id);
    // chamfered action buttons and a pill ruby counter (wireframe 18)
    for(const [n,kind,shape] of [['Ad Button','gold','panel'],['HardCurrency Button','panel','panel'],['HardCurrencyBar','panel','pill']])for(const t of named(n))skin(t.gameObject.GetComponent('Image'),kind,shape);
    const rb=rects['rv.rubybar'];for(const t of named('HardCurrencyBar')){frame(t.Find('Icon'),{x:rb.x+12,y:rb.y+3,w:24,h:rb.h-6,anchor:rb.anchor});frame(t.Find('Text (TMP)'),{x:rb.x+40,y:rb.y+2,w:rb.w-56,h:rb.h-4,anchor:rb.anchor},17);}
    off(ctx,named('TopGradient')[0]?.gameObject.GetComponent('Image'));
    // the countdown heart was black under a white fill (its figure grey on white): a dark track under the accent
    onFrame.push(()=>{for(const t of named('Revive Timer')){
      const bg=t.gameObject.GetComponent('Image');if(bg)bg.color=color(barTrack());
      const fill=t.Find('Fillbar')?.gameObject.GetComponent('Image');if(fill)fill.color=color(accent());
      const txt=t.Find('Timer Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');if(txt)textStyle(txt,30,true);
    }});
    // the reason "Challenge almost complete!" over its challenge row, both under the panel (they overlapped)
    for(const c of named('Challenge').filter(t=>t.parent?.name==='TriggerBox')){
      const r=rects['rv.trigger'];
      frame(c.Find('Text (TMP)'),[r.x,r.y-14,r.w,24],17);
      const row=c.Find('ChallengeSlotReadOnlyUI');if(row)readonlyRow(ctx,row,[r.x,r.y+14,r.w,56]);
      onFrame.push(()=>{const t=c.Find('Text (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');if(t){t.horizontalAlignment=2;t.verticalAlignment=512;t.enableWordWrapping=false;}});
    }
  }
  // The crown is instantiated by Portal after the menu scene is ready. It shows the bar-chart glyph, and the Levels
  // button the crown (owner's request).
  if(root.name==='LeaderboardButton'){
    // with the Challenges / Levels launchers in the bottom button container, not under the High Score display, and
    // shown like them on Home only: it no longer follows the High Score fade under Challenges (owner's request,
    // 2026-10-29; src/portal.js leaves the group to this layout)
    let menu=root.transform;while(menu && menu.name!=='Main Menu')menu=menu.parent;
    ctx.reparent(root.transform,menu?.Find('UI Container/BodyContainer/BottomButtonContainer'));
    const group=root.GetComponent('CanvasGroup');
    if(group){
      group._ui2Owned=()=>UI2.landscape;
      ctx.onEveryFrame.push(()=>{const shown=homePageShown();group.alpha=shown?1:0;group.interactable=group.blocksRaycasts=shown;});
    }
    map(root.transform,'h.lb');
    const r=rects['h.lb'],icon=root.transform.Find('Crown');
    frame(icon,{x:r.x+r.w/2-22,y:r.y+r.h/2-21,w:44,h:42,anchor:r.anchor});
    homeGlyph(icon?.gameObject.GetComponent('Image'),'levels');
  }
  for(const t of named('Tooltip Popup'))map(t,'h.tooltip');
}

InstantiateHooks.push((gos,ref)=>{
  if(!enabled)return;
  if(!gos.some(go=>go.transform.isRectTransform))return;
  const json=getPrefabJson(ref.id);
  gos.forEach((go,i)=>{if(json?.nodes[i]?.rect)go._ui2OriginalRect=structuredClone(json.nodes[i].rect);});
  const size=json?.nodes[0]?.rect?.m_SizeDelta;
  if(size?.every(n=>n>0))gos[0]._ui2BaseSize=size;
  pending.push({gos,ref});
});
let lastLandscape=UI2.landscape;
function processPending(){
  while(pending.length){
    const {gos,ref}=pending.shift();
    const roots=gos.filter(g=>!g.transform.parent || !gos.includes(g.transform.parent.gameObject));
    // Scene roots may be siblings (Main Menu, PopUps, TutorialUtility).
    for(const root of roots){root._prefabId ||= ref.id;const members=gos.filter(g=>g===root||g.transform.IsChildOf?.(root.transform));makeContext(root,members.length?members:gos);}
  }
}
UISystem.hooks.beforeLayout=()=>{
  if(!enabled)return;
  UISystem.setScreen(innerWidth,innerHeight);
  UI2.landscape=UISystem.width>=UISystem.height;
  // The original top-container slide is no longer an offscreen hiding mechanism after absolute placement.
  for(const ctx of contexts)if(ctx.root.name==='HUD'){
    const canvas=ctx.root.GetComponent('Canvas');if(canvas)canvas.enabled=!SceneHost.menuRoot;
  }
  if(UI2.landscape!==lastLandscape){
    for(const ctx of contexts){if(ctx.root._destroyed)continue;if(!UI2.landscape)ctx.restore();}
    lastLandscape=UI2.landscape;
  }
  if(UI2.landscape)for(const ctx of contexts)for(const [s] of ctx.scalers){s.m_ReferenceResolution=[1280,720];s.m_ScreenMatchMode=1;}
};
UISystem.hooks.afterLayout=()=>{
  if(!enabled)return;
  processPending();
  for(const ctx of contexts){
    if(ctx.root._destroyed){contexts.delete(ctx);continue;}
    if(!UI2.landscape || (ctx.root.name==='HUD' && SceneHost.menuRoot))continue;
    const key=UISystem.width+'x'+UISystem.height+':'+World.hierarchyVersion+':'+ctx.gos.map(g=>g.activeSelf?'1':'0').join('');
    const animated=ctx.animations.some(c=>c.gameObject.activeInHierarchy && (c.IsPlaying===true || c.tween?.IsPlaying?.()));
    if(key!==ctx.lastKey || animated || ctx.wasAnimated){ctx.apply();ctx.lastKey=key;}
    for(const f of ctx.onEveryFrame)f();
    ctx.wasAnimated=animated;
  }
};
LoopHooks.afterLateUpdate.push(()=>{if(enabled)updateShowroom();});
