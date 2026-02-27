import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useTranslation } from '@/contexts/I18nContext'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCog,
  Calendar,
  CreditCard,
  Receipt,
  BarChart3,
  ScrollText,
  Settings,
  UserPlus,
  ChevronRight,
  PhoneCall,
  ShieldCheck,
  Languages,
} from 'lucide-react'

const navigation = [
  { key: 'nav.dashboard',    href: '/',            icon: LayoutDashboard, feature: null },
  { key: 'nav.students',     href: '/students',     icon: Users,           feature: 'students' },
  { key: 'nav.groups',       href: '/groups',       icon: GraduationCap,   feature: 'groups' },
  { key: 'nav.teachers',     href: '/teachers',     icon: UserCog,         feature: 'teachers' },
  { key: 'nav.leads',        href: '/leads',        icon: UserPlus,        feature: 'leads' },
  { key: 'nav.attendance',   href: '/attendance',   icon: Calendar,        feature: 'attendance' },
  { key: 'nav.payments',     href: '/payments',     icon: CreditCard,      feature: 'payments' },
  { key: 'nav.expenses',     href: '/expenses',     icon: Receipt,         feature: 'expenses' },
  { key: 'nav.collections',  href: '/collections',  icon: PhoneCall,       feature: 'collections' },
  { key: 'nav.reports',      href: '/reports',      icon: BarChart3,       feature: 'reports' },
  { key: 'nav.logs',         href: '/logs',         icon: ScrollText,      feature: 'logs' },
  { key: 'nav.settings',     href: '/settings',     icon: Settings,        feature: 'settings' },
  { key: 'nav.permissions',  href: '/permissions',  icon: ShieldCheck,     feature: 'permissions' },
  { key: 'nav.translations', href: '/translations', icon: Languages,       feature: 'translations' },
]

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation()
  const { hasFeature } = usePermissions()
  const { t, lang, setLang } = useTranslation()

  const filteredNavigation = navigation.filter(item => item.feature === null || hasFeature(item.feature))

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
                key={item.key}
                to={item.href}
                onClick={onNavigate}
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
                  {t(item.key)}
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
      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        {/* Language Switcher */}
        <div className="flex items-center justify-center gap-1 px-2">
          <button
            onClick={() => setLang('en')}
            className={cn(
              'flex-1 py-1 text-xs rounded font-medium transition-colors',
              lang === 'en'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            EN
          </button>
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={() => setLang('uz')}
            className={cn(
              'flex-1 py-1 text-xs rounded font-medium transition-colors',
              lang === 'uz'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            UZ
          </button>
        </div>
        {/* System status */}
        <div className="flex items-center gap-3 px-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/50">{t('nav.system_online', 'System Online')}</span>
        </div>
      </div>
    </div>
  )
}
