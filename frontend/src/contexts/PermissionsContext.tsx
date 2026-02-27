import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { permissionsApi } from '@/lib/api'
import { useAuth } from './AuthContext'

export interface Feature {
  key: string
  label: string
  description: string
  indent?: boolean
}

export const FEATURES: Feature[] = [
  { key: 'dashboard',        label: 'Dashboard',        description: 'View financial data on the dashboard (revenue, expenses, profit)' },
  { key: 'students',         label: 'Students',          description: 'View and manage students' },
  { key: 'teachers',         label: 'Teachers',          description: 'View and manage teachers' },
  { key: 'groups',           label: 'Groups',            description: 'View and manage groups' },
  { key: 'leads',            label: 'Leads',             description: 'CRM and lead management' },
  { key: 'attendance',       label: 'Attendance',        description: 'Track student attendance' },
  { key: 'payments',         label: 'Payments',          description: 'View and record payments' },
  { key: 'payments_delete',  label: 'Delete Payments',   description: 'Delete payment records', indent: true },
  { key: 'expenses',         label: 'Expenses',          description: 'View and record expenses' },
  { key: 'expenses_delete',  label: 'Delete Expenses',   description: 'Delete expense records', indent: true },
  { key: 'collections',      label: 'Collections',       description: 'Collection calls management' },
  { key: 'salary_slips',     label: 'Salary Slips',      description: 'Manage teacher salaries' },
  { key: 'reports',          label: 'Reports',           description: 'View financial and activity reports' },
  { key: 'logs',             label: 'Audit Logs',        description: 'View system audit logs' },
  { key: 'settings',         label: 'Settings',          description: 'Manage system settings' },
  { key: 'users',            label: 'User Management',   description: 'Create and manage system users' },
  { key: 'permissions',      label: 'Permissions',       description: 'Configure role permissions' },
  { key: 'translations',     label: 'Translations',      description: 'Manage interface translations (EN/UZ)' },
]

// Roles that bypass all feature checks (always have access to everything)
export const BYPASS_ROLES = ['developer']

// Roles shown as editable columns in the permissions grid
export const EDITABLE_ROLES = ['owner', 'admin', 'manager', 'teacher', 'accountant', 'user']

interface PermissionsContextType {
  permissions: Record<string, string[]>
  hasFeature: (feature: string) => boolean
  isLoading: boolean
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, hasRole } = useAuth()

  const { data: permissions = {}, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: permissionsApi.getAll,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  })

  function hasFeature(feature: string): boolean {
    // only developer bypasses all feature checks
    if (hasRole(BYPASS_ROLES)) return true
    // While loading, don't show anything (avoids flash of wrong content)
    if (isLoading) return false
    const allowedRoles = permissions[feature] ?? []
    return hasRole(allowedRoles)
  }

  return (
    <PermissionsContext.Provider value={{ permissions, hasFeature, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionsContext)
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider')
  }
  return context
}
