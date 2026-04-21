const TRY_LOCALE = 'tr-TR'

/**
 * Formats an integer kuruş amount as Turkish Lira.
 *
 * Backend stores and transfers money as **integer kuruş** (1 TRY = 100 kuruş)
 * to avoid IEEE-754 float drift. The presentation layer divides by 100 at the
 * last possible moment — here — and renders two decimal places.
 *
 *   formatTRY(15_000_000) === "150.000,00 ₺"
 *   formatTRY(100_001)    === "1.000,01 ₺"
 */
export function formatTRY(kurus: number): string {
  return (kurus / 100).toLocaleString(TRY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ₺'
}

/**
 * Converts a user-entered TL amount (e.g. "150000" or "1500.25") into the
 * integer kuruş representation the API expects. Rounds to the nearest kuruş.
 */
export function toKurus(tl: number): number {
  return Math.round(tl * 100)
}

export function formatDate(input: string | Date): string {
  return new Date(input).toLocaleDateString(TRY_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(input: string | Date): string {
  return new Date(input).toLocaleDateString(TRY_LOCALE, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initialOf(name?: string): string {
  return name?.charAt(0).toUpperCase() ?? ''
}
