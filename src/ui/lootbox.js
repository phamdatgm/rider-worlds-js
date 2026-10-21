// UI_LootboxOpener / UI_LootboxOpenAnimation: chest drop, tap to open, per-card count-up reveal, RV bonus
// card ("Get it!" is free like the shipped build's rewarded videos), overview and claim.
import { $, spr, Modals, sfx } from './dom.js';
import { rewardCardHtml, updateRewardCard } from './cardview.js';
import { T } from '../meta/data.js';
import { CardService } from '../meta/cards.js';
import { LootboxService } from '../meta/lootbox.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function tapOrWait(node, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      node.removeEventListener('pointerdown', fin);
      resolve(true);
    };
    node.addEventListener('pointerdown', fin);
    if (ms !== undefined) setTimeout(() => !done && ((done = true), node.removeEventListener('pointerdown', fin), resolve(false)), ms);
  });
}

export const LootboxUI = {
  busy: false,

  async openNext() {
    if (this.busy) return;
    const result = LootboxService.OpenNext();
    if (!result) return;
    this.busy = true;
    try {
      await this.play(result);
    } finally {
      this.busy = false;
    }
  },

  async play(result) {
    const box = LootboxService.box(result.box);
    const art = LootboxService.art(result.type);
    const m = Modals.push(`<div class="lbox">
        <div class="lb-title">${box?.name || ''}</div>
        <div class="lb-chest">${spr(art.sprite, 280)}</div>
        <div class="lb-hint hidden">${T('UI/Shop/Lootbox/TapToOpen')}</div>
        <div class="lb-left hidden"><b></b></div>
        <div class="lb-stage"></div>
      </div>`, 'lootbox-open');
    const root = m.el;
    const chest = $('.lb-chest', root);
    chest.classList.add('drop');
    sfx('UI_MenuSwoosh');
    await wait(500);
    if (!(await tapOrWait(root, 1000))) {
      $('.lb-hint', root).classList.remove('hidden');
      await tapOrWait(root);
    }
    $('.lb-hint', root).classList.add('hidden');
    chest.classList.remove('drop');
    chest.classList.add('open');
    await Promise.race([wait(900), tapOrWait(root)]);
    chest.classList.add('gone');
    await wait(250);

    const stage = $('.lb-stage', root);
    let left = result.regular.reduce((a, d) => a + d.count, 0) + result.ads.reduce((a, d) => a + d.count, 0);
    const leftEl = $('.lb-left', root);
    const setLeft = () => {
      leftEl.classList.toggle('hidden', left < 1);
      $('b', leftEl).textContent = left;
    };
    setLeft();

    // regular drops, one card at a time
    for (const d of result.regular) {
      const card = CardService.get(d.id);
      if (!card) continue;
      await this.reveal(stage, card, d.count, (n) => {
        left -= n;
        setLeft();
      }, root);
    }
    // RV bonus card
    let watched = false;
    const ad = result.ads[0];
    if (ad) {
      const card = CardService.get(ad.id);
      if (card) {
        stage.innerHTML = `<div class="lb-bonus"><h3>${T('Lootbox/BonusReward')}</h3>${rewardCardHtml(card, card.Total + this.sameIn(result.regular, ad.id), { added: ad.count })}
          <div class="btns"><button class="primary" data-g="1">${spr('S_Icon_Ad', 22)} ${T('Lootbox/GetIt')}</button><button data-g="0">${T('Lootbox/LoseIt')}</button></div></div>`;
        watched = await new Promise((resolve) => {
          stage.onclick = (e) => {
            const g = e.target.closest('[data-g]');
            if (g) resolve(g.dataset.g === '1');
          };
        });
        stage.onclick = null;
        left -= ad.count;
        setLeft();
      }
    }
    // overview + claim
    const all = [...result.regular.map((d) => ({ ...d, ad: false })), ...result.ads.map((d) => ({ ...d, ad: true }))];
    const totals = new Map();
    stage.innerHTML = `<div class="lb-over"><div class="grid">${all
      .map((d) => {
        const card = CardService.get(d.id);
        if (!card) return '';
        const prev = totals.get(d.id) ?? card.Total;
        const after = d.ad && !watched ? prev : prev + d.count;
        totals.set(d.id, after);
        return `<div class="ov ${d.ad && !watched ? 'lost' : ''}">${rewardCardHtml(card, after, { added: d.count, big: false })}</div>`;
      })
      .join('')}</div><button class="primary claim">${T('Lootbox/Claim')}</button></div>`;
    await new Promise((resolve) => ($('.claim', stage).onclick = resolve));
    LootboxService.Claim(watched);
    m.close();
    await wait(200);
  },

  sameIn(list, id) {
    return list.filter((x) => x.id === id).reduce((a, x) => a + x.count, 0);
  },

  /** one card: appear, then count up copy by copy (rank-ups flash "Upgraded!"); tap skips, tap again continues */
  async reveal(stage, card, count, onCopy, root) {
    const start = card.Total;
    stage.innerHTML = `<div class="lb-card">${rewardCardHtml(card, start, { added: 0 })}<div class="upg hidden">${T('Lootbox/VariantUnlocked')}</div></div>`;
    const node = $('.rcard', stage);
    node.classList.add('appear');
    await wait(350);
    let skip = false;
    const sk = () => (skip = true);
    root.addEventListener('pointerdown', sk);
    let rank = card.GetCardsRangeForCards(start)[0];
    const isCurrency = card.Type === 1;
    for (let i = 1; i <= count; i++) {
      if (isCurrency) {
        const a = $('.amt span', node);
        if (a) a.textContent = Math.round((card.def.currencyPerCard || 1) * i);
      } else {
        const r = updateRewardCard(node, card, Math.min(start + i, card.MaxCards));
        if (r > rank) {
          rank = r;
          const u = $('.upg', stage);
          u.classList.remove('hidden');
          node.classList.remove('rankup');
          void node.offsetWidth;
          node.classList.add('rankup');
          sfx('UI_StarAdded');
          if (!skip) await wait(650);
        }
      }
      onCopy(1);
      if (!skip) await wait(Math.max(40, 260 - i * 15));
    }
    root.removeEventListener('pointerdown', sk);
    await wait(150);
    await tapOrWait(root, 2500);
  },
};
