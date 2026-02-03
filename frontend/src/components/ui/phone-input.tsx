import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn, formatUzbekPhone, parseUzbekPhone, isValidUzbekPhone } from '@/lib/utils'

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string
  onChange?: (value: string) => void
  onRawChange?: (rawDigits: string) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value = '', onChange, onRawChange, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() =>
      value ? formatUzbekPhone(value) : ''
    )

    // Update display when external value changes
    React.useEffect(() => {
      if (value !== undefined) {
        const formatted = formatUzbekPhone(value)
        if (formatted !== displayValue) {
          setDisplayValue(formatted)
        }
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value
      const formatted = formatUzbekPhone(input)
      setDisplayValue(formatted)

      const rawDigits = parseUzbekPhone(formatted)
      onChange?.(formatted)
      onRawChange?.(rawDigits)
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

      // Block non-numeric input
      if (!/^\d$/.test(e.key)) {
        e.preventDefault()
      }
    }

    const isValid = isValidUzbekPhone(displayValue)

    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="+998 XX XXX XX XX"
        maxLength={17} // +998 XX XXX XX XX = 17 chars
        className={cn(
          !isValid && displayValue && 'border-red-300 focus-visible:ring-red-500',
          className
        )}
        {...props}
      />
    )
  }
)

PhoneInput.displayName = 'PhoneInput'

export { PhoneInput }
