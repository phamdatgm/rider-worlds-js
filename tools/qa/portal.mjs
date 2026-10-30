// GMSDK_JS wiring on the dev page (test ads of Google): node tools/scenario.mjs tools/qa/portal.mjs <outDir>
// Settings footer, screen / feature tracking, the kit's leaderboard screen from the Home button, the pause around a
// rewarded ad and around the run_end interstitial. Prints PASS / FAIL lines; tracked events land in <outDir>/track.txt.
import fs from 'node:fs';
import path from 'node:path';
import { boot } from './common.mjs';

export default async function (h) {
  const out = process.argv[3] || 'scenario-out';
  const tracked = [];
  await h.page.exposeFunction('__qaTrack', (name, params) => tracked.push(`${name} ${JSON.stringify(params)}`));
  await h.page.evaluateOnNewDocument(() => {
    let real;
    Object.defineProperty(window, 'GMSDKJS', {
      configurable: true,
      get: () => real,
      set(v) {
        real = v;
        const track = v?.track?.bind(v);
        if (track)
          v.track = (n, p) => {
            window.__qaTrack(n, p ?? null);
            return track(n, p);
          };
      },
    });
  });
  const results = [];
  const check = (id, ok, note) => {
    results.push(`${ok ? 'PASS' : 'FAIL'} ${id} ${note}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${note}`);
  };
  const frames = () => h.eval(() => window.__time.frameCount);

  await boot(h);
  await h.sleep(1500);

  // Settings footer: V<version> of game.json + the kit's copyright line
  const footer = await h.eval(async () => (await __mod('/src/portal.js')).footerText());
  const version = JSON.parse(fs.readFileSync('public/game.json', 'utf8')).version;
  check('FOOTER', footer === `V${version}\n© 2026 Azgames.io`, JSON.stringify(footer));

  // the Home page is tracked as a screen
  // the challenges overlay opens by itself on Home when a challenge starts
  check('SCREEN-MENU', tracked.some((t) => /^screen_view \{"screen":"(home|challenges)"/.test(t)), 'screen_view home / challenges');

  // the crown button opens the kit's leaderboard screen; Esc closes it
  const opened = await h.eval(() => {
    const root = window.__scenes.menuRoot;
    const roots = root?._sceneRoots || [root];
    for (const r of roots) for (const b of r?.GetComponentsInChildren('Button', true) ?? []) if (b.gameObject.name === 'LeaderboardButton') {
      b.onClick.Invoke();
      return true;
    }
    return false;
  });
  await h.sleep(1500);
  const overlay = await h.eval(() => !!document.querySelector('.gmlb'));
  await h.shot('leaderboard');
  check('LB-OPEN', opened && overlay, `button ${opened}, overlay ${overlay}`);
  await h.sleep(1000);
  check('SCREEN-LB', tracked.some((t) => t.startsWith('screen_view {"screen":"leaderboard"')) && tracked.some((t) => t.startsWith('feature_open {"feature":"leaderboard"')), 'screen_view + feature_open leaderboard');
  await h.page.keyboard.press('Escape');
  await h.sleep(500);
  check('LB-CLOSE', !(await h.eval(() => !!document.querySelector('.gmlb'))), 'Esc closes the screen');

  // run_end interstitial: never after the first run of the session, then the SDK's spacing decides
  const before = tracked.filter((t) => t.startsWith('ad_interstitial')).length;
  await h.eval(async () => {
    const { Ads } = await __mod('/src/ads.js');
    Ads.runEnded(false);
  });
  await h.sleep(2000);
  const afterFirst = tracked.filter((t) => t.startsWith('ad_interstitial')).length;
  check('INTER-FIRST-RUN', afterFirst === before, 'no interstitial after the first run');
  await h.eval(async () => {
    const { Ads } = await __mod('/src/ads.js');
    Ads.runEnded(false);
  });
  // the SDK sends ad_interstitial when the ad is over, which Google's test ad never is headless: judged on the pause
  await h.sleep(5000);
  const g1 = await frames();
  await h.sleep(1500);
  const g2 = await frames();
  await h.shot('interstitial');
  const inter = tracked.filter((t) => t.startsWith('ad_interstitial')).slice(-1)[0] ?? '';
  check('INTER-RUN-END', g1 === g2 || inter.includes('run_end'), `game paused under the ad (frames ${g1} -> ${g2}) ${inter}`);

  // a fresh page for the rewarded ad (the test interstitial above may still be up)
  await boot(h);
  await h.sleep(1500);

  // rewarded: the game stands still while the ad is up (test ads may not end headless: only the pause is checked)
  await h.wait(() => window.GMSDKJS?.rewardedAvailable?.(), 30000).catch(() => {});
  const available = await h.eval(() => !!window.GMSDKJS?.rewardedAvailable?.());
  check('RV-AVAILABLE', available, `rewardedAvailable ${available}`);
  if (available) {
    await h.eval(async () => {
      const { Ads } = await __mod('/src/ads.js');
      window.__rv = 'pending';
      Ads.rewarded('qa_test').then((r) => (window.__rv = r));
    });
    await h.sleep(3000);
    const f1 = await frames();
    await h.sleep(1500);
    const f2 = await frames();
    await h.shot('rewarded');
    check('RV-PAUSE', f1 === f2 || (await h.eval(() => window.__rv)) !== 'pending', `frames ${f1} -> ${f2}, result ${await h.eval(() => window.__rv)}`);
    // close the test ad if it is still up, the game must run again
    for (const sel of ['#dismiss-button', '[aria-label="Close ad"]', '.close-button']) await h.page.click(sel).catch(() => {});
    await h.page.keyboard.press('Escape');
    await h.wait(() => window.__rv !== 'pending', 40000).catch(() => {});
    const r = await h.eval(() => window.__rv);
    const f3 = await frames();
    await h.sleep(1000);
    const f4 = await frames();
    // headless: Google's test ad may never end (docs/GMSDK_JS/docs/LEADERBOARD.md §5): pending = to check by hand
    // headless Chrome: Google's test ad may never end, so the game stays paused under it: to check by hand
    if (r === 'pending') {
      results.push('TODO RV-RESUME the test ad did not end headless: check by hand');
      console.log('TODO RV-RESUME the test ad did not end headless: check by hand');
    } else check('RV-RESUME', f4 > f3, `result ${r} (0 failure, 1 closed early, 2 watched, 3 none), frames ${f3} -> ${f4}`);
  }

  fs.writeFileSync(path.join(out, 'track.txt'), tracked.join('\n'));
  fs.writeFileSync(path.join(out, 'portal-results.txt'), results.join('\n'));
}
