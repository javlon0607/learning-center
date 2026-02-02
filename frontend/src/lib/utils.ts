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
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
