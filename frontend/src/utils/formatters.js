export function currency(val, cur = 'ILS') {
  if (val == null) return '0.00 ₪';
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur }).format(val);
  } catch {
    return `${Number(val).toFixed(2)} ₪`;
  }
}

export function percent(val, decimals = 2) {
  if (val == null) return '0%';
  return `${Number(val).toFixed(decimals)}%`;
}

export function number(val) {
  if (val == null) return '0';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

export function date(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateShort(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
