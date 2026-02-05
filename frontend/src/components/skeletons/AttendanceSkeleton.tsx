import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AttendanceSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <Skeleton className="h-5 w-36" />
              <div className="flex items-center gap-2">
                {[...Array(4)].map((_, j) => (
                  <Skeleton key={j} className="h-9 w-24 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Skeleton className="h-10 w-32" />
        </div>
      </CardContent>
    </Card>
  )
}

export function PageSkeleton() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="space-y-4 w-full max-w-md">
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
        <div className="flex justify-center gap-2 pt-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </div>
  )
}
