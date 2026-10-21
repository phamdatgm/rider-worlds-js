// Meta-game bootstrap: load data, create the save on first launch, initialize every service.
import { RunsTracker } from './runstracker.js';
import { Save } from './save.js';
import { Meta } from './data.js';
import { Currencies } from './currency.js';
import { CardService } from './cards.js';
import { PlayerRank } from './rank.js';
import { ChallengeManager } from './challenges.js';
import { LootboxService, DailyLootbox } from './lootbox.js';
import { Shop } from './shop.js';
import { Tutorials } from './tutorials.js';

export async function initMeta(runState) {
  await Meta.load();
  Save.load();
  RunsTracker.NewSession();
  const fresh = !Save.data.cards;
  CardService.init();
  if (fresh && !Save.data.startCurrencyGiven) {
    // GameCurrencyService.CreateNewSaveData
    Currencies.Soft.Gain(Meta.data.shop.start.soft, 'Rank');
    Currencies.Hard.Gain(Meta.data.shop.start.hard, 'Rank');
    Save.data.startCurrencyGiven = true;
  }
  PlayerRank.init();
  ChallengeManager.init();
  ChallengeManager.attach(runState);
  LootboxService.init();
  DailyLootbox.init(runState);
  Shop.init();
  Tutorials.init();
  Save.save();
}

export { Save, Meta };
