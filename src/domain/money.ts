// Money is stored as whole kobo so totals never pick up floating point error.

/** Parses user input such as "12,500.50" into kobo. Returns null if invalid. */
export function parseNaira(input: string | number): number | null {
  const text = String(input).replace(/[\s,₦]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
}

export function koboToInput(kobo: number): string {
  const whole = Math.trunc(kobo / 100);
  const fraction = Math.abs(kobo % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function formatMoney(kobo: number, currency = 'NGN'): string {
  const hasKobo = kobo % 100 !== 0;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

/** Short form for tight chart labels, for example ₦1.2m. */
export function formatMoneyShort(kobo: number, currency = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(kobo / 100);
}
