import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
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
  ChevronRight,
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
    <div className="flex h-full w-64 flex-col bg-navy-950">
      {/* Logo Section */}
      <div className="flex h-20 items-center justify-center px-4 border-b border-white/10">
        <img
          src="/logo-full.jpg"
          alt="Legacy Academy"
          className="h-14 w-auto rounded-lg"
          draggable={false}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <div className="space-y-1">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <div className="flex items-center">
                  <item.icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                      isActive ? 'text-gold-400' : 'text-white/50 group-hover:text-white/80'
                    )}
                  />
                  {item.name}
                </div>
                {isActive && (
                  <ChevronRight className="h-4 w-4 text-white/60" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/50">System Online</span>
        </div>
      </div>
    </div>
  )
}
