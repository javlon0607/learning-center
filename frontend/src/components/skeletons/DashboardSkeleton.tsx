import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-5 w-40" />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <FinancialCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts and Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card className="border-border/60 shadow-soft">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-2 border-border/60 shadow-soft">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="grid gap-3">
            {[...Array(4)].map((_, i) => (
              <QuickActionSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatsCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border/60 p-6 shadow-soft">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton variant="circular" className="h-12 w-12" />
      </div>
    </div>
  )
}

function FinancialCardSkeleton() {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton variant="circular" className="h-8 w-8" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-36" />
      </CardContent>
    </Card>
  )
}

function QuickActionSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 p-4">
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <Skeleton className="h-5 w-5" />
    </div>
  )
}
