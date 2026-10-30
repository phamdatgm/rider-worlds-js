// Shop / Garage / Meta QA pass through the live uGUI components. Prints "RESULT {...}" per checklist case and "INFO ..." details.
import { boot } from './common.mjs';

export default async (h) => {
  const ev = (fn, ...a) => h.eval(fn, ...a);
  const info = (k, v) => console.log('INFO ' + k + ' ' + JSON.stringify(v));
  const result = (id, status, note) => console.log('RESULT ' + JSON.stringify({ id, status, note }));
  await boot(h);
  // page-side helpers
  await ev(async () => {
    const { World } = await __mod('/src/engine/scene.js');
    window.__q = {
      all: (type) => [...World.behaviours].filter((b) => b.constructor.typeName === type || b.constructor.name === type),
      active: (type) => window.__q.all(type).filter((b) => b.gameObject.activeInHierarchy && !b.gameObject._destroyed),
      texts: (go) => (go.GetComponentsInChildren('TextMeshProUGUI', true) || []).filter((t) => t.gameObject.activeInHierarchy).map((t) => t.text),
      methods: (o) => {
        const out = new Set();
        for (let p = Object.getPrototypeOf(o); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) if (k !== 'constructor' && typeof Object.getOwnPropertyDescriptor(p, k).value === 'function') out.add(k);
        return [...out];
      },
      errs: () => window.__errs.splice(0),
    };
  });
  const errs = () => ev(() => window.__q.errs());
  const dismiss = async () => {
    for (let i = 0; i < 25; i++) {
      const busy = await ev(async () => {
        const { UIStatics } = await __mod('/src/uiscripts/statics.js');
        const q = window.__q;
        const pop = q.active('PlayerRankUpPopupUI')[0];
        if (pop) {
          pop.ContinuePressed?.();
          return 'rankup';
        }
        if (q.active('UI_LootboxOpenAnimation')[0]) return 'lootbox';
        return UIStatics.RankUpPopup.IsOpenOrActive ? 'rankflag' : null;
      });
      if (!busy) return;
      if (busy === 'lootbox') await h.page.mouse.click(640, 400);
      await h.sleep(500);
    }
  };
  // ---------------------------------------------------------------- menu pages
  const pages = await ev(async () => {
    const { MainMenuManager } = await __mod('/src/uiscripts/home.js');
    const mm = MainMenuManager.Instance;
    return mm.switchers.map((s, i) => ({ i, name: s.menuScreen?.gameObject?.name || s.menuButton?.gameObject?.name, unlockRank: s.UnlockRank, unlocked: s.IsUnlocked() }));
  });
  info('pages', pages);
  const rank0 = await ev(async () => (await __mod('/src/meta/rank.js')).PlayerRank.CurrentRank);
  const locked = pages.find((p) => !p.unlocked && p.unlockRank > 0);
  if (locked) {
    const r = await ev(async (i) => {
      const { MainMenuManager } = await __mod('/src/uiscripts/home.js');
      const mm = MainMenuManager.Instance;
      const before = mm.currentMenu?.index;
      mm.DoMenuSwitch(mm.switchers[i]);
      return { before, after: mm.currentMenu?.index };
    }, locked.i);
    await h.sleep(400);
    await h.shot('m3-locked-tooltip');
    info('lockedSwitch', r);
    result('META-09', r.before === r.after ? 'pass' : 'fail', `Rank ${rank0}: bấm trang “${locked.name}” (mở ở rank ${locked.unlockRank}) thì không chuyển trang, hiện tooltip điều kiện mở khoá.`);
  }

  // ---------------------------------------------------------------- currencies on the top bar
  const cur = await ev(async () => {
    const { Currencies } = await __mod('/src/meta/currency.js');
    Currencies.Soft.Gain(5000, 'qa');
    Currencies.Hard.Gain(300, 'qa');
    await new Promise((r) => setTimeout(r, 2500));
    const bars = window.__q.active('UI_Currency').map((u) => window.__q.texts(u.gameObject).join(' | '));
    return { soft: Currencies.Soft.value, hard: Currencies.Hard.value, bars };
  });
  info('currency', cur);
  await h.shot('m3-currency');
  const barOk = cur.bars.some((t) => t.replace(/[^\d]/g, '').includes(String(cur.soft))) && cur.bars.some((t) => t.replace(/[^\d]/g, '').includes(String(cur.hard)));
  result('META-01', barOk ? 'pass' : 'fail', `Cộng 5000 gem + 300 rubies: thanh trên Home hiện ${cur.bars.join(' / ')} (save: ${cur.soft} gem, ${cur.hard} rubies).`);

  // ---------------------------------------------------------------- rank ups and the rank track
  const rk = { ups: [], popups: 0 };
  for (let n = 0; n < 8; n++) {
    const r = await ev(async () => {
      const { PlayerRank } = await __mod('/src/meta/rank.js');
      const { Currencies } = await __mod('/src/meta/currency.js');
      const before = { rank: PlayerRank.CurrentRank, soft: Currencies.Soft.value, hard: Currencies.Hard.value };
      const need = PlayerRank.CurrentStarsRequired - PlayerRank.CurrentRankStars;
      PlayerRank.AddStars(need);
      const granted = (PlayerRank.grantedByRank?.get(PlayerRank.CurrentRank) || []).map((g) => `${g.id}${g.amount ? ' x' + g.amount : ''}${g.card ? ' #' + g.card.ID : ''}${g.unlock ? ' ' + JSON.stringify(g.unlock) : ''}`);
      return { from: before.rank, to: PlayerRank.CurrentRank, need, granted, gem: Currencies.Soft.value - before.soft, ruby: Currencies.Hard.value - before.hard };
    });
    await h.sleep(1500);
    const pop = await ev(() => window.__q.active('PlayerRankUpPopupUI').length);
    if (pop) rk.popups++;
    if (n === 0) await h.shot('m3-rankup-popup');
    await dismiss();
    rk.ups.push(r);
  }
  info('rank', rk);
  result('META-02', rk.ups.every((u) => u.to === u.from + 1) && rk.popups > 0 ? 'pass' : 'fail', `Cộng đủ sao 8 lần: rank ${rk.ups[0].from} → ${rk.ups[rk.ups.length - 1].to}, mỗi lần lên đúng 1 rank; popup rank-up hiện ${rk.popups}/8 lần (ảnh chụp lần đầu).`);
  const trackLines = rk.ups.filter((u) => u.granted.length).map((u) => `rank ${u.to}: ${u.granted.join(', ')}`);
  result('META-03', trackLines.length ? 'pass' : 'fail', `Phần thưởng rank track được nhận tự động khi lên rank: ${trackLines.join('; ')}.`);
  const pages2 = await ev(async () => {
    const { MainMenuManager } = await __mod('/src/uiscripts/home.js');
    return MainMenuManager.Instance.switchers.map((s) => s.IsUnlocked());
  });
  info('pagesUnlockedAfterRank', pages2);

  const goto = async (name, shot) => {
    const ok = await ev(async (name) => {
      const { MainMenuManager } = await __mod('/src/uiscripts/home.js');
      const mm = MainMenuManager.Instance;
      const s = mm.switchers.find((x) => (x.menuScreen?.gameObject?.name || x.menuButton?.gameObject?.name || '').toLowerCase().includes(name));
      if (!s) return 'missing';
      mm.DoMenuSwitch(s);
      return mm.currentMenu === s ? 'ok' : 'blocked';
    }, name);
    await h.sleep(1500);
    if (shot) await h.shot(shot);
    return ok;
  };

  // ---------------------------------------------------------------- shop
  const shopNav = await goto('shop', 'm3-shop');
  info('shopNav', shopNav);
  const shopItems = await ev(() => {
    const q = window.__q;
    const pick = (t) => q.all(t).filter((b) => !b.gameObject._destroyed).map((b) => ({ type: t, active: b.gameObject.activeInHierarchy, pay: b.Settings?.PaymentDefinition?.pay, amount: b.Settings?.PaymentDefinition?.amount, data: b.Settings?.PaymentDefinition?.data }));
    return [...pick('LootboxShopItem'), ...pick('DailyDealShopItem'), ...pick('HardCurrencyShopGiftItem'), ...pick('HardCurrencyShopItem'), ...q.all('UI_RVRewardTrack').map((b) => ({ type: 'UI_RVRewardTrack', active: b.gameObject.activeInHierarchy, methods: q.methods(b) }))];
  });
  info('shopItems', shopItems);

  // chest bought with currency
  const chest = await ev(async () => {
    const { Currencies } = await __mod('/src/meta/currency.js');
    const { LootboxService } = await __mod('/src/meta/lootbox.js');
    const items = window.__q.all('LootboxShopItem').filter((b) => b.gameObject.activeInHierarchy);
    const it = items.find((b) => b.Settings?.PaymentDefinition?.pay === 4) || null;
    if (!it) return { none: true, n: items.length };
    const p = it.Settings.PaymentDefinition;
    const cur = p.data === 'Hard' || p.data === 1 ? Currencies.Hard : Currencies.Soft;
    it.OpenConfirmationButton();
    await new Promise((r) => setTimeout(r, 800));
    const confirm = window.__q.active('LootboxShopItemConfirmation').length;
    const b0 = cur.value;
    const q0 = LootboxService.inbox.length;
    it.OnPurchaseButtonClicked();
    await new Promise((r) => setTimeout(r, 400));
    const res = { cost: p.amount, cur: cur === Currencies.Hard ? 'rubies' : 'gem', spent: b0 - cur.value, queued: LootboxService.inbox.length - q0, confirm };
    // not enough money
    const keep = cur.value;
    cur.Spend(keep, 'qa');
    const q1 = LootboxService.inbox.length;
    it.OnPurchaseButtonClicked();
    await new Promise((r) => setTimeout(r, 600));
    res.poorQueued = LootboxService.inbox.length - q1;
    res.poorPopup = window.__q.active('UI_NotEnoughCurrencyPopUp').length + window.__q.all('NotEnoughCurrencyPopUp').filter((b) => b.gameObject.activeInHierarchy).length;
    cur.Gain(keep, 'qa');
    window.__q.active('LootboxShopItemConfirmation').forEach((c) => c.Close?.());
    return res;
  });
  await h.shot('m3-shop-after-buy');
  info('chest', chest);
  if (!chest.none) result('SHOP-02', chest.spent === chest.cost && chest.queued === 1 && chest.poorQueued === 0 ? 'pass' : 'fail', `Mua rương giá ${chest.cost} ${chest.cur}: popup xác nhận ${chest.confirm ? 'có' : 'KHÔNG'} hiện, trừ ${chest.spent}, thêm ${chest.queued} rương vào hàng chờ. Hết tiền: bấm mua không thêm rương (${chest.poorQueued}).`);

  // daily gift
  const gift = await ev(async () => {
    const { Currencies } = await __mod('/src/meta/currency.js');
    const it = window.__q.all('HardCurrencyShopGiftItem').find((b) => !b.gameObject._destroyed);
    if (!it) return { none: true };
    const can = it.settings.CanClaimGift;
    const h0 = Currencies.Hard.value;
    // the gift plays a rewarded ad first (src/ads.js; answered at once by tools/scenario.mjs)
    const tick = () => new Promise((r) => setTimeout(r, 300));
    it.OnClaim();
    await tick();
    const got = Currencies.Hard.value - h0;
    const h1 = Currencies.Hard.value;
    let extra = 0;
    for (let i = 0; i < 6; i++) {
      it.OnClaim();
      await tick();
    }
    extra = Currencies.Hard.value - h1;
    return { can, got, extra, amount: it.settings.giftRubyAmount, perDay: it.settings.giftsPerDay ?? it.settings.perDay };
  });
  info('gift', gift);
  if (!gift.none) result('SHOP-04', gift.can && gift.got === gift.amount ? 'pass' : 'fail', `Quà rubies: nhận ${gift.got} rubies (cấu hình ${gift.amount}); bấm thêm 6 lần nhận thêm ${gift.extra} (giới hạn/ngày ${gift.perDay ?? '?'}). Gói tiền thật chưa thử.`);

  // daily deals
  const deal = await ev(async () => {
    const { Currencies } = await __mod('/src/meta/currency.js');
    const { CardService } = await __mod('/src/meta/cards.js');
    const items = window.__q.all('DailyDealShopItem').filter((b) => !b.gameObject._destroyed);
    const it = items.find((b) => b.Settings?.CanBuySlot?.());
    if (!it) return { none: true, n: items.length };
    const p = it.Settings.PaymentDefinition;
    const cardId = p.id ?? it.Settings.payment?.id ?? it.Settings.Card?.ID;
    const card = CardService.get(cardId);
    const cur = p.data === 'Hard' || p.data === 1 ? Currencies.Hard : Currencies.Soft;
    const before = { cur: cur.value, total: card?.Total };
    it.OpenConfirmationButton();
    await new Promise((r) => setTimeout(r, 800));
    const confirm = window.__q.active('DailyDealShopItemConfirmation').length;
    it.OnPurchaseButtonClicked();
    await new Promise((r) => setTimeout(r, 1500));
    window.__q.active('DailyDealShopItemConfirmation').forEach((c) => c.Close?.());
    return { pay: p.pay, cost: p.amount, cur: cur === Currencies.Hard ? 'rubies' : 'gem', spent: before.cur - cur.value, card: cardId, cardGain: (card?.Total ?? 0) - (before.total ?? 0), confirm, canAgain: it.Settings.CanBuySlot() };
  });
  info('deal', deal);
  await h.shot('m3-deal');
  if (!deal.none) result('SHOP-03', deal.spent === (deal.pay === 4 ? deal.cost : 0) && deal.cardGain > 0 ? 'pass' : 'fail', `Mua deal thẻ #${deal.card}: popup xác nhận ${deal.confirm ? 'có' : 'KHÔNG'} hiện, trừ ${deal.spent}/${deal.cost} ${deal.cur}, thẻ +${deal.cardGain}. Làm mới ngày mới chưa thử.`);
  else result('SHOP-03', 'todo', `Không có slot daily deal nào mua được ở rank hiện tại (${deal.n} slot).`);

  // RV reward track: its ad button until the first step is reached, then the claim button of the reward cell
  const rv = await ev(async () => {
    const { Shop } = await __mod('/src/meta/shop.js');
    const { Currencies } = await __mod('/src/meta/currency.js');
    const t = Shop.rvTrack;
    const ui = window.__q.all('UI_RVRewardTrack').find((b) => b.gameObject.activeInHierarchy);
    if (!ui) return { none: true };
    const p0 = t.progression;
    const s0 = Currencies.Soft.value, h0 = Currencies.Hard.value;
    // one rewarded ad per press (src/ads.js): wait for each answer
    for (let i = 0; i < 6 && !t.UnclaimedSteps.length && !t.IsFullyUnlocked; i++) {
      ui.OnAdButtonPressed();
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 800));
    const reached = t.UnclaimedSteps.length;
    let pressed = 0;
    for (const cell of window.__q.active('UI_RVRewardTrackReward')) {
      if (cell.claimButton?.interactable) {
        cell.claimButton.onClick.Invoke();
        pressed++;
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
    return { p0, p1: t.progression, reached, pressed, left: t.UnclaimedSteps.length, gem: Currencies.Soft.value - s0, ruby: Currencies.Hard.value - h0 };
  });
  info('rv', rv);
  await h.shot('m3-rvtrack');
  if (rv.none) result('SHOP-01', 'todo', 'Không thấy track Free Rewards trên trang Shop.');
  else result('SHOP-01', rv.p1 > rv.p0 && rv.pressed > 0 && rv.left === 0 ? 'pass' : 'fail', `Bấm nút quảng cáo của Free Rewards: tiến độ ${rv.p0} → ${rv.p1}, tới mốc thì ô thưởng bấm được (${rv.pressed}), nhận +${rv.gem} gem, +${rv.ruby} rubies. Quảng cáo thật của portal chưa thử.`);
  let e = await errs();
  info('shopErrs', e);

  // ---------------------------------------------------------------- lootbox opening on Home
  await goto('home');
  await ev(() => {
    // Rank progression above can auto-open these original menu overlays. Close
    // them through their real components so the queued chest opener is no longer
    // blocked by MainMenuManager.IsBusy.
    for (const c of window.__q.active('UI_ChallengeOverlay')) c.TryClose?.();
    for (const r of window.__q.active('UI_RewardTrack')) r.Close?.();
  });
  await h.sleep(1200);
  const lb0 = await ev(async () => {
    const { LootboxService } = await __mod('/src/meta/lootbox.js');
    const { CardService } = await __mod('/src/meta/cards.js');
    return { queued: LootboxService.inbox.length, cards: [...CardService.cards.values()].reduce((a, c) => a + (c.Total || 0), 0) };
  });
  // tap the chest open; the "quality increased" offer waits for LOSE IT (bottom left), the overview for CLAIM
  let sawAnim = false, sawOverview = false;
  for (let i = 0; i < 120; i++) {
    const s = await ev(async () => {
      const { LootboxService } = await __mod('/src/meta/lootbox.js');
      return { anim: window.__q.active('UI_LootboxOpenAnimation').length, overview: window.__q.active('UI_LootboxCollectionOverview').length, q: LootboxService.inbox.length };
    });
    if (s.anim) {
      if (!sawAnim) {
        await h.sleep(1500);
        await h.shot('m3-lootbox-open');
      }
      sawAnim = true;
      if (s.overview) {
        if (!sawOverview) await h.shot('m3-lootbox-overview');
        sawOverview = true;
        await ev(() => window.__q.active('UI_LootboxCollectionOverview')[0]?.claimButton?.Press());
      } else {
        await ev(() => {
          const a = window.__q.active('UI_LootboxOpenAnimation')[0];
          if (!a) return;
          if (a.loseRvButton?.gameObject.activeInHierarchy) a.loseRvButton.Press();
          else a.backgroundBtn?.Press();
        });
      }
    } else if (sawAnim && s.q === 0) break;
    await h.sleep(500);
  }
  const lb1 = await ev(async () => {
    const { LootboxService } = await __mod('/src/meta/lootbox.js');
    const { CardService } = await __mod('/src/meta/cards.js');
    return { queued: LootboxService.inbox.length, cards: [...CardService.cards.values()].reduce((a, c) => a + (c.Total || 0), 0) };
  });
  await h.shot('m3-lootbox-after');
  info('lootbox', { lb0, lb1, sawAnim });
  result('META-05', sawAnim && lb1.queued < lb0.queued && lb1.cards > lb0.cards ? 'pass' : 'fail', `Có ${lb0.queued} rương chờ: Home tự mở hoạt ảnh rương, chạm để mở; còn ${lb1.queued} rương, tổng số thẻ ${lb0.cards} → ${lb1.cards}.`);

  // ---------------------------------------------------------------- daily lootbox
  const daily = await ev(async () => {
    const { DailyLootbox, LootboxService } = await __mod('/src/meta/lootbox.js');
    const { Save } = await __mod('/src/meta/save.js');
    const s = Save.data.dailyLootbox;
    s.xp = 40;
    s.day -= 86400000; // pretend yesterday
    DailyLootbox.CheckState();
    const can = DailyLootbox.CanClaim;
    const lvl = DailyLootbox.Level;
    const q0 = LootboxService.inbox.length;
    const first = DailyLootbox.TryClaim();
    const second = DailyLootbox.TryClaim();
    return { can, lvl, first, second, queued: LootboxService.inbox.length - q0 };
  });
  info('daily', daily);
  result('META-06', daily.can && daily.first && !daily.second && daily.queued === 1 ? 'pass' : 'fail', `Giả lập sang ngày mới với 40 XP: rương ngày cấp ${daily.lvl} nhận được ${daily.queued} lần, nhận lần 2 bị chặn. Chuỗi ngày và UI hằng ngày chưa xem.`);
  await dismiss();

  // ---------------------------------------------------------------- bonus letters
  const bonus = await ev(async () => {
    const { Bonus } = await __mod('/src/meta/bonus.js');
    const { Currencies } = await __mod('/src/meta/currency.js');
    Currencies.Bonus.Gain(5 - Currencies.Bonus.value, 'qa');
    const s0 = Currencies.Soft.value;
    const all = Bonus.CollectedAll;
    const got = Bonus.Claim(false);
    const again = Bonus.Claim(false);
    return { all, got, gem: Currencies.Soft.value - s0, letters: Currencies.Bonus.value, again, cooldown: Math.round(Bonus.CooldownLeft), show: Bonus.ShouldShowButton };
  });
  info('bonus', bonus);
  result('META-07', bonus.all && bonus.got > 0 && bonus.gem === bonus.got && bonus.letters === 0 && bonus.again === 0 ? 'pass' : 'fail', `Đủ 5 chữ BONUS: nhận ${bonus.got} gem, chữ về 0, nhận lần 2 = ${bonus.again}; hồi chiêu ${bonus.cooldown}s. Nút bonus và hoạt ảnh nhận chưa bấm qua UI.`);

  // ---------------------------------------------------------------- challenges
  const ch = await ev(async () => {
    const { ChallengeManager } = await __mod('/src/meta/challenges.js');
    const { PlayerRank } = await __mod('/src/meta/rank.js');
    const { Currencies } = await __mod('/src/meta/currency.js');
    ChallengeManager.UpdateChallengeSlots();
    const slots = ChallengeManager.Slotted.map((c) => ({ id: c.id, text: c.Text, state: c.State, cur: c.CurrentValue, goal: c.GoalValue }));
    const c = ChallengeManager.Slotted.find((x) => x.IsActive);
    if (!c) return { slots, none: true };
    c.Complete();
    const st0 = PlayerRank.state.totalRankStars, s0 = Currencies.Soft.value, h0 = Currencies.Hard.value;
    const res = ChallengeManager.Claim(c);
    return { slots, claimed: c.Text, rewards: (res || []).map((r) => `${r.id} x${r.amount}`), stars: PlayerRank.state.totalRankStars - st0, gem: Currencies.Soft.value - s0, ruby: Currencies.Hard.value - h0, stateAfter: c.State, slotsAfter: ChallengeManager.Slotted.map((x) => x.Text) };
  });
  info('challenges', ch);
  await h.sleep(1000);
  await dismiss();
  await h.shot('m3-challenges');
  if (!ch.none) result('META-04', ch.rewards.length > 0 && ch.stateAfter >= 4 ? 'pass' : 'fail', `${ch.slots.length} slot đang chạy (${ch.slots.map((s) => s.text).join(' / ')}). Hoàn thành + nhận “${ch.claimed}”: ${ch.rewards.join(', ')} (sao +${ch.stars}, gem +${ch.gem}, rubies +${ch.ruby}). Tiến độ theo run và thời gian làm mới slot chưa kiểm.`);

  // ---------------------------------------------------------------- garage
  const gNav = await goto('meta', 'm3-garage');
  info('garageNav', gNav);
  const gar = await ev(async () => {
    const { CardService, CardType } = await __mod('/src/meta/cards.js');
    const types = { Vehicle: CardType.Vehicle, Color: CardType.VehicleColor, Trail: CardType.VehicleTrail, Death: CardType.VehicleDeath, Landing: CardType.VehicleLanding };
    const out = {};
    const uiCards = window.__q.all('UI_MetaCard').filter((b) => !b.gameObject._destroyed);
    for (const [k, t] of Object.entries(types)) {
      const owned = CardService.ofType(t).filter((c) => !c.IsLocked);
      const target = owned.find((c) => !CardService.IsEquipped(c));
      const before = CardService.Equipped(t)?.ID;
      let via = 'none';
      if (target) {
        const ui = uiCards.find((u) => (u.card || u.Card || u.data)?.ID === target.ID);
        if (ui && typeof ui._click === 'function') {
          ui._click();
          via = 'UI_MetaCard click';
        } else {
          CardService.Equip(target);
          via = 'CardService.Equip';
        }
      }
      out[k] = { owned: owned.length, total: CardService.ofType(t).length, before, after: CardService.Equipped(t)?.ID, target: target?.ID, via };
    }
    return { out, uiCards: uiCards.length, methods: uiCards[0] ? window.__q.methods(uiCards[0]).slice(0, 40) : [] };
  });
  info('garage', gar);
  await h.sleep(1500);
  await h.shot('m3-garage-equipped');
  const vehicle = gar.out.Vehicle;
  result('SHOP-05', vehicle.target ? (vehicle.after === vehicle.target ? 'pass' : 'fail') : 'todo', vehicle.target ? `Garage: ${vehicle.owned}/${vehicle.total} xe sở hữu; chọn xe #${vehicle.target} (${vehicle.via}) → xe đang dùng #${vehicle.after}. Xe trong run chưa đối chiếu bằng mắt.` : `Chỉ sở hữu ${vehicle.owned} xe nên chưa đổi được xe.`);
  const fx = ['Trail', 'Landing', 'Death', 'Color'].map((k) => `${k}: ${gar.out[k].owned}/${gar.out[k].total} sở hữu${gar.out[k].target ? `, đổi sang #${gar.out[k].after}` : ''}`);
  const fxOk = ['Trail', 'Landing', 'Death', 'Color'].every((k) => !gar.out[k].target || gar.out[k].after === gar.out[k].target);
  result('SHOP-06', fxOk ? 'pass' : 'fail', `Trang bị hiệu ứng trong Garage: ${fx.join('; ')}. Preview và hiệu ứng trong run chưa xem bằng mắt.`);

  // ---------------------------------------------------------------- card rank up
  const cardUp = await ev(async () => {
    const { CardService, CardType } = await __mod('/src/meta/cards.js');
    const c = CardService.ofType(CardType.Vehicle).find((x) => !x.IsLocked && !x.IsMaxedOut);
    if (!c) return { none: true };
    const r0 = c.CurrentRank, t0 = c.Total;
    const need = c.totalNeeded(r0 + 1) - c.Total;
    c.Add(Math.max(1, need), 'qa');
    return { id: c.ID, r0, r1: c.CurrentRank, t0, t1: c.Total, need, highest: c.HighestUnlockedRank };
  });
  info('cardUp', cardUp);
  if (!cardUp.none) result('SHOP-07', cardUp.highest > cardUp.r0 || cardUp.r1 > cardUp.r0 ? 'pass' : 'fail', `Thêm ${cardUp.need} bản thẻ xe #${cardUp.id}: ${cardUp.t0} → ${cardUp.t1} bản, cấp ${cardUp.r0} → ${cardUp.r1} (cao nhất đã mở: ${cardUp.highest}).`);

  // ---------------------------------------------------------------- world unlock + stats
  const w = await ev(async () => {
    const { WorldManager } = await __mod('/src/meta/worlds.js');
    const { PlayerRank } = await __mod('/src/meta/rank.js');
    return { rank: PlayerRank.CurrentRank, w2: WorldManager.IsWorldUnlocked(1), w3: WorldManager.IsWorldUnlocked(2), need2: PlayerRank.GetRankForWorldUnlock(1), need3: PlayerRank.GetRankForWorldUnlock(2) };
  });
  info('worlds', w);
  await goto('home', 'm3-home-end');
  const stats = await ev(async () => {
    const b = window.__q.active('UI_WorldStatsButton')[0];
    if (!b) return { none: true };
    const m = window.__q.methods(b);
    const k = ['OnClick', 'OnClicked', 'Open', 'OnButtonClicked', 'OnPressed'].find((x) => m.includes(x));
    if (k) b[k]();
    else b.button?.onClick?.Invoke?.();
    await new Promise((r) => setTimeout(r, 1200));
    return { via: k || 'button.onClick', methods: m };
  });
  info('stats', stats);
  await h.shot('m3-worldstats');
  e = await errs();
  info('errs', e);
  console.log('DONE');
};
