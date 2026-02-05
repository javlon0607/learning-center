import * as React from 'react'
import { cn } from '@/lib/utils'
import { Clock } from 'lucide-react'

interface TimeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string
  onChange?: (value: string) => void
  showIcon?: boolean
}

const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ className, value = '', onChange, showIcon = true, ...props }, _ref) => {
    const [hours, setHours] = React.useState('')
    const [minutes, setMinutes] = React.useState('')
    const hoursRef = React.useRef<HTMLInputElement>(null)
    const minutesRef = React.useRef<HTMLInputElement>(null)

    // Parse incoming value
    React.useEffect(() => {
      if (value) {
        const [h, m] = value.split(':')
        setHours(h || '')
        setMinutes(m?.slice(0, 2) || '')
      } else {
        setHours('')
        setMinutes('')
      }
    }, [value])

    const updateValue = (newHours: string, newMinutes: string) => {
      if (newHours && newMinutes) {
        onChange?.(`${newHours.padStart(2, '0')}:${newMinutes.padStart(2, '0')}`)
      } else if (!newHours && !newMinutes) {
        onChange?.('')
      }
    }

    const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/\D/g, '')

      if (val.length > 2) val = val.slice(0, 2)

      const num = parseInt(val, 10)
      if (val && num > 23) val = '23'

      setHours(val)
      updateValue(val, minutes)

      // Auto-focus minutes when hours is complete
      if (val.length === 2 && minutesRef.current) {
        minutesRef.current.focus()
        minutesRef.current.select()
      }
    }

    const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/\D/g, '')

      if (val.length > 2) val = val.slice(0, 2)

      const num = parseInt(val, 10)
      if (val && num > 59) val = '59'

      setMinutes(val)
      updateValue(hours, val)
    }

    const handleHoursKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === ':' || e.key === 'ArrowRight') {
        e.preventDefault()
        minutesRef.current?.focus()
        minutesRef.current?.select()
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const num = parseInt(hours || '0', 10)
        const newVal = String((num + 1) % 24).padStart(2, '0')
        setHours(newVal)
        updateValue(newVal, minutes)
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const num = parseInt(hours || '0', 10)
        const newVal = String((num - 1 + 24) % 24).padStart(2, '0')
        setHours(newVal)
        updateValue(newVal, minutes)
      }
    }

    const handleMinutesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !minutes && hoursRef.current) {
        e.preventDefault()
        hoursRef.current.focus()
      }
      if (e.key === 'ArrowLeft' && hoursRef.current) {
        e.preventDefault()
        hoursRef.current.focus()
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const num = parseInt(minutes || '0', 10)
        const newVal = String((num + 1) % 60).padStart(2, '0')
        setMinutes(newVal)
        updateValue(hours, newVal)
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const num = parseInt(minutes || '0', 10)
        const newVal = String((num - 1 + 60) % 60).padStart(2, '0')
        setMinutes(newVal)
        updateValue(hours, newVal)
      }
    }

    const handleHoursBlur = () => {
      if (hours && hours.length === 1) {
        const padded = hours.padStart(2, '0')
        setHours(padded)
        updateValue(padded, minutes)
      }
    }

    const handleMinutesBlur = () => {
      if (minutes && minutes.length === 1) {
        const padded = minutes.padStart(2, '0')
        setMinutes(padded)
        updateValue(hours, padded)
      }
    }

    return (
      <div
        className={cn(
          'flex h-10 items-center rounded-md border border-input bg-background text-sm ring-offset-background',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          props.disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {showIcon && (
          <Clock className="ml-3 h-4 w-4 text-muted-foreground" />
        )}
        <input
          ref={hoursRef}
          type="text"
          inputMode="numeric"
          placeholder="HH"
          value={hours}
          onChange={handleHoursChange}
          onKeyDown={handleHoursKeyDown}
          onBlur={handleHoursBlur}
          className={cn(
            'w-8 bg-transparent text-center outline-none placeholder:text-muted-foreground',
            showIcon ? 'ml-2' : 'ml-3'
          )}
          maxLength={2}
          disabled={props.disabled}
        />
        <span className="text-muted-foreground">:</span>
        <input
          ref={minutesRef}
          type="text"
          inputMode="numeric"
          placeholder="MM"
          value={minutes}
          onChange={handleMinutesChange}
          onKeyDown={handleMinutesKeyDown}
          onBlur={handleMinutesBlur}
          className="w-8 mr-3 bg-transparent text-center outline-none placeholder:text-muted-foreground"
          maxLength={2}
          disabled={props.disabled}
        />
      </div>
    )
  }
)
TimeInput.displayName = 'TimeInput'

export { TimeInput }
