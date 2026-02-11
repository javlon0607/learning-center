import * as React from 'react'
import { cn } from '@/lib/utils'
import { Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface TimeInputProps {
  id?: string
  value?: string
  onChange?: (value: string) => void
  className?: string
  disabled?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))

function TimeInput({ id, value = '', onChange, className, disabled }: TimeInputProps) {
  const [open, setOpen] = React.useState(false)
  const hourRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const minuteRefs = React.useRef<(HTMLButtonElement | null)[]>([])

  const normalized = value ? value.slice(0, 5) : ''
  const [selectedHour, selectedMinute] = normalized
    ? normalized.split(':')
    : ['', '']

  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const hIdx = HOURS.indexOf(selectedHour)
      if (hIdx >= 0) hourRefs.current[hIdx]?.scrollIntoView({ block: 'nearest' })
      const mIdx = MINUTES.indexOf(selectedMinute)
      if (mIdx >= 0) minuteRefs.current[mIdx]?.scrollIntoView({ block: 'nearest' })
    }, 0)
    return () => clearTimeout(t)
  }, [open, selectedHour, selectedMinute])

  const pick = (type: 'h' | 'm', val: string) => {
    const h = type === 'h' ? val : (selectedHour || '00')
    const m = type === 'm' ? val : (selectedMinute || '00')
    onChange?.(`${h}:${m}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !normalized && 'text-muted-foreground',
            className
          )}
        >
          <Clock className="h-3.5 w-3.5 opacity-50" />
          <span className={cn('tabular-nums', normalized && 'font-medium text-foreground')}>
            {normalized || 'HH:MM'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[120px] p-0" align="start" sideOffset={4}>
        <div className="flex divide-x divide-border">
          <div className="flex-1 h-[144px] overflow-y-auto overscroll-contain py-0.5">
            {HOURS.map((h, i) => (
              <button
                key={h}
                ref={el => { hourRefs.current[i] = el }}
                type="button"
                onClick={() => pick('h', h)}
                className={cn(
                  'flex w-full items-center justify-center py-1 text-xs tabular-nums transition-colors',
                  selectedHour === h
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="flex-1 h-[144px] overflow-y-auto overscroll-contain py-0.5">
            {MINUTES.map((m, i) => (
              <button
                key={m}
                ref={el => { minuteRefs.current[i] = el }}
                type="button"
                onClick={() => pick('m', m)}
                className={cn(
                  'flex w-full items-center justify-center py-1 text-xs tabular-nums transition-colors',
                  selectedMinute === m
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

TimeInput.displayName = 'TimeInput'

export { TimeInput }
