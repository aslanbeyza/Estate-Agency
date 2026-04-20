const TRY_LOCALE = 'tr-TR'

export function formatTRY(amount: number): string {
  return amount.toLocaleString(TRY_LOCALE) + ' ₺'
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
