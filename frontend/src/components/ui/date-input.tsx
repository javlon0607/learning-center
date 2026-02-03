import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  /** Value in ISO format (YYYY-MM-DD) or empty string */
  value?: string
  /** Called with ISO format (YYYY-MM-DD) */
  onChange?: (value: string) => void
}

/**
 * Format date string to dd/mm/yyyy for display
 */
function formatForDisplay(isoDate: string): string {
  if (!isoDate) return ''
  // Handle both YYYY-MM-DD and already formatted dd/mm/yyyy
  if (isoDate.includes('/')) return isoDate
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}

/**
 * Parse dd/mm/yyyy input to ISO format YYYY-MM-DD
 */
function parseToISO(displayDate: string): string {
  if (!displayDate) return ''
  // If already in ISO format, return as is
  if (displayDate.match(/^\d{4}-\d{2}-\d{2}$/)) return displayDate

  const digits = displayDate.replace(/\D/g, '')
  if (digits.length < 8) return ''

  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)

  // Validate
  const d = parseInt(day, 10)
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)

  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) {
    return ''
  }

  return `${year}-${month}-${day}`
}

/**
 * Format input as user types: dd/mm/yyyy
 */
function formatInput(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '')

  // Limit to 8 digits (ddmmyyyy)
  const limited = digits.slice(0, 8)

  if (!limited) return ''

  // Format as dd/mm/yyyy
  let formatted = ''
  if (limited.length > 0) formatted += limited.slice(0, 2)
  if (limited.length > 2) formatted += '/' + limited.slice(2, 4)
  if (limited.length > 4) formatted += '/' + limited.slice(4, 8)

  return formatted
}

/**
 * Validate if the date is complete and valid
 */
function isValidDate(displayDate: string): boolean {
  if (!displayDate) return true // Empty is valid

  const digits = displayDate.replace(/\D/g, '')
  if (digits.length !== 8) return false

  const day = parseInt(digits.slice(0, 2), 10)
  const month = parseInt(digits.slice(2, 4), 10)
  const year = parseInt(digits.slice(4, 8), 10)

  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return false
  }

  // Check if date is actually valid (e.g., not Feb 30)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value = '', onChange, placeholder = 'dd/mm/yyyy', ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatForDisplay(value))

    // Update display when external value changes
    React.useEffect(() => {
      const formatted = formatForDisplay(value)
      if (formatted !== displayValue && value !== parseToISO(displayValue)) {
        setDisplayValue(formatted)
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value
      const formatted = formatInput(input)
      setDisplayValue(formatted)

      // Only call onChange with valid complete dates
      const isoDate = parseToISO(formatted)
      if (isoDate || formatted === '') {
        onChange?.(isoDate)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.key === 'Tab' ||
        e.key === 'Escape' ||
        e.key === 'Enter' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        return
      }

      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      if (e.ctrlKey || e.metaKey) {
        return
      }

      // Allow / for manual separator entry
      if (e.key === '/') {
        return
      }

      // Block non-numeric input
      if (!/^\d$/.test(e.key)) {
        e.preventDefault()
      }
    }

    const handleBlur = () => {
      // On blur, validate and potentially clear invalid dates
      if (displayValue && !isValidDate(displayValue)) {
        // Keep the display but mark as invalid via styling
      }
    }

    const isValid = isValidDate(displayValue)

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10} // dd/mm/yyyy = 10 chars
        className={cn(
          !isValid && displayValue && 'border-red-300 focus-visible:ring-red-500',
          className
        )}
        {...props}
      />
    )
  }
)

DateInput.displayName = 'DateInput'

export { DateInput, formatForDisplay, parseToISO }
