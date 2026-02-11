import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { birthdaysApi, settingsApi, BirthdayStudent } from '@/lib/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Timetable } from './Timetable'
import { LogOut, User, Bell, Search, ChevronDown, CalendarDays, Menu, Cake, PartyPopper } from 'lucide-react'
import { calculateAge } from '@/lib/utils'

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [timetableOpen, setTimetableOpen] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  })

  const birthdaysEnabled = settings?.notification_birthdays !== 'false'

  const { data: birthdays = [] } = useQuery({
    queryKey: ['birthdays', 'today'],
    queryFn: birthdaysApi.getToday,
    enabled: birthdaysEnabled,
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 min
  })

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'admin': return 'bg-navy-100 text-navy-700'
      case 'manager': return 'bg-blue-100 text-blue-700'
      case 'teacher': return 'bg-green-100 text-green-700'
      case 'accountant': return 'bg-amber-100 text-amber-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const hasNotifications = birthdaysEnabled && birthdays.length > 0

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/60 bg-card px-4 md:px-6 shadow-sm">
      {/* Left side - Hamburger + Search */}
      <div className="flex items-center gap-4 flex-1">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-10 w-10 rounded-lg"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search students, groups, teachers..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-colors"
          />
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Timetable */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={() => setTimetableOpen(true)}
              >
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Class Timetable</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-lg">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {hasNotifications && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-3 border-b">
              <h4 className="font-semibold text-sm">Notifications</h4>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {hasNotifications ? (
                <div className="p-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                    <PartyPopper className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Today's Birthdays ({birthdays.length})
                    </span>
                  </div>
                  {birthdays.map((student: BirthdayStudent) => (
                    <button
                      key={student.id}
                      onClick={() => navigate(`/students/${student.id}`)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Cake className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Turns {student.dob ? calculateAge(student.dob) : '?'} today
                          {student.phone ? ` \u00B7 ${student.phone}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Divider */}
        <div className="h-8 w-px bg-border mx-2 hidden sm:block" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 h-10 pl-2 pr-3 rounded-lg hover:bg-muted/50">
              <Avatar className="h-8 w-8 ring-2 ring-primary/10">
                <AvatarFallback className="bg-navy-950 text-white text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium leading-tight">{user?.name}</p>
                <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${getRoleBadgeColor(user?.role)}`}>
                  {user?.role}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Timetable Sheet */}
      <Timetable open={timetableOpen} onOpenChange={setTimetableOpen} />
    </header>
  )
}
