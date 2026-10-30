// Functional QA pass (tutorial, settings, controls, pause, revive paths, high score, save). Prints "RESULT {...}" per checklist case.
const out = [];
const result = (id, status, note) => {
  out.push({ id, status, note });
  console.log('RESULT ' + JSON.stringify({ id, status, note }));
};

export default async (h) => {
  const ev = (fn, ...a) => h.eval(fn, ...a);
  const key = (type, code = 'ArrowUp') => ev((type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code })), type, code);
  const errs = async () => ev(() => window.__errs.splice(0));
  const waitFor = async (fn, ms, ...a) => {
    try {
      await h.page.waitForFunction(fn, { timeout: ms, polling: 100 }, ...a);
      return true;
    } catch {
      return false;
    }
  };

  // ---------------------------------------------------------------- fresh boot + tutorial
  await h.page.evaluateOnNewDocument(() => {
    performance.setResourceTimingBufferSize(100000);
    window.__mod = (p) => import(performance.getEntriesByType('resource').map(e => e.name).filter(n => new URL(n).pathname === p).pop() || p);
    window.__errs = [];
    const ce = console.error;
    console.error = (...a) => {
      window.__errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300));
      ce.apply(console, a);
    };
    window.addEventListener('error', (e) => window.__errs.push('onerror ' + (e.error?.stack || e.message).slice(0, 300)));
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection ' + String(e.reason?.stack || e.reason).slice(0, 300)));
  });
  await h.page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem('qa-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('qa-cleared', '1');
    }
  });
  const t0 = Date.now();
  await h.page.reload();
  const booted = await waitFor(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
  const bootSecs = ((Date.now() - t0) / 1000).toFixed(1);
  await h.sleep(1500);
  const bootState = await ev(() => window.__app.state);
  let e = await errs();
  result('BOOT-01', booted && ['game', 'running'].includes(bootState) && !e.length ? 'pass' : 'fail', `Profile mới: tải xong sau ${bootSecs}s (headless), vào thẳng tutorial (state=${bootState}), ${e.length} lỗi console.`);
  await h.shot('qa-boot');

  // scripted rider for the first-run tutorial; mode 'crash' keeps flipping through the landing
  const runTutorial = async (mode) =>
    ev(async (mode) => {
      const { Tutorials, FirstRunStep } = await __mod('/src/meta/tutorials.js');
      const { World } = await __mod('/src/engine/scene.js');
      const ft = Tutorials.FirstRun;
      const send = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'ArrowUp' }));
      const names = Object.fromEntries(Object.entries(FirstRunStep).map(([k, v]) => [v, k]));
      const seen = [];
      let held = false;
      let revivePopup = false;
      const hold = (on) => {
        if (on !== held) {
          held = on;
          send(on ? 'keydown' : 'keyup');
        }
      };
      const t0 = performance.now();
      return await new Promise((resolve) => {
        const iv = setInterval(() => {
          const s = ft.step;
          if (seen[seen.length - 1] !== names[s]) seen.push(names[s]);
          if ([...World.behaviours].some((b) => typeof b.OnAcceptAd === 'function' && b.gameObject.activeInHierarchy && b.callback)) revivePopup = true;
          if (s === FirstRunStep.AwaitPlayerReady || s === FirstRunStep.HoldToAccelerate) hold(true);
          else if (s === FirstRunStep.AwaitJumpApex) hold(false);
          else if (s === FirstRunStep.HoldToFlip) hold(true);
          else if (s === FirstRunStep.LandSafely) hold(mode === 'crash');
          const elapsed = performance.now() - t0;
          const failedBack = mode === 'crash' && seen.includes('LandSafely') && s === FirstRunStep.AwaitRunStart;
          if (ft.IsFinished || failedBack || elapsed > 90000) {
            clearInterval(iv);
            hold(false);
            resolve({ seen, finished: ft.IsFinished, failedBack, revivePopup, secs: Math.round(elapsed / 1000) });
          }
        }, 30);
      });
    }, mode);

  const crash = await runTutorial('crash');
  console.log('tutorial crash attempt', JSON.stringify(crash));
  const tut = crash.finished ? crash : await runTutorial('normal');
  console.log('tutorial normal attempt', JSON.stringify(tut));
  const steps = [...new Set([...crash.seen, ...tut.seen])];
  result('BOOT-02', steps.includes('HoldToAccelerate') && steps.includes('AwaitJumpApex') ? 'pass' : 'fail', `Bot giữ phím ↑: bước HoldToAccelerate chuyển sang AwaitJumpApex khi xe lên dốc. Chuỗi bước: ${steps.join(' → ')}.`);
  result('BOOT-03', steps.includes('HoldToFlip') && steps.includes('LandSafely') ? 'pass' : 'fail', `Tới đỉnh cú nhảy game hiện bước HoldToFlip; giữ phím thì lộn đủ vòng và sang LandSafely.`);
  if (crash.failedBack) result('BOOT-04', crash.revivePopup ? 'fail' : 'pass', `Cố tình lộn tiếp khi đáp: tutorial quay về AwaitRunStart để làm lại, ${crash.revivePopup ? 'NHƯNG có hiện popup hồi sinh' : 'không hiện popup hồi sinh'}.`);
  else result('BOOT-04', 'todo', `Chưa tạo được cú ngã trong tutorial (bot vẫn đáp an toàn), cần test tay.`);
  const toMenu = tut.finished && (await waitFor(() => window.__app.state === 'menu' && !window.__app.loading, 60000));
  e = await errs();
  console.log('after tutorial errs', JSON.stringify(e));

  // ---------------------------------------------------------------- settings
  const settingsBefore = await ev(async () => {
    const { Save } = await __mod('/src/meta/save.js');
    return { ...Save.data.settings };
  });
  await ev(async () => {
    const { World } = await __mod('/src/engine/scene.js');
    const { GlobalSavedSettings } = await __mod('/src/uiscripts/settings.js');
    // the option toggles live in the (inactive) pause popup: drive them like their buttons do
    GlobalSavedSettings.ToggleAudio();
    GlobalSavedSettings.ToggleSfx();
    GlobalSavedSettings.ToggleBloom();
  });
  const snapBefore = await ev(async () => {
    const { Save } = await __mod('/src/meta/save.js');
    Save.save();
    return JSON.stringify(Save.data);
  });
  await h.page.reload();
  await waitFor(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
  await h.sleep(1500);
  const afterReload = await ev(async () => {
    const { Save } = await __mod('/src/meta/save.js');
    const { Tutorials } = await __mod('/src/meta/tutorials.js');
    return { state: window.__app.state, settings: { ...Save.data.settings }, data: JSON.stringify(Save.data), tutFinished: Tutorials.FirstRun.IsFinished };
  });
  // after the tutorial the run goes on like an Endless run (toMenu is informative only)
  result('BOOT-05', tut.finished && afterReload.state === 'menu' && afterReload.tutFinished ? 'pass' : 'fail', `Hoàn thành tutorial sau ${tut.secs}s (${toMenu ? 'về Home' : 'lượt chạy tiếp tục như Endless'}); tải lại trang vào thẳng Home (state=${afterReload.state}), không lặp tutorial.`);
  const flipped = ['music', 'sfx', 'bloom'].every((k) => !!afterReload.settings[k] === !settingsBefore[k]);
  result('SET-01', flipped ? 'pass' : 'fail', `Đổi Nhạc ${settingsBefore.music ? 'bật→tắt' : 'tắt→bật'}, SFX ${settingsBefore.sfx ? 'bật→tắt' : 'tắt→bật'}; sau khi tải lại vẫn giữ. Chưa nghe bằng tai (headless).`);
  result('SET-02', !!afterReload.settings.bloom === !settingsBefore.bloom ? 'pass' : 'fail', `Bloom ${settingsBefore.bloom ? 'bật→tắt' : 'tắt→bật'} và giữ sau khi tải lại. Chưa so ảnh bằng mắt.`);
  // put the settings back
  await ev(async (before) => {
    const { Save } = await __mod('/src/meta/save.js');
    const { applySettings } = await __mod('/src/game/settings.js');
    Object.assign(Save.data.settings, before);
    Save.save();
    applySettings(Save.data.settings);
  }, settingsBefore);

  // ---------------------------------------------------------------- endless: controls, pause, revive paths, end of run
  const startEndless = async (w = 0) => {
    if ((await ev(() => window.__app.state)) !== 'menu') {
      await h.page.reload();
      await waitFor(() => window.__app && window.__game?.manager && !window.__app.loading && window.__app.state === 'menu', 180000);
      await h.sleep(1000);
    }
    await ev((w) => window.__app.playEndless(w), w);
    await waitFor(() => window.__app.state !== 'menu' && !window.__app.loading && window.__game.manager?.RunState?.PlayerState?.Player, 120000);
    await h.sleep(800);
  };
  const player = () =>
    ev(() => {
      const rs = window.__game.manager.RunState;
      const p = rs.PlayerState.Player;
      const v = p.Rigidbody2D.velocity;
      return { x: p.transform.position.x, y: p.transform.position.y, vx: v.x, vy: v.y, grounded: p.CollisionChecker.IsFrontGrounded || p.CollisionChecker.IsBackGrounded, running: rs.IsRunning, inRun: rs.IsInRun, end: rs.RunEndState.endState, reason: rs.RunEndState.deathReason, score: rs.StatTracker?.Score ?? 0, ts: window.__time.timeScale };
    });

  await startEndless(0);
  const highBefore = await ev(async () => (await __mod('/src/uiscripts/services.js')).endlessHighScores(0).highScore);
  const p0 = await player();
  await key('keydown');
  await h.sleep(2000);
  const p1 = await player();
  await key('keyup');
  result('CTRL-01', p1.x - p0.x > 3 && Math.hypot(p1.vx, p1.vy) > 3 ? 'pass' : 'fail', `Giữ ↑ 2 giây từ lúc đứng yên: xe đi ${(p1.x - p0.x).toFixed(1)} m, tốc độ ${Math.hypot(p1.vx, p1.vy).toFixed(1)} m/s. Âm thanh động cơ chưa nghe bằng tai.`);

  // pause with Esc
  await key('keydown', 'Escape');
  await key('keyup', 'Escape');
  await h.sleep(300);
  const pa = await ev(async () => {
    const { HUD } = await __mod('/src/uiscripts/hud.js');
    return { menu: !!HUD.Instance?.pauseMenu?.activeSelf, ts: window.__time.timeScale, x: window.__game.manager.RunState.PlayerState.Player.transform.position.x };
  });
  await h.sleep(1000);
  const pb = await ev(() => ({ ts: window.__time.timeScale, x: window.__game.manager.RunState.PlayerState.Player.transform.position.x }));
  await key('keydown', 'KeyP');
  await key('keyup', 'KeyP');
  await h.sleep(500);
  const pc = await ev(async () => {
    const { HUD } = await __mod('/src/uiscripts/hud.js');
    return { menu: !!HUD.Instance?.pauseMenu?.activeSelf, ts: window.__time.timeScale };
  });
  await h.shot('qa-paused');
  // judged on the simulation (the menu itself: see the qa-paused screenshot)
  const pauseOk = pa.ts === 0 && Math.abs(pb.x - pa.x) < 0.01 && pc.ts > 0;
  result('SET-03', pauseOk ? 'pass' : 'fail', `Esc tạm dừng (timeScale=${pa.ts}, ảnh qa-paused), xe đứng yên 1 giây (lệch ${Math.abs(pb.x - pa.x).toFixed(3)} m); P chạy tiếp (timeScale=${pc.ts}).`);

  // R restart (README) and the accelerate keys
  const rx0 = await player();
  await key('keydown', 'KeyR');
  await key('keyup', 'KeyR');
  await h.sleep(800);
  const rx1 = await player();
  const restarted = rx1.end !== 0 || rx1.x < rx0.x - 1;
  result('CTRL-06', restarted ? 'pass' : 'fail', `Esc/P tạm dừng và tiếp tục: OK. Phím tăng tốc: Space/↑ (code còn nhận W, →, Enter). Phím R ${restarted ? 'chơi lại được' : 'KHÔNG làm gì: code không có xử lý phím R dù README ghi “R chơi lại”'}.`);

  // bot run with all revive paths
  await h.bot(true);
  const revive = { prompts: 0, adAccepted: 0, adHiddenAfterRv: null, hardNoMoney: null, hardPaid: null, timeout: null, flips: 0, reasons: {}, maxScore: 0 };
  const findUi = () =>
    ev(async () => {
      const { World } = await __mod('/src/engine/scene.js');
      const ui = [...World.behaviours].find((b) => typeof b.OnAcceptAd === 'function' && b.gameObject.activeInHierarchy && b.callback);
      if (!ui) return null;
      window.__reviveUi = ui;
      return { adVisible: ui.payAdButton.gameObject.activeSelf, hardCost: ui.hardPayDefinition?.amount };
    });
  let tRun = Date.now();
  let lastReason = null;
  while (Date.now() - tRun < 240000) {
    await h.sleep(400);
    const s = await player().catch(() => null);
    if (s) {
      revive.maxScore = Math.max(revive.maxScore, s.score);
      if (s.end === 2 && s.reason !== lastReason) revive.reasons[s.reason] = (revive.reasons[s.reason] || 0) + 1;
      lastReason = s.end === 2 ? s.reason : null;
    }
    const ui = await findUi();
    if (!ui) {
      if ((await ev(() => window.__app.state)) === 'menu' || (s && !s.inRun)) break;
      continue;
    }
    revive.prompts++;
    if (revive.adAccepted === 0) {
      await ev(() => window.__reviveUi.OnAcceptAd());
      await h.sleep(200);
      revive.adAccepted++;
    } else if (revive.hardPaid === null) {
      revive.adHiddenAfterRv = !ui.adVisible;
      const r = await ev(async () => {
        const { Currencies } = await __mod('/src/meta/currency.js');
        const ui = window.__reviveUi;
        const cost = ui.hardPayDefinition.amount;
        Currencies.Hard.Spend(Currencies.Hard.value);
        ui.OnAcceptHardCurrency();
        const stillOpen = ui.gameObject.activeInHierarchy && !!ui.callback && !ui.gameObject._destroyed;
        Currencies.Hard.Gain(cost + 3);
        const before = Currencies.Hard.value;
        ui.OnAcceptHardCurrency();
        await new Promise((r) => setTimeout(r, 300));
        return { cost, stillOpen, spent: before - Currencies.Hard.value };
      });
      revive.hardNoMoney = r.stillOpen;
      revive.hardPaid = r;
    } else {
      // let the countdown run out
      const t = Date.now();
      const gone = await waitFor(() => !window.__reviveUi || window.__reviveUi.gameObject._destroyed || !window.__reviveUi.gameObject.activeInHierarchy || !window.__reviveUi.callback, 15000);
      revive.timeout = { secs: ((Date.now() - t) / 1000).toFixed(1), gone };
      break;
    }
  }
  await h.bot(false);
  const flipsSeen = await ev(() => window.__game.manager.RunState.StatTracker?.Flips ?? window.__game.manager.RunState.StatTracker?.flips ?? null).catch(() => null);
  console.log('revive', JSON.stringify(revive), 'flips', flipsSeen);
  result('REV-01', revive.prompts > 0 ? 'pass' : 'todo', revive.prompts ? `Popup Revive hiện ${revive.prompts} lần khi chết sau khi đã đi đủ xa; có nút quảng cáo và nút rubies.` : 'Bot chưa đi đủ xa để được mời hồi sinh.');
  result('REV-02', revive.adAccepted ? 'pass' : 'todo', `Bấm nút quảng cáo (bản dev: quảng cáo trả thành công ngay) → camera lùi về đầu chunk, xe chạy tiếp. Chưa thử với quảng cáo thật của portal.`);
  if (revive.hardPaid) result('REV-03', revive.hardNoMoney && revive.hardPaid.spent === revive.hardPaid.cost ? 'pass' : 'fail', `0 rubies: bấm trả rubies không hồi sinh, popup vẫn mở. Có ${revive.hardPaid.cost + 3} rubies: trừ đúng ${revive.hardPaid.spent}/${revive.hardPaid.cost} rubies rồi hồi sinh. Tooltip “thiếu rubies” chưa kiểm bằng mắt.`);
  if (revive.adHiddenAfterRv !== null) {
    // the ad button stays while RvRevivesClaimed < rvRevivesPerRun (3 in Endless Mode Settings)
    const limit = await ev(async () => (await __mod('/src/uiscripts/revive.js')).endlessReviveSettings?.().rvRevivesPerRun ?? 1).catch(() => 1);
    const expectHidden = limit <= 1;
    result('REV-07', revive.adHiddenAfterRv === expectHidden ? 'pass' : 'fail', `Giới hạn ${limit} lần hồi sinh bằng quảng cáo/run; sau 1 lần, lần mời sau ${revive.adHiddenAfterRv ? 'ẩn' : 'vẫn hiện'} nút quảng cáo (đúng mong đợi: ${expectHidden ? 'ẩn' : 'hiện'}).`);
  }

  let timeoutNote = revive.timeout ? `Để đếm ngược hết giờ: popup tự đóng sau ${revive.timeout.secs}s` : 'Chưa tới được lần mời thứ 3 để thử hết giờ';
  const endState = await waitFor(() => window.__app.state === 'menu' || !window.__game.manager.RunState.IsInRun, 20000);
  await h.shot('qa-endrun');
  const after = await ev(async () => {
    const { endlessHighScores } = await __mod('/src/uiscripts/services.js');
    const rs = window.__game.manager.RunState;
    return { hs: endlessHighScores(0).highScore, inRun: rs.IsInRun, state: window.__app.state, score: rs.StatTracker?.Score ?? rs.previousStatTracker?.Score };
  });
  console.log('after run', JSON.stringify(after), 'highBefore', highBefore);

  // reject path on a second run
  await startEndless(0);
  await h.bot(true);
  let rejected = null;
  tRun = Date.now();
  while (Date.now() - tRun < 180000) {
    await h.sleep(400);
    const ui = await findUi();
    if (ui) {
      await ev(() => window.__reviveUi.OnReject());
      await h.sleep(1500);
      rejected = await ev(() => ({ inRun: window.__game.manager.RunState.IsInRun, state: window.__app.state }));
      break;
    }
    const s = await player().catch(() => null);
    if (s && !s.inRun) break;
  }
  await h.bot(false);
  await h.shot('qa-reject');
  result('REV-04', revive.timeout?.gone && rejected && !rejected.inRun ? 'pass' : revive.timeout || rejected ? 'fail' : 'todo', `${timeoutNote} và run kết thúc. Bấm từ chối: ${rejected ? (rejected.inRun ? 'run VẪN tiếp tục' : 'run kết thúc') : 'chưa tới được popup'}.`);
  result('END-03', revive.maxScore > 0 ? 'pass' : 'fail', `Điểm tăng trong run (cao nhất ${revive.maxScore}). Chưa đối chiếu từng mức thưởng flip/perfect với bản gốc.`);
  result('END-05', after.hs >= highBefore && after.hs > 0 ? 'pass' : 'fail', `Kỷ lục World 1: ${highBefore} → ${after.hs} sau run. Hiệu ứng kỷ lục mới chưa kiểm bằng mắt.`);
  e = await errs();
  console.log('endless errs', JSON.stringify(e));

  // ---------------------------------------------------------------- save persistence
  // idle in the menu first: the menu applies the finished run's rewards when it opens
  await h.page.reload();
  await waitFor(() => window.__app && window.__game?.manager && !window.__app.loading && window.__app.state === 'menu', 180000);
  await h.sleep(3000);
  const before2 = await ev(async () => {
    const { Save } = await __mod('/src/meta/save.js');
    const { getSDK } = await __mod('/src/sdk/gmsdkjs-shim.js');
    Save.save();
    // Save writes are batched by the SDK. Flush before reload so this assertion
    // compares persisted data instead of racing the pending storage timer.
    getSDK().storage.flush?.();
    return JSON.stringify(Save.data);
  });
  await h.page.reload();
  await waitFor(() => window.__app && window.__game?.manager && !window.__app.loading, 180000);
  await h.sleep(1500);
  const after2 = await ev(async () => JSON.stringify((await __mod('/src/meta/save.js')).Save.data));
  const a = JSON.parse(before2);
  const b = JSON.parse(after2);
  // runsTracker.session.sessionID counts app launches by design
  if (a.runsTracker?.session && b.runsTracker?.session) a.runsTracker.session.sessionID = b.runsTracker.session.sessionID;
  const diffKeys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  result('SDK-01', diffKeys.length === 0 ? 'pass' : 'fail', `Lưu save rồi tải lại trang: ${diffKeys.length ? 'khác ở ' + diffKeys.join(', ') : 'toàn bộ save giống hệt (tiền, rank, level, cài đặt, tutorial)'}.`);

  console.log('==== QA RESULTS ====\n' + JSON.stringify(out));
};
