import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { formatAmountForInput, parseAmountFromInput } from '@/lib/utils'

function addThousandSpaces(raw: string): string {
  if (!raw) return ''
  const [intPart, ...rest] = raw.split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return rest.length > 0 ? `${formatted}.${rest.join('')}` : formatted
}

export function useAmountInput(initial = '') {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const cursorRef = useRef<number>(0)

  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement === el) {
      el.setSelectionRange(cursorRef.current, cursorRef.current)
    }
  }, [value])

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const cursor = e.target.selectionStart ?? 0
    const typed = e.target.value
    const digitsBefore = typed.slice(0, cursor).replace(/\s/g, '').length

    let cleaned = typed.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('')
    const [ip, dp] = cleaned.split('.')
    if (dp !== undefined && dp.length > 2) cleaned = ip + '.' + dp.slice(0, 2)

    const formatted = addThousandSpaces(cleaned)

    let newCursor = 0
    let count = 0
    for (let i = 0; i < formatted.length; i++) {
      if (count >= digitsBefore) break
      if (formatted[i] !== ' ') count++
      newCursor = i + 1
    }
    cursorRef.current = newCursor
    setValue(formatted)
  }

  function onBlur() {
    const parsed = parseAmountFromInput(value)
    setValue(parsed === 0 ? '' : formatAmountForInput(parsed))
  }

  /** Set from a raw number (e.g. from API preview). Formats immediately. */
  function setFromNumber(n: number) {
    setValue(n === 0 ? '' : addThousandSpaces(String(n)))
  }

  function reset() {
    setValue('')
  }

  /** Get the numeric value */
  function numericValue(): number {
    return parseAmountFromInput(value)
  }

  return { value, setValue, ref, onChange, onBlur, setFromNumber, reset, numericValue }
}
