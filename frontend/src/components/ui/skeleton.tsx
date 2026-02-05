import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'text'
}

function Skeleton({ className, variant = 'default', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        variant === 'circular' && "rounded-full",
        variant === 'text' && "rounded h-4",
        variant === 'default' && "rounded-md",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
