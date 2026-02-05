import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format amount with space as thousand separator, e.g. 26 000.50 (no currency symbol). */
export function formatCurrency(amount: number): string {
  const num = Number(amount)
  if (!Number.isFinite(num)) return '0.00'
  const [intPart, decPart] = num.toFixed(2).split('.')
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return decPart != null ? `${withSpaces}.${decPart}` : withSpaces
}

/** Format number for display in amount inputs: space thousands, dot decimal. Empty for 0. */
export function formatAmountForInput(value: number | ''): string {
  if (value === '' || value === null || value === undefined) return ''
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return ''
  const [intPart, decPart] = num.toFixed(2).split('.')
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return decPart != null ? `${withSpaces}.${decPart}` : withSpaces
}

/** Parse formatted amount string (with spaces) back to number. */
export function parseAmountFromInput(str: string): number {
  if (!str || typeof str !== 'string') return 0
  const cleaned = str.replace(/\s/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

/** Format time string to 24-hour format (HH:MM) */
export function formatTime(time?: string): string {
  if (!time) return ''
  // Already in HH:MM:SS or HH:MM format, just return HH:MM
  return time.slice(0, 5)
}

/** Compare two time strings. Returns true if end is after start */
export function isEndTimeAfterStart(start?: string, end?: string): boolean {
  if (!start || !end) return true
  return end > start
}

/**
 * Format Uzbekistan phone number: +998 XX XXX XX XX
 * Accepts raw digits or partially formatted input
 */
export function formatUzbekPhone(value: string): string {
  // Remove all non-digits
  let digits = value.replace(/\D/g, '')

  // Remove leading 998 if present (we'll add it back formatted)
  if (digits.startsWith('998')) {
    digits = digits.slice(3)
  }

  // Limit to 9 digits (Uzbek numbers after country code)
  digits = digits.slice(0, 9)

  if (!digits) return ''

  // Format: +998 XX XXX XX XX
  let formatted = '+998'
  if (digits.length > 0) formatted += ' ' + digits.slice(0, 2)
  if (digits.length > 2) formatted += ' ' + digits.slice(2, 5)
  if (digits.length > 5) formatted += ' ' + digits.slice(5, 7)
  if (digits.length > 7) formatted += ' ' + digits.slice(7, 9)

  return formatted
}

/**
 * Parse formatted phone to raw digits with country code
 */
export function parseUzbekPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  // If already has 998, return as is; otherwise prepend
  if (digits.startsWith('998')) return digits
  return '998' + digits
}

/**
 * Validate Uzbekistan phone number (should have 12 digits total: 998 + 9 digits)
 */
export function isValidUzbekPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (!digits) return true // Empty is valid (optional field)
  const normalized = digits.startsWith('998') ? digits : '998' + digits
  return normalized.length === 12
}
