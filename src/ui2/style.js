// UI2 look: neon chrome from the UI2 atlas page (tools/ui2-art.mjs), TMP styling and button colours.
import { Color, UIMesh, Image } from '../ugui/graphic.js';
import { UISystem } from '../ugui/canvas.js';
import { TMP_Text } from '../ugui/tmp.js';
import { UISprites } from '../ugui/sprites.js';
import { Assets } from '../engine/assets.js';

export const tokens = {
  bg:'#090418', panel:'#1a0b45', outline:'#b03cff', active:'#3a1170', pink:'#ff5ce1',
  row:'#0c0a1e', muted:'#4a3c80', blue:'#3c8bff', green:'#3cff8f', gold:'#ffcc00',
  gem:'#4fd8ff', ruby:'#ff3b4f', text:'#ffffff', secondary:'#c9c6e8',
};
// World theme: World 2 swaps in the `_w2` atlas sprites (tools/ui2-art.mjs) and a gold accent, same shapes and layout.
// `locked`: the transition screen shows a locked world over Home (src/ui2/layout.js)
// world: the world Home is drawn for (src/ui2/showroom.js displayedWorld), -1 before the first frame
export const theme = { suffix:'', locked:false, world:-1 };
const themedImages = new Map(); // Image -> base sprite name, re-pointed when the theme changes
const accentImages = new Set(); // small stars in the accent colour, recoloured when the theme changes
const themed = (name) => UISprites.info['Sprite/UI2/'+name+theme.suffix] ? name+theme.suffix : name;
export function themeSprite(img, name){themedImages.set(img,name);const s=UISprites.get('Sprite/UI2/'+themed(name));if(img.sprite!==s)img.sprite=s;}
export function setTheme(world){
  const suffix=world===1?'_w2':'';
  if(theme.suffix===suffix)return;
  theme.suffix=suffix;
  for(const [img,name] of themedImages){
    if(img.gameObject?._destroyed){themedImages.delete(img);continue;}
    img.sprite=UISprites.get('Sprite/UI2/'+themed(name));
  }
  for(const img of accentImages){
    if(img.gameObject?._destroyed){accentImages.delete(img);continue;}
    img.color=color(accent(),img.color.a);
  }
}
/** accent text colour (High Score caption): pink on World 1, gold on World 2 */
export const accent = () => theme.suffix ? '#ffc61a' : tokens.pink;
/** progress bar fill and track: violet on World 1, mint on World 2 */
export const barFill = () => theme.suffix ? '#1ee69a' : tokens.outline;
export const barTrack = () => theme.suffix ? '#0f3a2e' : '#2a1f55';
/** inactive page dot: muted violet on World 1, muted mint on World 2 */
export const muted = () => theme.suffix ? '#1f5a48' : tokens.muted;
/** caption of the selected Home tab: white on World 1, gold on World 2 */
export const activeText = () => theme.suffix ? '#ffc61a' : '#ffffff';
export const color = (hex, alpha=1) => new Color(...hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255),alpha);
const styled = new WeakSet();
let fonts;
export function textStyle(t, size=17, title=false, hex=tokens.text) {
  if (!t) return;
  fonts ||= Object.keys(Assets.so).filter(k=>/nulshock bd SDF$|Downlink SDF$/i.test(k));
  const f=fonts.find(k=>title?/nulshock/i.test(k):/Downlink/i.test(k));
  if(f && t.font?.$so!==f) t.font={ $so:f };
  t.fontSize=Math.max(15,size);
  t.m_enableAutoSizing=0;
  t.m_fontSizeMin=15;
  t.m_enableVertexGradient=0;
  t.m_Material=null;
  // the colour is restyled, its alpha stays the original's: feedbacks fade texts in and out (lootbox "Bonus Reward")
  const c=color(hex,t.color.a);
  if(!t.color.equals(c))t.color=c;
  if(title && !(t.fontStyle&16))t.fontStyle=(t.fontStyle & ~8)|16;
}
export function skin(img, kind='panel', shape='panel') {
  if(!img)return;
  img._ui2Skin={kind,shape};
  img.type=0;
  img.preserveAspect=false;
  img.color=color(kind==='shade'?'#000000':'#ffffff',kind==='shade'?.65:1);
  if(kind==='shade'){img.sprite=null;img.getDrawCalls=undefined;return;}
  // The neon frames are 9-sliced atlas sprites (tools/ui2-art.mjs) drawn around the original Image rect.
  img.getDrawCalls=()=>{const m=chrome(img);return m?[{mesh:m,texture:img._ui2Tex}]:[];};
}

/** A flat octagon on the Image's rect with chamfered corners: the graphic of a Mask that cuts what it holds (rectangular
 *  glows, banners, flashes) to the shape of a chamfered frame. `corner` in design units. */
export function chamferMask(img, corner=16) {
  if(!img)return;
  img._ui2Skin=null;img.sprite=null;
  img.getDrawCalls=()=>{
    const r=img.rectTransform.rect,ck=[r.x,r.y,r.width,r.height,corner].join('|');
    if(img._chromeKey!==ck){
      const k=Math.min(corner,r.width/3,r.height/3),x0=r.x,y0=r.y,x1=r.x+r.width,y1=r.y+r.height,m=new UIMesh(),c=new Color(1,1,1,1);
      const ring=[[x0+k,y0],[x1-k,y0],[x1,y0+k],[x1,y1-k],[x1-k,y1],[x0+k,y1],[x0,y1-k],[x0,y0+k]];
      m.addVert((x0+x1)/2,(y0+y1)/2,c,.5,.5);for(const [x,y] of ring)m.addVert(x,y,c,.5,.5);
      for(let i=0;i<8;i++)m.idx.push(0,1+i,1+(i+1)%8);
      img._chromeKey=ck;img._chrome=m;
    }
    return [{mesh:img._chrome,texture:null}];
  };
}

// Home tab and navigation icons come from the UI2 atlas; the original Image objects stay in place.
const GLYPH={shop:'icon_shop',vehicle:'icon_bike',world:'icon_world',challenges:'icon_challenges',levels:'icon_levels',grid:'icon_grid',left:'chevron',right:'chevron'};
export function homeGlyph(img, type) {
  if(!img)return;
  themeSprite(img,GLYPH[type]);img.type=0;img.preserveAspect=true;img.getDrawCalls=undefined;
}

/** sprite key of a skinned Image: shape + colour kind (active state and hover use the bright variant) */
function spriteKey(img){
  const {kind,shape}=img._ui2Skin;
  if(kind==='badge' || shape==='circle')return 'badge';
  const k=kind==='home'?(img._ui2Active?'active':'panel'):img._ui2Active?'active':kind;
  if(shape==='tab')return `tab_${img._ui2Tab?.shape||'side'}_${k==='active'?'active':'panel'}`;
  if(shape==='pill')return k==='row'?'pill_row':'pill_panel';
  return `${shape==='hex'?'hex':'cham'}_${k}`;
}

function chrome(img){
  const key=themed(spriteKey(img)),s=UISprites.get('Sprite/UI2/'+key),info=UISprites.info['Sprite/UI2/'+key];
  if(!s)return null;
  const r=img.rectTransform.rect,ui=info.ui2||{},mirror=!!img._ui2Tab?.mirror,alpha=img.color.a;
  const ck=[r.x,r.y,r.width,r.height,key,mirror,alpha].join('|');
  if(img._chromeKey===ck)return img._chrome;
  // design units per sprite pixel: chamfer corners follow min(16, h/3) (UI_SPEC §6), the other shapes follow the height
  const f=ui.mode==='corner'?Math.min(16,r.height/3,r.width/3)/ui.corner:ui.mode==='height'?r.height/ui.sh:Math.min(r.width,r.height)/(ui.padOf||s.rect.width);
  const pad=(ui.pad||0)*f,x0=r.x-pad,y0=r.y-pad,x1=r.x+r.width+pad,y1=r.y+r.height+pad;
  let [bl,bb,br,bt]=[s.border.x,s.border.y,s.border.z,s.border.w].map(v=>v*f);
  if(mirror)[bl,br]=[br,bl];
  const kx=Math.min(1,(x1-x0)/Math.max(1e-6,bl+br)),ky=Math.min(1,(y1-y0)/Math.max(1e-6,bb+bt));
  bl*=kx;br*=kx;bb*=ky;bt*=ky;
  const o=s.outerUV,i=s.innerUV;
  const vx=[x0,x0+bl,x1-br,x1],vy=[y0,y0+bb,y1-bt,y1];
  const ux=mirror?[o[2],i[2],i[0],o[0]]:[o[0],i[0],i[2],o[2]],uy=[o[1],i[1],i[3],o[3]];
  const m=new UIMesh(),c=new Color(1,1,1,alpha);
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(vx[a+1]>vx[a] && vy[b+1]>vy[b])m.addQuad(vx[a],vy[b],vx[a+1],vy[b+1],c,ux[a],uy[b],ux[a+1],uy[b+1]);
  img._ui2Tex=s.texture;img._chromeKey=ck;img._chrome=m;return m;
}
// Owner's request: every gem and ruby glows like the Home top bar's. Their Images draw the bloomed UI2 icon (128 px,
// the 76 px glyph in the middle) with the glyph where the flat icon was and the bloom past its rect, so no rect changes.
// Icons set later (reward cells, prices) are caught by the sprite setter. Portrait keeps the flat icon.
const GLOW_ICONS={S_Icon_SoftCurrency:'cur_gem',S_Icon_HardCurrency:'cur_ruby'};
function glowCalls(){
  const img=this,r=img.rectTransform.rect,s=UISprites.get('Sprite/UI2/'+img._ui2Glow);
  if(!s || UISystem.width<UISystem.height)return [{mesh:img.getMesh(),texture:img.mainTexture}];
  const ck=[r.x,r.y,r.width,r.height,img._ui2Glow,img.color.a].join('|');
  if(img._glowKey!==ck){
    const h=Math.min(r.width,r.height)*128/76/2,cx=r.x+r.width/2,cy=r.y+r.height/2,o=s.outerUV,m=new UIMesh();
    m.addQuad(cx-h,cy-h,cx+h,cy+h,new Color(1,1,1,img.color.a),o[0],o[1],o[2],o[3]);
    img._glowKey=ck;img._glowMesh=m;
  }
  return [{mesh:img._glowMesh,texture:s.texture}];
}
export function glowIcon(img){
  const key=GLOW_ICONS[img._sprite?.name];
  if(key && !img._ui2Skin){img._ui2Glow=key;img.getDrawCalls=glowCalls;}
  else if(img._ui2Glow){img._ui2Glow=null;img.getDrawCalls=undefined;}
}
// the gems and rubies of prices and amounts (`<sprite name="SoftCurrency">`) too
const GLOW_TEXT_SPRITES={SoftCurrency:'cur_gem',HardCurrency:'cur_ruby'};
TMP_Text.spriteOverride=(name)=>{
  const s=GLOW_TEXT_SPRITES[name] && UISystem.width>=UISystem.height && UISprites.get('Sprite/UI2/'+GLOW_TEXT_SPRITES[name]);
  return s?{texture:s.texture,uv:s.outerUV,scale:128/76}:null;
};
const spriteProp=Object.getOwnPropertyDescriptor(Image.prototype,'sprite');
Object.defineProperty(Image.prototype,'sprite',{configurable:true,get:spriteProp.get,set(s){spriteProp.set.call(this,s);glowIcon(this);}});

export function styleObject(go) {
  if(styled.has(go))return;
  styled.add(go);
  for(const c of go.components){
    if(c._typeName==='TextMeshProUGUI')textStyle(c,Math.max(15,Math.min(26,c.fontSize*.45)),/Header|Title|ChallengesText|LevelsText/.test(go.name));
    if(c._typeName==='Button'){
      c.transition=1;
      c.colors={normalColor:Color.white,highlightedColor:color('#ff91ef'),pressedColor:color('#c9a0ff'),selectedColor:Color.white,disabledColor:color('#9586b5',.65),colorMultiplier:1,fadeDuration:.12};
      if(c.image?.color.a>.01 && c.image.sprite)skin(c.image,/Ad|RVButton/.test(go.name)?'gold':/BuyButton|ClaimButton/.test(go.name)?'green':'panel',/Close|Skip|Toggle|Arrow|Button$/.test(go.name)?'hex':'panel');
    }
    if(c._typeName==='Image'){
      const n=c.sprite?.name || '';
      if(c.color.a>.01 && /S_NavigationBar|S_Button_Main|S_Container_Base|S_Container_Solid/.test(n) && !c._ui2Skin)skin(c,'panel',/Button_Main/.test(n)?'hex':'panel');
      if(/S_Icon_SoftCurrency/.test(n))c.color=color(tokens.gem);
      if(/S_Icon_HardCurrency/.test(n))c.color=color(tokens.ruby);
      glowIcon(c);
      // Rank stars use the silver-violet UI2 star of the Home reference; small stars take the world's accent (pink on
      // World 1, gold on World 2), recoloured by setTheme.
      if(/S_Icon_StarRank/.test(n)){themeSprite(c,'star_rank');c.preserveAspect=true;c.color=Color.white;}
      else if(/S_Icon_Star/.test(n)){accentImages.add(c);c.color=color(accent());}
      if(/^GameNotification/.test(go.name))skin(c,'badge','circle');
    }
    // Serialized hover effects must not resize or shake controls.
    if(c._typeName==='ButtonUI')c.enabled=false;
  }
}
