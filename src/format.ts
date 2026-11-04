// Formatting helpers. Missing values render as an em dash, never as zero.
export const DASH = '—';

export function compact(n: number | null | undefined, digits = 1) {
  if (n == null || !Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  const s = a >= 1e12 ? (n / 1e12).toFixed(digits) + 'T' : a >= 1e9 ? (n / 1e9).toFixed(digits) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(digits) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(digits) + 'K' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return s;
}

const CUR_SYM: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', SAR: 'SAR ', KRW: '₩', CNY: '¥', INR: '₹', CAD: 'C$', 'intl $': 'Int$' };

/** Format a value with its unit. Units come from the data source. */
export function fmtUnit(v: number | null | undefined, unit?: string) {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (!unit) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (unit === '%' || unit.startsWith('% of')) return `${v.toFixed(1)}%`;
  if (unit === 'USD' || unit === 'intl $') return `${CUR_SYM[unit]}${compact(v)}`;
  if (unit === 'people' || unit === 'arrivals') return compact(v);
  if (unit === 'x') return `${v.toFixed(1)}×`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

export function money(v: number | null | undefined, currency = 'USD', digits = 2) {
  if (v == null || !Number.isFinite(v)) return DASH;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v); }
  catch { return `${v.toFixed(digits)} ${currency}`; }
}

export function pct(v: number | null | undefined, digits = 2, signed = true) {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function fmtDate(s?: string | null, withTime = false) {
  if (!s) return DASH;
  if (/^\d{4}$/.test(s)) return s;
  const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  if (isNaN(+d)) return s;
  return withTime ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function ago(s?: string) {
  if (!s) return '';
  const sec = (Date.now() - Date.parse(s)) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

export const TYPE_ICON: Record<string, string> = {
  region: '◍', country: '⚑', state: '▦', county: '▫', city: '●', igo: '⬡', person: '☺', party: '◆', company: '▣', commodity: '◈', industry: '⚙', event: '◷', note: '✎',
};
