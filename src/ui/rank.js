// PlayerRankUpPopupUI (one popup per gained rank) and the Reward Track screen (UI_RewardTrack).
import { $, el, spr, Modals, ICON, currencyIcon, rarityColor } from './dom.js';
import { T } from '../meta/data.js';
import { Save } from '../meta/save.js';
import { PlayerRank } from '../meta/rank.js';
import { CardService, typeName } from '../meta/cards.js';
import { Currencies } from '../meta/currency.js';
import { parseUnlock } from '../meta/worlds.js';

const DIFF = ['Easy', 'Moderate', 'Difficult'];

/** visual of one rank-track step: {icon, title, sub} */
function stepVisual(step, rank) {
  const id = step.id;
  if (id === 'UnlockReward') {
    const u = parseUnlock(step.extra);
    if (u.type === 1) return { icon: `S_Icon_World_${u.world + 1}`, title: T('Rewards/Unlock'), sub: T('UI/WorldSelect/World', { 0: u.world + 1 }) };
    return { icon: 'S_Icon_Levels_A', title: T('UI/WorldSelect/World', { 0: u.world + 1 }), sub: T(['UI/Levels/EasyTitle', 'UI/Levels/ModerateTitle', 'UI/Levels/DifficultTitle'][u.type - 1000]) || DIFF[u.type - 1000] };
  }
  if (id === 'Unlock Random Card') {
    const got = CardService.get(Save.data.rank.rankCardMap?.[rank]);
    if (got) return { icon: got.GetImage(0), title: got.Label, sub: typeName(got.Type), card: got };
    return { icon: { 10000: 'S_Icon_Bikes_A', 20000: 'S_Icon_Colors_A', 30000: 'S_Icon_Trails_A', 31000: 'S_Icon_Death_A', 32000: 'S_Icon_Landing_A' }[Number(step.extra)] || 'S_Icon_Cards', title: T('UI/Meta/RandomReward'), sub: typeName(Number(step.extra)) };
  }
  if (id === 'Unlock Card' || id === 'Card') {
    const c = CardService.get(Number(step.extra));
    if (c) return { icon: c.GetImage(0), title: c.Label, sub: typeName(c.Type), card: c };
  }
  const ci = currencyIcon(id);
  if (ci) return { icon: ci, title: `x${step.amount}`, sub: id === 'Currency_Hard' ? 'Rubies' : id === 'Currency_Soft' ? 'Gems' : 'Stars', currency: true };
  return { icon: 'S_Icon_Cards', title: id, sub: '' };
}

function rewardTile(step, rank) {
  const v = stepVisual(step, rank);
  const col = v.card ? rarityColor(v.card.Rarity) : 'var(--hl)';
  return `<div class="rtile ${v.currency ? 'cur' : ''}" style="--rc:${col}">${spr(v.icon, v.currency ? 60 : 90)}<b>${v.title}</b><small>${v.sub}</small></div>`;
}

export const RankUI = {
  busy: false,
  popupOpen: false,
  popupShownRewards: 0,

  /** MainMenuRankUpPopupOpener: present every rank above lastPresentedRank, then open the reward track */
  async showRankUps() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (Save.data.rank.lastPresentedRank < PlayerRank.CurrentRank) {
        const r = Save.data.rank.lastPresentedRank + 1;
        await this.popup(r);
        Save.data.rank.lastPresentedRank = r;
        Save.setDirty();
      }
      await this.openRewardTrack(true);
    } finally {
      this.busy = false;
    }
  },

  popup(rank) {
    return new Promise((resolve) => {
      const steps = PlayerRank.rankRewards.get(rank) || [];
      const ordered = [...steps.filter((s) => !currencyIcon(s.id)), ...steps.filter((s) => currencyIcon(s.id))];
      const hard = steps.find((s) => s.id === 'Currency_Hard');
      this.popupOpen = true;
      this.popupRank = rank;
      this.popupShownRewards = 0;
      const m = Modals.push(`<div class="panel rankup">
          <h2>${T('UI/PlayerRank/RankUpTitle')}</h2>
          <div class="rknum">${spr(ICON.star, 120)}<b>${rank}</b></div>
          <h3>${T('UI/PlayerRank/Rewards/Title')}</h3>
          <div class="rtiles"></div>
          <div class="btns">${hard ? `<button data-b="rv">${spr('S_Icon_Ad', 22)} x${PlayerRank.track.data.rvGemMultiplier}</button>` : ''}
          <button class="primary" data-b="ok">${T('UI/Continue')}</button></div></div>`, 'rankup');
      // number animation: old -> new
      setTimeout(() => {
        const b = $('.rknum b', m.el);
        if (b) {
          b.textContent = rank + 1;
          b.parentElement.classList.add('pop');
        }
      }, 600);
      const tiles = $('.rtiles', m.el);
      ordered.forEach((s, i) =>
        setTimeout(() => {
          if (m.closed) return;
          const t = el('div', 'rt-wrap', rewardTile(s, rank));
          tiles.appendChild(t);
          this.popupShownRewards++;
        }, 900 + i * 350),
      );
      let doubled = false;
      m.el.onclick = (e) => {
        const b = e.target.closest('[data-b]')?.dataset.b;
        if (b === 'rv' && !doubled) {
          doubled = true;
          const extra = Math.round(PlayerRank.track.data.rvGemMultiplier * hard.amount) - hard.amount;
          Currencies.Hard.Gain(extra, 'Rank');
          e.target.closest('button').remove();
          const t = [...tiles.querySelectorAll('.rtile.cur b')].find((x) => x.textContent === `x${hard.amount}`);
          if (t) t.textContent = `x${hard.amount + extra}`;
        } else if (b === 'ok') {
          this.popupOpen = false;
          m.close();
          setTimeout(resolve, 200);
        }
      };
    });
  },

  /** Reward Track screen: one banner per rank with rewards; animates newly reached ranks */
  openRewardTrack(auto) {
    return new Promise((resolve) => {
      const st = Save.data.rank;
      if (auto && st.lastPresentedRankInRewardTrack >= PlayerRank.CurrentRank && st.hasSeenRewardTrack) return resolve();
      const level = PlayerRank.CurrentRank;
      const ranks = [...PlayerRank.rankRewards.keys()].sort((a, b) => a - b);
      const rows = ranks
        .map((req) => {
          const claimed = req <= level;
          const next = req - 1 === level;
          const fresh = claimed && req > st.lastPresentedRankInRewardTrack;
          return `<div class="trow ${claimed ? 'claimed' : ''} ${next ? 'next' : ''} ${fresh ? 'fresh' : ''}" data-req="${req}">
            <div class="trank">${spr(ICON.star, 54)}<b>${req + 1}</b></div>
            <div class="ttiles">${PlayerRank.rankRewards.get(req).map((s) => rewardTile(s, req)).join('')}</div>
            <div class="tstate">${claimed ? `${spr(ICON.check, 26)}<small>${T('Rewards/Claimed')}</small>` : next ? `<small>${T('Rewards/Next Reward')}</small>` : spr(ICON.lock, 26)}</div>
          </div>`;
        })
        .join('');
      const m = Modals.push(`<div class="panel track">
          <h2>${T('Rewards/Title')}</h2>
          <div class="trackhint">${T('Rewards/HowToGetRewards').replace(/\n/g, ' ')} · ${spr(ICON.star, 20)} ${PlayerRank.CurrentRankStars}/${PlayerRank.IsMaxRank ? '-' : PlayerRank.CurrentStarsRequired}</div>
          <div class="trows">${rows}</div>
          <button class="close" data-x>${spr(ICON.close, 22)}</button></div>`, 'track', {
        onClose: () => {
          st.lastPresentedRankInRewardTrack = PlayerRank.CurrentRank;
          st.hasSeenRewardTrack = true;
          Save.setDirty();
          resolve();
        },
      });
      const target = m.el.querySelector('.trow.fresh') || m.el.querySelector('.trow.next') || m.el.querySelector('.trow');
      setTimeout(() => target?.scrollIntoView({ block: 'center', behavior: auto ? 'smooth' : 'auto' }), 60);
      m.el.onclick = (e) => (e.target.closest('[data-x]') || e.target === m.el) && m.close();
    });
  },
};
