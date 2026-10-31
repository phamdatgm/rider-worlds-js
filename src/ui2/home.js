import { skin, textStyle, color, tokens, homeGlyph, accent, activeText, theme, themeSprite } from './style.js';
import { Canvas, CanvasGroup, GraphicRaycaster, UISystem } from '../ugui/canvas.js';
import { WorldManager, PlayerRankManager, BonusState } from '../uiscripts/services.js';
import { UI_WorldNavButtons } from '../uiscripts/home.js';
import { UISprites } from '../ugui/sprites.js';
import { GameObject } from '../engine/scene.js';
import { RectTransform } from '../ugui/rect.js';
import { Button } from '../ugui/selectable.js';
import { PlayerRank } from '../meta/rank.js';
import { TransitionScreen, getSceneSwitcher } from '../uiscripts/scenes.js';

let homeScreen=null;
/** number of the world shown on Home: the world navigation's selection (a locked world too), else the current world */
// the world Home is drawn for (theme.world, which changes under the transition's black), else the selection
const shownWorldNumber=()=>{const s=theme.world>=0?theme.world:UI_WorldNavButtons.localWorldSelected;return (s>=0?s:WorldManager.Instance?.CurrentWorldIndex??0)+1;};
/** the Home page is shown (not Shop or Vehicles; Shop keeps Home's camera view) */
export const homePageShown=()=>!!homeScreen?.gameObject.activeInHierarchy;
export function homeLayout(ctx) {
  const { root, find, map, frame, hide, relativeFrame:rel }=ctx;
  if(root.name!=='Main Menu')return;
  const home=find('UI Container/BodyContainer/PageContainer/Home Screen');
  if(!home)return;
  homeScreen=home;
  const base='UI Container/BodyContainer/BottomButtonContainer/Bottom Menu Button - ';
  for(const suffix of ['Settings','PLACEHOLDER'])hide(find(base+suffix));
  const play=home.Find('BottomContainer/PlayButton');
  const canvas=play.gameObject.AddComponent(Canvas);canvas.overrideSorting=true;canvas.sortingOrder=100;
  play.gameObject.AddComponent(GraphicRaycaster);
  ctx.landscapeComponents.push(canvas);
  map(play,'t.world');
  ctx.onFrame.push(()=>{
    const img=play?.gameObject.GetComponent('Image');
    if(img){img.color=color('#ffffff',0);img.getDrawCalls=()=>[];}
  });
  const playButton=play.gameObject.GetComponent('Button');
  if(playButton)ctx.onEveryFrame.push(()=>{if(playButton.interactable===theme.locked)playButton.interactable=!theme.locked;});
  // The reference tab bar has no play mark: the lit World tab is the Play button.
  const playIcon=play?.Find('Icon')?.gameObject.GetComponent('Image');
  if(playIcon)ctx.onFrame.push(()=>{playIcon.color=color('#ffffff',0);});
  // Both states keep the same caption, so page switching cannot change the tab's footprint.
  for(const [suffix,id,glyph] of [['Store','t.shop','shop'],['Meta','t.veh','vehicle'],['Endless','t.world','world']]){
    const tab=find(base+suffix);if(!tab)continue;
    const r=ctx.rects[id];
    skin(tab.gameObject.GetComponent('Image'),'home','tab');
    // three tabs: Shop (arrow tip left) | World (centre) | Vehicles (arrow tip right)
    tabShape(tab,suffix==='Endless'?'centre':'end',suffix==='Meta');
    const activeIcon=tab.Find('Icon - Active')?.gameObject.GetComponent('Image');
    const inactiveIcon=tab.Find('Icon - Inactive')?.gameObject.GetComponent('Image');
    if(activeIcon && inactiveIcon)inactiveIcon.sprite=activeIcon.sprite;
    const tabImage=tab.gameObject.GetComponent('Image');
    const button=tab.gameObject.GetComponent('Button');
    if(button)button.colors={...button.colors,disabledColor:color('#ffffff')};
    if(suffix==='Endless' && tabImage)tabImage._ui2HoverButton=play.gameObject.GetComponent('Button');
    for(const name of ['Icon - Active','Icon - Inactive']){
      const icon=tab.Find(name);
      // icon and caption sit on the tab's bottom edge, so the taller centre tab lines up with the side tabs
      frame(icon,at(r,r.x+r.w/2-30,r.y+r.h-86,60,48));
      const image=icon?.gameObject.GetComponent('Image');
      if(image){homeGlyph(image,glyph,button);ctx.onFrame.push(()=>{image.color=color('#ffffff');});}
      // World tab: World while another page is shown, Play (it starts the run) once Home is shown
      // a locked world shown on Home can be browsed but not played: Play is dimmed and off
      if(image && suffix==='Endless')ctx.onEveryFrame.push(()=>{themeSprite(image,tabImage?._ui2Active?'icon_play':'icon_world');image.color=color('#ffffff',theme.locked && tabImage?._ui2Active?.4:1);});
      const caption=icon?.Find('Text (TMP)');
      if(caption){ctx.reparent(caption,tab);frame(caption,at(r,r.x+12,r.y+r.h-41,r.w-24,28),22);const showCaption=()=>{
        caption.gameObject.SetActive(true);
        const t=caption.gameObject.GetComponent('TextMeshProUGUI');
        textStyle(t,22,true,tabImage?._ui2Active?activeText():tokens.text);
        if(suffix==='Endless' && theme.locked && tabImage?._ui2Active)t.color=color(activeText(),.4);
        if(suffix==='Meta')t.text='Vehicles';
        // off Home the World tab names the world it returns to
        const label=suffix==='Endless' && (tabImage?._ui2Active?'Play':'World '+shownWorldNumber());
        if(label && t.text!==label)t.text=label;
      };ctx.onFrame.push(showCaption);ctx.onEveryFrame.push(showCaption);}
    }
    badgeNumber(ctx,tab);
    // The tutorials focus a tab on its icon (TutorialCenterSocket), which sat at the top of the tab: the circle stood
    // off its middle (owner's capture). A rect in the tab's middle takes the focus, the hand presses just under it.
    const state=tab.gameObject.GetComponent('MenuButtonState');
    if(state){
      if(!state._ui2TutorialCenter){
        const go=new GameObject('UI2 Tutorial Center',RectTransform);go._ui2Added=true;go.transform.SetParent(tab,false);
        ctx.gos.push(go);state._ui2TutorialCenter=go.transform;
      }
      const cx=r.x+r.w/2,cy=r.y+r.h/2;
      frame(state._ui2TutorialCenter,at(r,cx-48,cy-48,96,96));
      // the fingertip at the icon's lower right (owner's markup)
      frame(state.tutorialSocket,at(r,cx+20,cy-6,2,2));
    }
    // the World/Play tab shows no badge (owner's request): the ping handler turns it back on, so it is held off each frame
    const ping=suffix==='Endless' && tab.Find('GameNotificationWithText');
    if(ping)ctx.onEveryFrame.push(()=>{if(ping.gameObject.activeSelf)ping.gameObject.SetActive(false);});
    const requirement=tab.Find('Star Requirement Indicator');
    if(requirement){
      // Owner's request: a locked tab is dimmed and shows a padlock where its icon was; tapping it still tells the rank it
      // needs (the "Needs ★ 3" label wrapped to "Need / s" in the corner, the rank a tiny figure on a star)
      const icons=['Icon - Active','Icon - Inactive'].map(n=>tab.Find(n)?.gameObject.GetComponent('Image')).filter(Boolean);
      const captions=tab.children.filter(c=>c.name==='Text (TMP)').map(c=>c.gameObject.GetComponent('TextMeshProUGUI')).filter(Boolean);
      ctx.onEveryFrame.push(()=>{
        const locked=requirement.gameObject.activeSelf;
        if(tabImage && tabImage.color.a!==(locked?.45:1))tabImage.color=color('#ffffff',locked?.45:1);
        if(locked){for(const i of icons)i.color=color('#ffffff',0);for(const c of captions)c.color=color(tokens.text,.4);}
        else{
          for(const i of icons)if(i.color.a===0)i.color=color('#ffffff');
          // (textStyle keeps a text's alpha, so the dimmed caption is brought back here)
          for(const c of captions)if(c.color.a<1)c.color=c.color.withAlpha?c.color.withAlpha(1):color(tokens.text);
        }
      });
      // the indicator's plate becomes the padlock; its label, star and rank are off
      const lock=[r.x+r.w/2-26,r.y+r.h-90,52,52];
      frame(requirement,at(r,...lock));frame(requirement.Find('Underlay'),at(r,...lock));
      for(const n of ['Need (TMP)','Star','Requirement (TMP)'])ctx.hide(requirement.Find('Underlay/'+n));
      const plate=requirement.Find('Underlay')?.gameObject.GetComponent('Image');
      if(plate)ctx.onFrame.push(()=>{plate.sprite='Sprite/SA_Icons/S_Lock';plate.type=0;plate.preserveAspect=true;plate.color=color('#ffffff',.9);plate.raycastTarget=false;});
    }
  }
  // Challenges and Levels: icon-only hexagon buttons under the settings button (owner's markup, 2026-10-28)
  // Levels shows a 2 x 2 grid, and the leaderboard the bar chart (owner's requests; src/ui2/layout.js)
  const launchers=[];
  for(const [name,id,glyph] of [['ChallengeButton','t.chal','challenges'],['LevelsButton','t.lvl','grid']]){
    const tab=find('UI Container/BodyContainer/PageContainer/Home Screen/BottomContainer/'+name),r=ctx.rects[id];
    if(tab)launchers.push(tab);
    skin(tab?.gameObject.GetComponent('Image'),'panel','hex');
    for(const n of ['Icon - Open','Icon - Close']){const t=tab?.Find(n);frame(t,at(r,r.x+r.w/2-22,r.y+r.h/2-21,44,42));const image=t?.gameObject.GetComponent('Image');if(image){homeGlyph(image,glyph,tab?.gameObject.GetComponent('Button'));ctx.onFrame.push(()=>{image.color=color('#ffffff');});}}
    hide(tab?.Find(name==='LevelsButton'?'LevelsText':'ChallengesText'));
    badgeNumber(ctx,tab);
    const req=tab?.Find('Star Requirement Indicator');
    if(req)frame(req,at(r,r.x+8,r.y+8,r.w-16,r.h-16));
    const overlay=find('UI Container/BodyContainer/PageContainer/Home Screen/'+(name==='ChallengeButton'?'ChallengeOverlay':'Timed Level Overlay'));
    ctx.onFrame.push(()=>{tab?.Find('Icon - Open')?.gameObject.SetActive(!overlay?.gameObject.activeSelf);tab?.Find('Icon - Close')?.gameObject.SetActive(!!overlay?.gameObject.activeSelf);});
  }
  const worldNav=home.Find('WorldNav');
  const navLogic=worldNav?.gameObject.GetComponent('UI_WorldNavButtons');
  for(const [name,id,glyph] of [['Left','h.navL','left'],['Right','h.navR','right']]){
    const nav=worldNav?.Find(name),r=ctx.rects[id],button=nav?.gameObject.GetComponent('Button');
    const face=nav?.gameObject.GetComponent('Image');
    if(face){face._ui2Skin=null;face.sprite=null;face.color=color('#ffffff',0);face.getDrawCalls=()=>[];}
    const arrow=nav?.Find('Arrow');frame(arrow,r);
    const image=arrow?.gameObject.GetComponent('Image');if(image)homeGlyph(image,name==='Right'?'left':glyph,button);
    ctx.onEveryFrame.push(worldArrow(nav,name,navLogic,()=>theme.locked));
  }
  const title=find('UI Container/BodyContainer/PageContainer/Meta Screen/SelectionContainer/TabButtons/UI_VehicleMetaTabButton/TabTitle (TMP)');
  if(title)ctx.onFrame.push(()=>{const t=title.gameObject.GetComponent('TextMeshProUGUI');if(t)t.text='Vehicles';});
  ctx.onFrame.push(()=>{
    for(const suffix of ['Store','Meta','Endless']){
      const tab=find(base+suffix);const state=tab?.gameObject.GetComponent('MenuButtonState');
      if(state?.image){state.image._ui2Active=state.activeState.activeSelf;state.image.color=color(state.activeState.activeSelf?tokens.active:tokens.panel);}
    }
  });
  // The Challenges / Levels launchers show on Home only: off Home the garage's collection frame takes the left side.
  // They keep their parents, handlers and tutorial sockets; a canvas group of their own switches drawing and raycasts.
  const groupOf=t=>t.gameObject.GetComponent('CanvasGroup')||t.gameObject.AddComponent(CanvasGroup);
  const show=(g,shown)=>{g.alpha=shown?1:0;g.blocksRaycasts=shown;g.interactable=shown;};
  const groups=launchers.map(groupOf);
  // the Vehicles page also hides the settings button and the rank star bar (owner's request)
  const meta=find('UI Container/BodyContainer/PageContainer/Meta Screen');
  const vehiclesHidden=['UI Container/TopContainer/SettingsButton','UI Container/TopContainer/TopBar/Left/StarRankBar-OpenRewardTrack'].map(find).filter(Boolean).map(groupOf);
  ctx.onEveryFrame.push(()=>{
    const shown=homePageShown(),vehicles=!!meta?.gameObject.activeInHierarchy;
    for(const g of groups)show(g,shown);
    for(const g of vehiclesHidden)show(g,!vehicles);
  });
  ctx.onEveryFrame.push(()=>{
    if(!home.gameObject.activeInHierarchy)return;
    const tint=(path,hex='#ffffff',a=1)=>{const c=find(path)?.gameObject.GetComponent('TextMeshProUGUI')||find(path)?.gameObject.GetComponent('Image');if(c)c.color=color(hex,a);};
    // the world badge shows only the number of the world shown, no "WORLD" label
    tint('UI Container/TopContainer/WorldStatsButton/World (TMP)','#ffffff',0);
    const score='UI Container/BodyContainer/PageContainer/Home Screen/TopContainer/ScoreDisplay/';
    // a locked world shows its unlock rank in place of the high score (transition screen, src/ui2/layout.js)
    const shown=theme.locked?0:1;
    tint(score+'Container Best/High Score Text',accent(),shown);tint(score+'Container Best/High Score Number','#ffffff',shown);
    tint('UI Container/TopContainer/SettingsButton/SettingsIcon');
    // the bloomed currency icons carry their own colour (cur_gem / cur_ruby)
    tint('UI Container/TopContainer/TopBar/Right/SoftCurencyBar/Icon');
    tint('UI Container/TopContainer/TopBar/Right/HardCurrencyBar/Icon');
  });
  const rank=find('UI Container/TopContainer/TopBar/Left/StarRankBar-OpenRewardTrack');
  // owner's wireframe: rank star and star bar centred at the top, "« WORLD 1 »" under them, BONUS top-right
  const rr=ctx.rects['h.rank'],sb=ctx.rects['h.starbar'];
  // the rank star opens the Reward Track; the star bar opens Progress (owner's request, 2026-10-29: the track button
  // spanned the star and the bar)
  frame(rank?.Find('OpenRankTrackButton'),{x:rr.x,y:rr.y,w:rr.w,h:rr.h,anchor:'canvas'});
  const barBg=rank?.Find('FillbarBackground')?.gameObject;
  if(barBg && !barBg.GetComponent('Button')){
    const open=barBg.AddComponent(Button);open.m_Transition=0;
    open.onClick.AddListener(()=>find('UI Container/TopContainer/WorldStatsButton')?.gameObject.GetComponent('UI_WorldStatsButton')?.ToggleWorldStatsOpen());
    const img=barBg.GetComponent('Image');if(img)img.raycastTarget=true;
  }
  rel(rank?.Find('Icon/Level (TMP)'),[15,20,34,28],20);
  rel(rank?.Find('FillbarBackground/Stars Status(TMP)'),[0,1,sb.w,sb.h-2],18);
  const worldFill=find('UI Container/TopContainer/WorldStatsButton/World FillColor');
  hide(find('UI Container/TopContainer/WorldStatsButton/Percentage(TMP)'));
  // Right of the star bar, mirroring the rank star (owner's markup, 2026-10-29): the star of the next rank, the rank
  // the bar fills towards (the current one at the top rank). Like the rank star it opens the Reward Track (owner's
  // request, 2026-10-29); only the bar opens World Stats. It was a hexagon with the number of the world shown.
  const wr=ctx.rects['h.world'];
  if(worldFill){
    frame(worldFill,wr);const img=worldFill.gameObject.GetComponent('Image');
    if(img){img._ui2Skin=null;img.getDrawCalls=undefined;themeSprite(img,'star_rank');img.type=0;img.preserveAspect=true;ctx.onFrame.push(()=>{img.color=color('#ffffff');});}
    // the click stops at this Button, before the WorldStatsButton it sits in; the badge's hidden world picture and
    // labels above it no longer catch it
    for(const n of ['World Image','World Image - Other World','World (TMP)','Percentage(TMP)']){
      const g=worldFill.parent.Find(n)?.gameObject;const c=g?.GetComponent('Image')||g?.GetComponent('TextMeshProUGUI');if(c)c.raycastTarget=false;
    }
    if(img && !worldFill.gameObject.GetComponent('Button')){
      const open=worldFill.gameObject.AddComponent(Button);open.m_Transition=0;
      open.onClick.AddListener(()=>rank?.Find('OpenRankTrackButton')?.gameObject.GetComponent('Button')?.onClick.Invoke());
      img.raycastTarget=true;
    }
  }
  const number=find('UI Container/TopContainer/WorldStatsButton/WorldNumber(TMP)');
  frame(number,{x:wr.x+15,y:wr.y+20,w:34,h:28,anchor:wr.anchor},20);
  const numberText=number?.gameObject.GetComponent('TextMeshProUGUI');
  if(numberText)numberText.raycastTarget=false;
  if(numberText)ctx.onEveryFrame.push(()=>{
    // ranks show 1-based (the rank star reads CurrentRank + 1)
    const next=String(PlayerRank.CurrentRank+(PlayerRank.IsMaxRank?1:2));
    heavy(numberText,20);numberText.horizontalAlignment=2;numberText.verticalAlignment=512;numberText.enableWordWrapping=false;
    if(numberText.text!==next)numberText.text=next;
  });
  for(const [id,n] of [['h.gem','SoftCurencyBar'],['h.ruby','HardCurrencyBar']]){
    const bar=find('UI Container/TopContainer/TopBar/Right/'+n),r=ctx.rects[id];
    skin(bar?.gameObject.GetComponent('Image'),'panel','pill');
    // owner's request: gems on top, rubies below; the figure first and the icon at the right end, inside the pill (clear
    // of its pointed end) with a bloom. The sprite is 128 px with the 76 px glyph in the middle, so the 50 px rect
    // draws a 30 px icon centred 33 px from the right end; the figure is right-aligned against it.
    rel(bar?.Find('Icon'),[r.w-58,r.h/2-25,50,50]);
    const gem=bar?.Find('Icon')?.gameObject.GetComponent('Image');
    if(gem){gem.preserveAspect=true;gem.sprite=UISprites.get('Sprite/UI2/'+(id==='h.gem'?'cur_gem':'cur_ruby'));}
    rel(bar?.Find('Text (TMP)'),[16,1,r.w-70,r.h-2],22);
    rel(bar?.Find(id==='h.gem'?'SoftCurrencyButton':'HardCurrencyButton'),[0,0,r.w,r.h]);
  }
  const settings=find('UI Container/TopContainer/SettingsButton');
  const settingsImage=settings?.gameObject.GetComponent('Image');
  skin(settingsImage,'panel','hex');if(settingsImage)settingsImage.enabled=true;
  rel(settings?.Find('SettingsIcon'),[11,7,40,42]);
  const settingsIcon=settings?.Find('SettingsIcon')?.gameObject.GetComponent('Image');
  if(settingsIcon)ctx.onFrame.push(()=>{settingsIcon.color=color('#ffffff');});
  skin(rank?.Find('FillbarBackground')?.gameObject.GetComponent('Image'),'panel','pill');
  // the star progress fills the inside of the bar, pointed ends as the bar, gold as in the wireframe
  // (it stretched over the whole plate as a white square); star_fill is drawn for this 335 x 34 bar
  const fill=rank?.Find('FillbarBackground/Fillbar');
  rel(fill,[6,5,sb.w-12,sb.h-10]);
  const fillImage=fill?.gameObject.GetComponent('Image');
  if(fillImage){themeSprite(fillImage,'star_fill');ctx.onFrame.push(()=>{fillImage.color=color('#ffffff');});}
  const bonus=home.Find('BottomContainer/ClaimBonusButton/BonusBarMainMenu/PipContainer');
  if(bonus){
    frame(bonus,ctx.rects['h.bonus']);
    // the "claim" dot sits at the end of the BONUS word
    const hb=ctx.rects['h.bonus'],dot=home.Find('BottomContainer/ClaimBonusButton/BonusBarMainMenu/GameNotificationDot'),num=dot?.Find('Number (TMP)');
    const dotOf=r=>({x:r.x+r.w+4,y:r.y+2,w:22,h:22,anchor:r.anchor});
    frame(dot,dotOf(hb));frame(num,dotOf(hb),15);
    bonusAutoHide(ctx,home.Find('BottomContainer/ClaimBonusButton'));
    bonus.children.forEach((pip,i)=>{
      rel(pip,[i*25,0,24,26]);
      for(const n of ['BonusRide_Letter','BonusRide_Letter_Filled'])rel(pip.Find(n),[0,0,24,26],22);
    });
  }
  // The reference sets every figure and the High Score caption in a heavy face (Nulshock Bold).
  const tmp=t=>t?.gameObject.GetComponent('TextMeshProUGUI');
  ctx.onFrame.push(()=>{
    for(const n of ['SoftCurencyBar','HardCurrencyBar']){const t=tmp(find('UI Container/TopContainer/TopBar/Right/'+n)?.Find('Text (TMP)'));heavy(t,22);if(t){t.horizontalAlignment=4;t.verticalAlignment=512;t.enableWordWrapping=false;t.enableAutoSizing=true;t.m_fontSizeMin=14;t.m_fontSizeMax=22;}}
    heavy(tmp(home.Find('TopContainer/ScoreDisplay/Container Best/High Score Text')),ctx.rects['h.hsLabel'].fs);
    heavy(tmp(home.Find('TopContainer/ScoreDisplay/Container Best/High Score Number')),ctx.rects['h.hsNum'].fs);
    heavy(tmp(rank?.Find('Icon/Level (TMP)')),20);
    const stars=tmp(rank?.Find('FillbarBackground/Stars Status(TMP)'));heavy(stars,18);if(stars)stars.horizontalAlignment=2;
  });
  for(const n of ['World Image','World Image - Other World']){
    const t=find('UI Container/TopContainer/WorldStatsButton/'+n);
    if(t)ctx.onFrame.push(()=>{const i=t.gameObject.GetComponent('Image');if(i)i.color=color(tokens.active,0);});
  }
  const hs=home.Find('TopContainer/ScoreDisplay/Container Best')?.gameObject.GetComponent('Image');
  if(hs)ctx.onFrame.push(()=>{hs.color=color('#ffffff',0);});
  ctx.onFrame.push(()=>{const t=home.Find('TopContainer/ScoreDisplay/Container Best/High Score Text')?.gameObject.GetComponent('TextMeshProUGUI');if(t)t.color=color(accent());});
  // "New Best!" sits under the score as gold text alone, no plate (owner's request)
  const nb=ctx.rects['h.hsNew'],sticker=home.Find('TopContainer/ScoreDisplay/NewSticker');
  rel(sticker?.Find('ImageBanner'),[0,0,nb.w,nb.h]);rel(sticker?.Find('ImageBanner/NewText (TMP)'),[0,0,nb.w,nb.h],nb.fs);
  const plate=sticker?.Find('ImageBanner')?.gameObject.GetComponent('Image'),newText=tmp(sticker?.Find('ImageBanner/NewText (TMP)'));
  // it shares the line under the score with BONUS (h.bonus) and gives way while BONUS shows
  const bonusClaim=home.Find('BottomContainer/ClaimBonusButton');
  const stickerGroup=sticker&&(sticker.gameObject.GetComponent('CanvasGroup')||sticker.gameObject.AddComponent(CanvasGroup));
  if(stickerGroup)ctx.onEveryFrame.push(()=>{const a=bonusClaim?.gameObject.activeInHierarchy?0:1;if(stickerGroup.alpha!==a)stickerGroup.alpha=a;stickerGroup.blocksRaycasts=false;});
  ctx.onFrame.push(()=>{
    if(plate && plate.color.a!==0)plate.color=plate.color.withAlpha(0);
    if(newText){textStyle(newText,nb.fs,true,tokens.gold);newText.enableWordWrapping=false;newText.horizontalAlignment=2;newText.verticalAlignment=512;}
  });
  // New tab positions leave all tutorial sockets under the original buttons.
}
/** BONUS stays on Home only while its reward waits (owner's request, 2026-10-29): short of five letters it shows for
 *  3 s each time the Home page appears (counted once Home is uncovered and new letters have animated in), and claiming
 *  hides it at once.
 */
function bonusAutoHide(ctx,claim){
  const button=claim?.gameObject.GetComponent('UI_MainMenuBonusButton'),bar=claim?.Find('BonusBarMainMenu')?.gameObject.GetComponent('UIBonusLetterBarMainMenu');
  if(!button)return;
  const s={since:0,hidden:false,wasShown:false,hadAll:BonusState.CollectedAllBonusRideLetters};
  const update=button.UpdateBonusRideButton.bind(button);
  button.UpdateBonusRideButton=()=>{update();if(s.hidden)claim.gameObject.SetActive(false);};
  ctx.onEveryFrame.push(()=>{
    const now=performance.now(),shown=homePageShown(),all=BonusState.CollectedAllBonusRideLetters,ts=TransitionScreen.Instance;
    // the count starts once Home is in sight: not under the loader or the transition screen
    const covered=getSceneSwitcher().menuStateSO.isSceneTransitioning||(!!ts?.canvas?.enabled&&ts.canvasGroup?.alpha>0);
    if(shown&&!s.wasShown){s.since=now;s.hidden=false;button.UpdateBonusRideButton();}
    s.wasShown=shown;
    if(s.hadAll&&!all)s.hidden=true;
    else if(all&&!s.hadAll){s.hidden=false;button.UpdateBonusRideButton();}
    s.hadAll=all;
    if(covered||bar?._anim)s.since=now;
    if(!all&&now-s.since>=3000)s.hidden=true;
    if(s.hidden&&claim.gameObject.activeSelf)claim.gameObject.SetActive(false);
  });
}

/** the number in a notification badge (22 x 22): small heavy figure, centred */
function badgeNumber(ctx,tab){
  const t=tab?.Find('GameNotificationWithText/Number (TMP)')?.gameObject.GetComponent('TextMeshProUGUI');
  if(t)ctx.onFrame.push(()=>{textStyle(t,15,true);t.horizontalAlignment=2;t.verticalAlignment=512;t.enableWordWrapping=false;});
}
// a frame inside a tab keeps the tab's screen anchor (the bar is bottom-anchored)
const at=(r,x,y,w,h)=>({x,y,w,h,anchor:r.anchor});
/** world navigation arrow (Home and the transition screen): always shown, dimmed and inert where there is no world
 *  to go to. Updated every frame: the selection changes while the transition screen stays up on a locked world.
 *  `hidden`: while true the arrow is invisible and inert. Home's own arrows give way to the transition screen's while a
 *  locked world is shown (one pair only), and those are hidden off Home. */
export function worldArrow(nav,name,navLogic,hidden=()=>false){
  const button=nav?.gameObject.GetComponent('Button'),image=nav?.Find('Arrow')?.gameObject.GetComponent('Image');
  return ()=>{
    const selected=navLogic?.constructor?.localWorldSelected ?? 0;
    nav?.gameObject.SetActive(true);
    if(hidden()){
      if(button?.interactable)button.interactable=false;
      if(image && image.color.a!==0)image.color=color('#ffffff',0);
      return;
    }
    const highest=WorldManager.Instance?.HighestWorldIndex ?? selected;
    const unlocked=PlayerRankManager.Instance?.IsWorldNavigationUnlocked ?? false;
    const can=!!(name==='Left'?(unlocked && navLogic?.tutorialAllows && selected>0):selected<highest);
    if(button && button.interactable!==can)button.interactable=can;
    const c=color('#ffffff',can?1:.35);if(image && !image.color.equals(c))image.color=c;
  };
}
function heavy(t,size){textStyle(t,size,true);}
// The tab bar reads as one arrow (docs/ui/ref/home.png): pointed ends, leaning sides mirrored on the right, centre tab.
function tabShape(tab,shape,mirror){const img=tab?.gameObject.GetComponent('Image');if(img)img._ui2Tab={shape,mirror};}
