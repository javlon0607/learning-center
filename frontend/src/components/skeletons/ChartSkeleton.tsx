import { Skeleton } from '@/components/ui/skeleton'

export function ChartSkeleton() {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Legend area */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" className="h-2 w-2" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" className="h-2 w-2" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex items-end gap-1 px-4">
        {/* Y-axis */}
        <div className="flex flex-col justify-between h-full py-2 pr-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>

        {/* Bars/Lines representation */}
        <div className="flex-1 flex items-end justify-around gap-2 h-full py-2">
          {[65, 45, 80, 55, 70, 40, 85, 60, 75, 50, 90, 65].map((height, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <Skeleton
                className="w-full rounded-t-sm"
                style={{ height: `${height}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-around px-12 pt-2">
        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((_, i) => (
          <Skeleton key={i} className="h-3 w-6" />
        ))}
      </div>
    </div>
  )
}
