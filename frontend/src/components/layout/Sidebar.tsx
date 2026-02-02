import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { LegacyAcademyLogo } from '@/components/layout/LegacyAcademyLogo'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCog,
  Calendar,
  CreditCard,
  Receipt,
  DollarSign,
  BarChart3,
  Settings,
  UserPlus,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'manager', 'teacher', 'accountant'] },
  { name: 'Students', href: '/students', icon: Users, roles: ['admin', 'manager', 'teacher', 'accountant'] },
  { name: 'Groups', href: '/groups', icon: GraduationCap, roles: ['admin', 'manager', 'teacher', 'accountant'] },
  { name: 'Teachers', href: '/teachers', icon: UserCog, roles: ['admin', 'manager', 'accountant'] },
  { name: 'Leads', href: '/leads', icon: UserPlus, roles: ['admin', 'manager'] },
  { name: 'Attendance', href: '/attendance', icon: Calendar, roles: ['admin', 'manager', 'teacher', 'accountant'] },
  { name: 'Payments', href: '/payments', icon: CreditCard, roles: ['admin', 'manager', 'accountant'] },
  { name: 'Expenses', href: '/expenses', icon: Receipt, roles: ['admin', 'manager', 'accountant'] },
  { name: 'Salaries', href: '/salaries', icon: DollarSign, roles: ['admin', 'accountant'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'manager', 'accountant'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
]

export function Sidebar() {
  const location = useLocation()
  const { hasRole } = useAuth()

  const filteredNavigation = navigation.filter(item => hasRole(item.roles))

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900">
      <div className="flex h-16 items-center px-4">
        <LegacyAcademyLogo variant="light" height={40} className="w-full max-w-[180px]" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavigation.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
