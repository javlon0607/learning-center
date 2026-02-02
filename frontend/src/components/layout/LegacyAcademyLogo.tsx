import { cn } from '@/lib/utils'

const LOGO_FULL = '/2.jpg'
const LOGO_ICON = '/1.jpg'
const LOGO_WHITE = '/legacy-academy-logo.png'

type LegacyAcademyLogoProps = {
  iconOnly?: boolean
  variant?: 'light' | 'dark' | 'white'
  className?: string
  height?: number
}

export function LegacyAcademyLogo({
  iconOnly = false,
  variant = 'light',
  className,
  height = 40,
}: LegacyAcademyLogoProps) {
  const getSrc = () => {
    if (variant === 'white') return LOGO_WHITE
    if (iconOnly) return LOGO_ICON
    return LOGO_FULL
  }

  return (
    <img
      src={getSrc()}
      alt="Legacy Academy"
      className={cn(
        'h-auto w-auto object-contain',
        variant === 'light' && 'rounded-lg',
        className
      )}
      style={{ height }}
      draggable={false}
    />
  )
}
