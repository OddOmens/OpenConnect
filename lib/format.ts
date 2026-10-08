export function fmtNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US')
}

export function fmtCompact(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0)
}

export function fmtMoney(n: number | null | undefined, currency: string, compact = false): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
    }).format(n ?? 0)
  } catch {
    return `${(n ?? 0).toFixed(2)} ${currency}`
  }
}

export function fmtRating(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(2)
}

/** Percent change vs previous period; null when there's nothing to compare. */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!d) return '—'
  const date = d.length === 10 ? new Date(d + 'T00:00:00Z') : new Date(d)
  return date.toLocaleDateString('en-US', { timeZone: d.length === 10 ? 'UTC' : undefined, ...opts })
}
