export interface CurrencySettings {
  currencyName: string;
}

export function formatCurrency(amount: number, settings: CurrencySettings): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Currency amount must be a non-negative integer.');
  }
  const separators = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
  return `${separators} ${settings.currencyName}`;
}

export function sanitizeCustomTitle(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)\S+/gi, '')
    .replace(/[@#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}
