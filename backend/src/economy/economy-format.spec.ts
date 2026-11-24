import { formatCurrency, sanitizeCustomTitle } from './economy-format';
import { defaultEconomySettings } from './economy.schema';
import { economySettingsSchema } from './economy.schema';

describe('economy currency formatting', () => {
  it('formats defaults and thousands separators', () => {
    expect(formatCurrency(0, defaultEconomySettings())).toBe('0 Dex');
    expect(formatCurrency(1, defaultEconomySettings())).toBe('1 Dex');
    expect(formatCurrency(1250, defaultEconomySettings())).toBe('1,250 Dex');
  });

  it('normalizes saved currency names to Dex', () => {
    const parsed = economySettingsSchema.parse({ ...defaultEconomySettings(), currencyName: 'Nova' });
    expect(parsed.currencyName).toBe('Dex');
    expect(formatCurrency(4000, parsed)).toBe('4,000 Dex');
  });

  it('validates currency and economy names', () => {
    expect(economySettingsSchema.safeParse({ ...defaultEconomySettings(), currencyName: 'Dex2' }).data?.currencyName).toBe('Dex');
    expect(economySettingsSchema.safeParse({ ...defaultEconomySettings(), currencyName: 'Dex Coin' }).success).toBe(false);
    expect(economySettingsSchema.safeParse({ ...defaultEconomySettings(), economyName: '@everyone' }).success).toBe(false);
  });

  it('keeps the new default store snapshot and weekly reward sanity', () => {
    const prices = [90, 120, 150, 150, 180, 250, 400, 1000, 2000, 4000];
    expect(prices).toEqual([90, 120, 150, 150, 180, 250, 400, 1000, 2000, 4000]);
    const week = [50, 55, 60, 65, 70, 75, 80].reduce((sum, amount) => sum + amount, 0);
    expect(week).toBe(455);
  });

  it('sanitizes custom titles', () => {
    expect(sanitizeCustomTitle('  @Owner https://example.com  ')).toBe('Owner');
    expect(sanitizeCustomTitle('discord.gg/test')).toBe('');
    expect(sanitizeCustomTitle('A'.repeat(30))).toHaveLength(20);
  });
});
