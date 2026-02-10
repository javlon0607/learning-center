import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  description?: string
  trend?: string
  trendUp?: boolean
  iconColor?: 'primary' | 'success' | 'warning' | 'info'
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendUp,
  iconColor = 'primary',
}: StatsCardProps) {
  const iconColorClasses = {
    primary: 'bg-navy-100 text-navy-600',
    success: 'bg-green-100 text-green-600',
    warning: 'bg-amber-100 text-amber-600',
    info: 'bg-blue-100 text-blue-600',
  }

  return (
    <div className="group relative bg-card rounded-xl border border-border/60 p-6 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-border">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
          </div>
          {trend && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trendUp
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            )}>
              {trendUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend}
            </div>
          )}
          {description && !trend && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className={cn(
          "p-3 rounded-xl transition-transform duration-200 group-hover:scale-110",
          iconColorClasses[iconColor]
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}
