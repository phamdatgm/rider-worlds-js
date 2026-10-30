// Screenshots of every main UI screen for docs/ui/index.html (ReskinUI stage 1).
// Run with the dev server up:  node tools/scenario.mjs docs/ui/ui_shots.mjs docs/ui/shots-raw
// then  node docs/ui/ui_index.mjs  turns docs/ui/shots-raw/NN.png into docs/ui/shots/NN.jpg and rebuilds index.html.
// ONLY=03,09 limits the run to those screens (the boot steps always run).

export default async (h) => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (id) => !only || only.includes(id);
  const ev = (fn, ...a) => h.eval(fn, ...a);
  const shot = async (id) => {
    await h.shot(id);
    console.log('SHOT ' + id);
  };
  // the dev server imports modules changed since it started with ?t=<time>: a plain import('/src/x.js') would load a
  // second copy of the module, so __mod imports the exact URL the game loaded
  await h.page.evaluateOnNewDocument(() => {
    performance.setResourceTimingBufferSize(100000);
    window.__mod = (p) => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname === p).pop();
      return import(url || p);
    };
  });
  await h.page.reload();

  // ---------------------------------------------------------------- the kit's loading screen: the game entry never arrives
  if (want('01')) {
    const p = await h.page.browser().newPage();
    await p.setViewport({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
    await p.setRequestInterception(true);
    p.on('request', (r) => (/\/src\/main\.js/.test(r.url()) ? null : r.continue()));
    p.goto(h.page.url()).catch(() => {});
    await h.sleep(4000);
    await p.screenshot({ path: 'docs/ui/shots-raw/01.png' });
    console.log('SHOT 01');
    await p.close();
  }

  // ---------------------------------------------------------------- a new player: the first-run tutorial
  await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
  if (want('17')) {
    await h.sleep(5000);
    await shot('17');
  }

  // ---------------------------------------------------------------- a returning player at a rank that opens every page
  // (tools/qa/common.mjs boot() without the flush: sdk.storage writes are batched)
  await ev(async () => {
    const { Tutorials } = await __mod('/src/meta/tutorials.js');
    const { Save } = await __mod('/src/meta/save.js');
    const { getSDK } = await __mod('/src/sdk/gmsdkjs-shim.js');
    for (const t of Tutorials.all) Save.data.tutorials[t.SaveName] = 2;
    if (!Tutorials.all.length) throw new Error('no tutorials: module copy?');
    Save.save();
    getSDK().storage.flush?.();
  });
  await h.page.reload();
  await h.wait(() => window.__app && window.__game?.manager && !window.__app.loading && window.__app.state === 'menu', 180000);
  await h.sleep(1500);
  await ev(async () => {
    const { World } = await __mod('/src/engine/scene.js');
    const { SceneHost } = await __mod('/src/uiscripts/scenes.js');
    window.__q = {
      all: (type) => [...World.behaviours].filter((b) => b.constructor.typeName === type || b.constructor.name === type),
      active: (type) => window.__q.all(type).filter((b) => b.gameObject.activeInHierarchy && !b.gameObject._destroyed),
      /** a GameObject of the menu scene by its path under a scene root */
      find: (path) => {
        const landscapePath = path.replace('UI Container/BodyContainer/PageContainer/Home Screen/BottomContainer/', 'UI Container/BodyContainer/BottomButtonContainer/');
        for (const r of SceneHost.menuRoot?._sceneRoots || []) {
          const t = r.transform.Find(path) || r.transform.Find(landscapePath);
          if (t) return t.gameObject;
        }
        return null;
      },
      press: (path) => {
        const go = window.__q.find(path);
        const b = go?.GetComponent('Button');
        if (!b) return 'missing ' + path;
        b.Press();
        return 'ok';
      },
    };
  });
  const dismiss = async () => {
    for (let i = 0; i < 30; i++) {
      const busy = await ev(async () => {
        const { UIStatics } = await __mod('/src/uiscripts/statics.js');
        const pop = window.__q.active('PlayerRankUpPopupUI')[0];
        if (pop) {
          pop.ContinuePressed?.();
          return 'rankup';
        }
        if (window.__q.active('UI_LootboxOpenAnimation')[0]) return 'lootbox';
        if (window.__q.active('UI_RewardTrack')[0] && UIStatics.RewardTrackOpen) return 'track';
        return UIStatics.RankUpPopup.IsOpenOrActive ? 'rankflag' : null;
      });
      if (!busy) return;
      if (busy === 'lootbox') await h.page.mouse.click(640, 400);
      if (busy === 'track') await ev(() => window.__q.active('UI_RewardTrack')[0].Close?.());
      await h.sleep(600);
    }
  };
  // rank 12: shop, garage, levels, bonus and the world arrows are open
  const rankUp = async (target) => {
    for (let n = 0; n < 40; n++) {
      const r = await ev(async (target) => {
        const { PlayerRank } = await __mod('/src/meta/rank.js');
        if (PlayerRank.CurrentRank >= target) return -1;
        PlayerRank.AddStars(PlayerRank.CurrentStarsRequired - PlayerRank.CurrentRankStars);
        return PlayerRank.CurrentRank;
      }, target);
      if (r < 0) break;
      await h.sleep(1200);
      if (n === 0 && want('12')) { await h.sleep(1500); await shot('12'); }
      await dismiss();
    }
  };
  await rankUp(12);
  await ev(async () => {
    const { Currencies } = await __mod('/src/meta/currency.js');
    Currencies.Soft.Gain(4800, 'shots');
    Currencies.Hard.Gain(200, 'shots');
  });
  await h.sleep(2500);
  const page = async (name) => {
    const r = await ev(async (name) => {
      const { MainMenuManager } = await __mod('/src/uiscripts/home.js');
      const mm = MainMenuManager.Instance;
      const s = mm.switchers.find((x) => (x.menuScreen?.gameObject?.name || '').toLowerCase().includes(name));
      if (!s) return 'missing';
      mm.DoMenuSwitch(s);
      return mm.currentMenu === s ? 'ok' : 'blocked';
    }, name);
    await h.sleep(1800);
    return r;
  };
  const home = 'UI Container/BodyContainer/PageContainer/Home Screen';

  // Home opens the challenge overlay by itself when a challenge is waiting: closed for 03, opened for 04
  const challenges = async () => {
    await ev(() => {
      const o = window.__q.all('UI_ChallengeOverlay')[0];
      if (o?.gameObject.activeInHierarchy) o.TryClose();
    });
    await h.sleep(1800);
  };
  if (want('03')) {
    await page('home');
    await challenges();
    await shot('03');
  }
  if (want('04')) {
    await page('home');
    await challenges();
    console.log('04', await ev((p) => window.__q.press(p + '/BottomContainer/ChallengeButton'), home));
    await h.sleep(1800);
    await shot('04');
    await ev(() => window.__q.active('UI_ChallengeOverlay')[0]?.TryClose());
    await h.sleep(1200);
  }
  if (want('05')) {
    console.log('05', await ev((p) => window.__q.press(p + '/BottomContainer/LevelsButton'), home));
    await h.sleep(1800);
    await shot('05');
    await ev(() => window.__q.active('UI_TimedLevelMenu')[0]?.TryClose());
    await h.sleep(1200);
  }
  if (want('06')) {
    console.log('06', await ev(() => window.__q.press('UI Container/TopContainer/WorldStatsButton')));
    await h.sleep(1800);
    await shot('06');
    await ev(() => window.__q.active('UI_WorldStatsMenu')[0]?.TryClose());
    await h.sleep(1200);
  }
  if (want('07')) {
    await page('home');
    console.log('07', await ev(() => {
      const opener = window.__q.all('UI_OpenRewardTrack')[0];
      if (opener) return opener.OpenTrack(), 'opener';
      const t = window.__q.all('UI_RewardTrack')[0];
      if (!t) return 'missing';
      if (!t.gameObject.activeInHierarchy) t.Open(false);
      return 'track';
    }));
    await h.sleep(2500);
    await shot('07');
    await ev(() => window.__q.active('UI_RewardTrack')[0]?.Close?.());
    await h.sleep(1200);
  }
  if (want('08')) {
    console.log('08', await page('meta'));
    await shot('08');
  }
  if (want('09')) {
    console.log('09', await page('shop'));
    await shot('09');
  }
  if (want('10')) {
    await page('home');
    console.log('10', await ev(() => window.__q.press('UI Container/TopContainer/SettingsButton')));
    await h.sleep(1500);
    await shot('10');
    await ev(() => window.__q.active('UI_PauseMenu')[0]?.OnPressedResume());
    await h.sleep(800);
  }
  if (want('11')) {
    await page('home');
    // The live SDK may leave this button non-interactable while its local provider is
    // unavailable. The verification wrapper installs a deterministic provider in
    // h.shot('11'), so only wait for the real uGUI Button to exist here.
    await h.wait(()=>!!window.__q.find('UI Container/BodyContainer/PageContainer/Home Screen/TopContainer/LeaderboardButton')?.GetComponent('Button'),10000);
    console.log('11', await ev(() => window.__q.press('UI Container/BodyContainer/PageContainer/Home Screen/TopContainer/LeaderboardButton')));
    await h.sleep(2500);
    await shot('11');
    await h.page.keyboard.press('Escape');
    await ev(() => document.querySelector('[class*=leaderboard] [class*=close], [class*=lb] [class*=close]')?.click());
    await h.sleep(800);
  }
  if (want('13')) {
    await page('home');
    await challenges();
    console.log('13', await ev(() => {
      const { Currencies } = window.__meta;
      Currencies.Bonus.Gain(5 - Currencies.Bonus.value, 'shots');
      const b = window.__q.all('UI_MainMenuBonusButton')[0];
      if (!b) return 'missing';
      b.UpdateBonusRideButton?.();
      b.OnBonusButtonClicked();
      return 'ok';
    }));
    await h.sleep(2000);
    await shot('13');
    await ev(() => window.__q.active('UI_ClaimBonusOverlay')[0]?.TryClose?.());
    await h.sleep(1000);
  }
  if (want('14')) {
    await page('home');
    await ev(async () => {
      const { LootboxService } = await __mod('/src/meta/lootbox.js');
      const { Meta } = await __mod('/src/meta/data.js');
      LootboxService.AddToQueue(Object.keys(Meta.data.lootboxes.boxes)[0], 'shots');
    });
    await h.sleep(3500);
    await shot('14');
    await dismiss();
  }

  if (want('02')) {
    await page('home');
    await challenges();
    console.log('02', await ev((p) => window.__q.press(p + '/WorldNav/Right'), home));
    await h.sleep(Number(process.env.T02 || 700));
    await shot('02');
    await h.sleep(3000);
    await ev((p) => window.__q.press(p + '/WorldNav/Left'), home);
    await h.sleep(3000);
  }

  // ---------------------------------------------------------------- in a run
  if (want('15') || want('16') || want('18')) {
    await ev(() => window.__app.playEndless(0));
    await h.wait(() => window.__app.state === 'running' && !window.__app.loading, 120000);
    await h.bot(true);
    await h.sleep(5000);
    if (want('15')) await shot('15');
    if (want('16')) {
      await h.page.keyboard.press('Escape');
      await h.sleep(1000);
      await shot('16');
      await h.page.keyboard.press('Escape');
      await h.sleep(500);
    }
    if (want('18')) {
      await h.bot(false);
      await ev(() => {
        const hud = window.__q.all('HUD')[0];
        hud?.OpenRevivalPrompt();
      });
      await h.sleep(2500);
      await shot('18');
    }
  }
};
