// CW.Currency: soft (gems), hard (rubies), star (rank progress) and bonus letters.
import { EventAction } from '../engine/core.js';
import { Save } from './save.js';

export const CurrencyType = { Soft: 0, Hard: 1, Bonus: 2, Star: 3 };
const KEYS = ['soft', 'hard', 'bonus', 'star'];

class Currency {
  constructor(type) {
    this.type = type;
    this.key = KEYS[type];
    this.onChange = new EventAction();
  }

  get value() {
    return Save.data.currency[this.key] || 0;
  }

  CanSpend(n) {
    return this.value >= n;
  }

  Gain(n, source = '') {
    n = Math.round(n);
    if (!n) return;
    const prev = this.value;
    Save.data.currency[this.key] = prev + n;
    Save.setDirty();
    this.onChange.Raise(this.value, prev, source);
  }

  Spend(n, source = '') {
    if (!this.CanSpend(n)) return false;
    const prev = this.value;
    Save.data.currency[this.key] = prev - n;
    Save.setDirty();
    this.onChange.Raise(this.value, prev, source);
    return true;
  }
}

export const Currencies = {
  Soft: new Currency(CurrencyType.Soft),
  Hard: new Currency(CurrencyType.Hard),
  Bonus: new Currency(CurrencyType.Bonus),
  Star: new Currency(CurrencyType.Star),
  get(type) {
    return [this.Soft, this.Hard, this.Bonus, this.Star][type];
  },
};
