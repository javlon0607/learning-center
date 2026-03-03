import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PageSkeleton } from '@/components/skeletons'

type ProtectedRouteProps = {
  /** Roles allowed to access this route (e.g. ['admin'] for /settings/users). */
  allowedRoles: string[]
}

/**
 * Protects routes by role. Redirects to home if the user is not in allowedRoles.
 * Use for admin-only or role-specific routes.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading, hasRole } = useAuth()

  if (isLoading) {
    return <PageSkeleton />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!hasRole(allowedRoles)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
