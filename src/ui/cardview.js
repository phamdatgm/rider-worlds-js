// Card visuals (UI_MetaCard / UI_CardBase): grid card, rank slot, reward reveal card.
import { spr, rarityColor, RARITY_TEXT } from './dom.js';
import { typeName } from '../meta/cards.js';
import { T } from '../meta/data.js';

const LOCKED_WORLD = '#595959';
const LOCKED = '#bebebe';

function fill(cur, max) {
  return `<div class="fill"><i style="width:${Math.max(0, Math.min(1, cur / max)) * 100}%"></i><span>${cur} / ${max}</span></div>`;
}

/** grid card of the garage (UI_MetaCard.SetupCollection) */
export function metaCardHtml(card, { selected = false, size = 112 } = {}) {
  const locked = card.IsLocked;
  const lockedWorld = card.IsLockedInWorld;
  const rc = rarityColor(card.Rarity);
  const border = lockedWorld ? LOCKED_WORLD : locked ? LOCKED : rc;
  const bg = locked ? '#ffffff' : rc;
  const img = spr(card.GetImage(card.HighestUnlockedRank), size * 0.86, { cls: `img ${lockedWorld ? 'silhouette' : ''}` });
  let bottom;
  if (locked) bottom = `<div class="unlocks">${T('UI/Meta/UnlocksInWorld', { 0: card.UnlocksInWorldID + 1 })}</div>`;
  else if (card.IsMaxedOut) bottom = `<div class="fill max"><i style="width:100%"></i><span>${T('UI/Max')}</span></div>`;
  else bottom = fill(card.UICurrentCards, card.UIMaxCards);
  const badge = !locked && card.IsUsable && card.IsUnseen ? '<b class="dot"></b>' : '';
  return `<div class="mcard ${locked ? 'locked' : ''} ${lockedWorld ? 'lockedworld' : ''} ${selected ? 'sel' : ''}" data-card="${card.ID}"
      style="--rc:${rc};--bd:${border};--bg:${bg};width:${size}px">
    <div class="face">${img}${locked ? '<div class="lockov"></div>' : ''}</div>
    ${locked ? '' : `<div class="name" style="color:${rc}">${card.Label}</div>`}
    ${bottom}${badge}</div>`;
}

/** rank slot of the inspect panel (UI_MetaCard.SetupRank) */
export function rankSlotHtml(card, r, selected) {
  const rc = rarityColor(r);
  const unlocked = card.IsRankUnlocked(r);
  const unseen = card.IsRankUnseen(r);
  return `<div class="rslot ${unlocked ? '' : 'locked'} ${selected ? 'sel' : ''}" data-rank="${r}" style="--rc:${rc}">
    <div class="face">${spr(card.GetImage(r), 64, { cls: 'img' })}</div>
    ${unlocked ? '' : `<div class="prev">${T('UI/Meta/UnlocksAtLevel')}</div>`}
    ${unseen && r !== 0 ? `<div class="claimstar">${spr('S_Icon_Star_Reward_A', 22)}+1</div><b class="dot"></b>` : ''}
  </div>`;
}

/** reward / lootbox reveal card (UI_CardBase): shows copies as rank progress */
export function rewardCardHtml(card, total, { added = 0, big = true } = {}) {
  if (card.Type === 1) {
    const icon = card.def.icon || card.def.image;
    return `<div class="rcard currency"><div class="face">${spr(icon, big ? 120 : 70)}</div>
      <div class="amt">+<span>${Math.round((card.def.currencyPerCard || 1) * added)}</span></div></div>`;
  }
  const [rank, cur, need] = card.GetCardsRangeForCards(total);
  const rc = rarityColor(rank);
  const max = rank >= 3;
  return `<div class="rcard" data-card="${card.ID}" style="--rc:${rc}">
    <div class="type">${typeName(card.Type)}</div>
    <div class="face">${spr(card.GetImage(rank), big ? 150 : 80, { cls: 'img' })}</div>
    <div class="name">${card.Label}</div>
    <div class="banner">${RARITY_TEXT[rank]}</div>
    ${max ? `<div class="fill max"><i style="width:100%"></i><span>${T('UI/Max')}</span></div>` : fill(cur, need)}
    ${added ? `<div class="added">x${added}</div>` : ''}
  </div>`;
}

/** update a reveal card in place for `total` copies (count-up animation step) */
export function updateRewardCard(node, card, total) {
  const [rank, cur, need] = card.GetCardsRangeForCards(total);
  const rc = rarityColor(rank);
  node.style.setProperty('--rc', rc);
  const f = node.querySelector('.fill');
  const ban = node.querySelector('.banner');
  if (ban) ban.textContent = RARITY_TEXT[rank];
  const img = node.querySelector('.face');
  if (img) img.innerHTML = spr(card.GetImage(rank), node.querySelector('.face .spr')?.offsetWidth || 150, { cls: 'img' });
  if (rank >= 3) {
    f.className = 'fill max';
    f.innerHTML = `<i style="width:100%"></i><span>${T('UI/Max')}</span>`;
  } else {
    f.className = 'fill';
    f.innerHTML = `<i style="width:${(cur / need) * 100}%"></i><span>${cur} / ${need}</span>`;
  }
  return rank;
}
