import { cn } from '@/lib/utils'

const LOGO_SRC = '/legacy-academy-logo.png'

type LegacyAcademyLogoProps = {
  /** Faqat icon (agar alohida icon fayli bo‘lsa) — hozircha to‘liq logo ishlatiladi */
  iconOnly?: boolean
  variant?: 'light' | 'dark'
  className?: string
  height?: number
}

/**
 * Legacy Academy logo — siz bergan rasm o‘zgartirilmasdan.
 */
export function LegacyAcademyLogo({
  iconOnly = false,
  variant = 'light',
  className,
  height = 40,
}: LegacyAcademyLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt="Legacy Academy"
      className={cn('h-auto w-auto object-contain', className)}
      style={{ height }}
      draggable={false}
    />
  )
}
