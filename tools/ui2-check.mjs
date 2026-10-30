// Full live-uGUI screen matrix. Run: node tools/scenario.mjs tools/ui2-check.mjs docs/ui/verification
// UI assertions use the exact module URLs Vite loaded; no duplicate runtime singletons.
import fs from 'node:fs';
import path from 'node:path';
import tour from '../docs/ui/ui_shots.mjs';

const sizes=[[1280,720],[1920,1080],[1024,768],[2560,1080],[844,390],[390,844]];
export default async function checkUI(h){
  const out=process.argv[3]||'docs/ui/verification';fs.mkdirSync(out,{recursive:true});
  const checks=[],failures=[],screens=new Set(),exceptions=[];
  h.page.on('pageerror',e=>exceptions.push(e.message));
  const shot=h.shot;
  async function inspect(screen,w,hgt){
    return h.eval(async(screen)=>{
      const {UISystem}=await __mod('/src/ugui/canvas.js');
      const {groupAlpha}=await __mod('/src/ugui/graphic.js');
      const {Time}=await __mod('/src/engine/core.js');
      UISystem.layout();
      const W=innerWidth,H=innerHeight,u=Math.min(W/1280,H/720),landscape=W>=H;
      const errors=[],mapped=[];
      if(__ui2.landscape!==landscape)errors.push('orientation did not switch');
      for(const ctx of __ui2.contexts){
        if(ctx.root._destroyed)continue;
        for(const [scaler,original] of ctx.scalers){
          const expected=landscape?[1280,720]:original.res;
          if(scaler.m_ReferenceResolution.some((v,i)=>v!==expected[i]))errors.push(ctx.root.name+' reference resolution');
        }
        if(!landscape)continue;
        for(const e of ctx.records.values()){
          // page / full-screen backdrops deliberately bleed past the design canvas (UI_SPEC §12)
          if(!e.id || ['tr.bg','ru.bg','lx.bg','sp.bg'].includes(e.id) || !e.t.gameObject.activeInHierarchy || groupAlpha(e.t)<.05)continue;
          if(ctx.root.name==='HUD' && window.__app.state==='menu')continue;
          const s=e.t.lossyScale;if(Math.abs(s.x*s.y)<.001)continue;
          const corners=e.t.GetWorldCorners();
          const actual=[Math.min(...corners.map(p=>p.x)),H-Math.max(...corners.map(p=>p.y)),Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))];
          const r=__ui2.rects[e.id];let ox=(W-1280*u)/2,oy=(H-720*u)/2;
          if(r.anchor==='top-left'){ox=0;oy=0;}
          if(r.anchor==='top-right'){ox=W-1280*u;oy=0;}
          if(r.anchor==='bottom')oy=H-720*u;
          if(r.anchor==='left')ox=0;
          if(r.anchor==='right')ox=W-1280*u;
          const expected=[ox+r.x*u,oy+r.y*u,r.w*u,r.h*u];
          const delta=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])/u));
          mapped.push({id:e.id,actual,expected,delta});
          if(delta>4.05)errors.push(e.id+' differs by '+delta.toFixed(1)+' design units');
        }
        for(const go of ctx.gos){
          if(!go.activeInHierarchy || groupAlpha(go.transform)<.05)continue;
          for(const text of go.GetComponents('TextMeshProUGUI'))if(text.enabled && text.fontSize<15)errors.push(go.name+' text below 15');
        }
      }
      const footer=[...__ui2.contexts].flatMap(c=>c.gos).filter(g=>g.name==='cpr'&&g.activeInHierarchy).map(g=>g.GetComponent('TextMeshProUGUI')?.text);
      if(screen==='10'){
        const {footerText}=await __mod('/src/portal.js');
        if(footer.length!==1 || footer[0]!==footerText())errors.push('copyright footer differs / repeated');
      }
      return {screen,width:W,height:H,landscape,mapped,errors,frame:Time.frameCount};
    },screen);
  }
  async function capture(id){
    if(id==='11')await seedBoard();
    screens.add(id);
    const time=await h.eval(async()=>{const {Time}=await __mod('/src/engine/core.js');const t=Time.timeScale;Time.timeScale=0;return t;});
    try{
      for(const [w,hgt] of sizes){
        await h.page.setViewport({width:w,height:hgt});await h.sleep(400);
        const r=await inspect(id,w,hgt);checks.push(r);
        failures.push(...r.errors.map(e=>`${id} ${w}x${hgt}: ${e}`));
        await h.page.screenshot({path:path.join(out,`${id}-${w}x${hgt}.png`)});
      }
    }finally{
      await h.page.setViewport({width:1280,height:720});await h.sleep(300);
      await h.eval(async t=>{(await __mod('/src/engine/core.js')).Time.timeScale=t;},time);
    }
    console.log('MATRIX '+id);
    if(id==='03')await buttons();
    if(id==='04')await challengeSkip();
    if(id==='09')await shopPopups();
    if(id==='11')await profile();
    if(id==='14')await cards();
  }
  h.shot=capture;
  const active=async type=>h.eval(t=>__q.active(t).length,type);
  async function buttons(){
    // Settings are changed through their original Button.Press and restored before leaving the popup.
    const r=await h.eval(async()=>{
      const {Save}=await __mod('/src/meta/save.js');
      const before={...Save.data.settings};
      const menu=[...__ui2.contexts].flatMap(c=>c.gos).find(g=>g.name==='Settings')?.GetComponent('UI_PauseMenu');
      if(!menu)return false;
      menu.gameObject.SetActive(true);
      const buttons=menu.GetComponentsInChildren('Button',true).filter(b=>/MusicToggle|SfxToggle|BloomToggle/.test(b.gameObject.name));
      for(const b of buttons)b.Press();
      const changed=buttons.length===3 && ['music','sfx','bloom'].every(k=>before[k]!==Save.data.settings[k]);
      for(const b of buttons)b.Press();menu.OnPressedResume();
      return changed;
    });
    if(!r)failures.push('settings toggle buttons did not update original settings');
  }
  async function challengeSkip(){
    await h.eval(()=>{const slot=__q.all('UI_ChallengeSlotVisualsMainMenu').find(s=>s.AssignedChallenge);slot?.OpenChallengeResetPopup();});
    await h.sleep(700);
    if(await active('UI_ChallengeResetPopup')){await capture('04b');await h.eval(()=>__q.active('UI_ChallengeResetPopup')[0].quitButton.Press());}
    else failures.push('04b could not open challenge skip popup');
  }
  async function shopPopups(){
    const opened=await h.eval(()=>{
      const item=__q.active('LootboxShopItem')[0];
      item?.shopItemUI?.PurchaseButton?.Press();
      window.__testConfirmation=item?.ConfirmationInstance;
      return !!window.__testConfirmation;
    });
    await h.sleep(600);
    const confirms=await h.eval(()=>__q.active('BaseShopItemConfirmation').length);
    if(opened||confirms){await capture('09b');await h.eval(()=>{const c=window.__testConfirmation;if(c && !c.gameObject._destroyed)c.closeButtons[0].Press();});}
    else failures.push('09b purchase confirmation was not reached');
    await h.eval(()=>__q.active('DailyDealShopSection')[0]?.refreshButton?.Press());
    await h.sleep(600);
    if(await active('UI_DailyDealShopRefreshPopUp')){await capture('09b-refresh');await h.eval(()=>__q.active('UI_DailyDealShopRefreshPopUp')[0].quitButton.Press());}
  }
  async function profile(){
    const edit=await h.page.$('.gmlb-foot button');
    if(!edit){failures.push('11b profile button unavailable');return;}
    await edit.click();await h.page.waitForSelector('.gmlb-form input');await capture('11b');
    await h.page.$eval('.gmlb-form input',n=>{n.value='Matrix_Rider';n.dispatchEvent(new Event('input',{bubbles:true}));});
    await h.eval(()=>{__testBoard.failNext=true;});
    await h.page.click('.gmlb-form button[type=submit]');await h.sleep(200);
    if(!await h.page.$eval('.gmlb-error',e=>!!e.textContent))failures.push('leaderboard save error missing');
    await h.page.click('.gmlb-form button[type=submit]');await h.sleep(250);
    if(await h.page.$('.gmlb-form'))failures.push('leaderboard profile save did not close form');
    for(const i of [0,1,2,3]){await h.page.click(`.gmlb-tabs button:nth-child(${i+1})`);await h.sleep(50);}
    await h.page.click('.gmlb-status button');await h.sleep(100);
    if(await h.page.$$eval('.gmlb-list .gmlb-row',r=>r.length)!==40)failures.push('leaderboard paging failed');
    await h.eval(async()=>{(await __mod('/src/portal.js')).Portal.board=window.__originalBoard;});
  }
  async function seedBoard(){
    // The live board can be unavailable in a local run. Close it when it did open, then replace
    // the provider with deterministic data before taking the verification capture.
    const close=await h.page.$('.gmlb-x');
    if(close)await close.click();
    else await h.page.keyboard.press('Escape');
    await h.sleep(100);
    await h.eval(async()=>{
      const {Portal}=await __mod('/src/portal.js');window.__originalBoard=Portal.board;
      let player={id:'matrix',name:'Matrix',country:'VN'};
      window.__testBoard={
        failNext:false,
        player:()=>player,
        top:async(period,{offset,limit})=>({total:45,entries:Array.from({length:Math.min(limit,45-offset)},(_,i)=>({rank:offset+i+1,playerId:'row-'+i,name:'Rider_'+(offset+i+1),country:i%2?'US':'VN',score:900-offset-i}))}),
        me:async()=>({rank:23,playerId:'matrix',name:player.name,country:player.country,score:123}),
        setPlayer:async(p)=>{if(__testBoard.failNext){__testBoard.failNext=false;return false;}player={...player,...p};return true;},
      };
      Portal.board=__testBoard;
      // Open the production overlay directly. In local/headless runs the real SDK
      // intentionally disables its uGUI button after sign-in fails, which must not
      // make visual verification depend on network availability.
      const {openLeaderboard}=await __mod('/src/ui2/leaderboard.js');
      window.__testBoardPopup=openLeaderboard({board:__testBoard});
    });
    await h.page.waitForSelector('.gmlb-x',{visible:true,timeout:10000});
    await h.sleep(200);
  }
  async function cards(){
    for(let i=0;i<20;i++){
      await h.page.mouse.click(640,400);await h.sleep(500);
      if(await active('UI_CardBase')){await capture('14b');return;}
    }
    failures.push('14b card reveal not reached');
  }
  try{await tour(h);}catch(e){failures.push(e.stack||e.message);}
  h.shot=shot;
  failures.push(...exceptions.map(e=>'page exception: '+e));
  const expected=['02','03','04','04b','05','06','07','08','09','09b','10','11','11b','12','13','14','14b','15','16','17','18'];
  for(const id of expected)if(!screens.has(id))failures.push('screen not captured: '+id);
  const report={screens:[...screens],sizes,checks,failures:[...new Set(failures)],exceptions};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`UI2 ${report.failures.length?'FAIL':'PASS'}: ${screens.size} screens, ${checks.length} captures, ${report.failures.length} failures`);
  if(report.failures.length){console.log(report.failures.join('\n'));throw new Error('UI2 verification failed; see report.json');}
}
