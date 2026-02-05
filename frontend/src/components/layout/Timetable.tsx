import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { groupsApi, Group } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar, Clock, Users, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimetableProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ROOMS = ['Room 1', 'Room 2', 'Room 3']

const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => {
  const hour = i + 8 // Start from 8 AM
  return `${hour.toString().padStart(2, '0')}:00`
})

const GROUP_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-teal-500',
]

function parseTime(timeStr?: string): number {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function formatTimeRange(start?: string, end?: string): string {
  if (!start) return ''
  const startFormatted = start.slice(0, 5)
  const endFormatted = end ? end.slice(0, 5) : ''
  return endFormatted ? `${startFormatted} - ${endFormatted}` : startFormatted
}

export function Timetable({ open, onOpenChange }: TimetableProps) {
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
    enabled: open,
  })

  const activeGroups = useMemo(
    () => groups.filter((g) => g.status === 'active' && g.schedule_days),
    [groups]
  )

  const groupColorMap = useMemo(() => {
    const map: Record<number, string> = {}
    activeGroups.forEach((group, index) => {
      map[group.id] = GROUP_COLORS[index % GROUP_COLORS.length]
    })
    return map
  }, [activeGroups])

  const scheduleByDay = useMemo(() => {
    const result: Record<string, Group[]> = {}
    DAYS_OF_WEEK.forEach((day) => {
      result[day] = []
    })

    activeGroups.forEach((group) => {
      if (group.schedule_days) {
        const days = group.schedule_days.split(',').map((d) => d.trim())
        days.forEach((day) => {
          if (result[day]) {
            result[day].push(group)
          }
        })
      }
    })

    // Sort by start time
    Object.keys(result).forEach((day) => {
      result[day].sort((a, b) => parseTime(a.schedule_time_start) - parseTime(b.schedule_time_start))
    })

    return result
  }, [activeGroups])

  // Schedule organized by day and room
  const scheduleByDayAndRoom = useMemo(() => {
    const result: Record<string, Record<string, Group[]>> = {}
    DAYS_OF_WEEK.forEach((day) => {
      result[day] = {}
      ROOMS.forEach((room) => {
        result[day][room] = []
      })
      result[day]['Unassigned'] = [] // For groups without a room
    })

    activeGroups.forEach((group) => {
      if (group.schedule_days) {
        const days = group.schedule_days.split(',').map((d) => d.trim())
        const room = group.room || 'Unassigned'
        days.forEach((day) => {
          if (result[day]) {
            if (result[day][room]) {
              result[day][room].push(group)
            } else {
              result[day]['Unassigned'].push(group)
            }
          }
        })
      }
    })

    // Sort by start time within each room
    Object.keys(result).forEach((day) => {
      Object.keys(result[day]).forEach((room) => {
        result[day][room].sort((a, b) => parseTime(a.schedule_time_start) - parseTime(b.schedule_time_start))
      })
    })

    return result
  }, [activeGroups])

  const weekDates = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(today.setDate(diff))
    return DAYS_OF_WEEK.map((_, index) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + index)
      return date
    })
  }, [])

  function isToday(date: Date): boolean {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  // For transposed view: calculate horizontal position based on time
  function getGroupHorizontalPosition(group: Group): { left: number; width: number } {
    const startMinutes = parseTime(group.schedule_time_start)
    const endMinutes = parseTime(group.schedule_time_end) || startMinutes + 60
    const startHour = 8 // Grid starts at 8 AM
    const totalHours = 14 // 8 AM to 10 PM

    const leftOffset = ((startMinutes - startHour * 60) / 60 / totalHours) * 100
    const duration = endMinutes - startMinutes
    const widthPercent = (duration / 60 / totalHours) * 100

    return { left: Math.max(0, leftOffset), width: Math.max(3, widthPercent) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0" preventAutoFocus>
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Class Timetable
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="week" className="flex flex-col h-[calc(100vh-100px)]">
          <div className="px-6 pb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="week">Weekly View</TabsTrigger>
              <TabsTrigger value="list">List View</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="week" className="flex-1 px-6 pb-6 mt-0">
            {/* Weekly Grid - Transposed: Days as rows, Time as columns */}
            <div className="rounded-lg border overflow-auto h-[calc(100vh-220px)]">
              <table className="w-full border-collapse" style={{ minWidth: `${80 + 32 + TIME_SLOTS.length * 55}px` }}>
                <colgroup>
                  <col style={{ width: '80px', minWidth: '80px' }} />
                  <col style={{ width: '32px', minWidth: '32px' }} />
                  {TIME_SLOTS.map((_, idx) => (
                    <col key={idx} style={{ width: '55px', minWidth: '55px' }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="bg-muted/50">
                    <th className="p-2 text-xs font-medium text-muted-foreground border-r border-b" />
                    <th className="p-2 text-xs font-medium text-muted-foreground border-r border-b" />
                    {TIME_SLOTS.map((time, idx) => (
                      <th
                        key={time}
                        className={cn(
                          'py-2 text-center text-xs font-medium text-muted-foreground border-b',
                          idx < TIME_SLOTS.length - 1 && 'border-r'
                        )}
                      >
                        {time.slice(0, 2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS_OF_WEEK.map((day, dayIndex) => (
                    ROOMS.map((room, roomIndex) => {
                      const isLastRoomInDay = roomIndex === ROOMS.length - 1
                      const isLastDay = dayIndex === DAYS_OF_WEEK.length - 1
                      return (
                      <tr
                        key={`${day}-${room}`}
                        className={cn(
                          // Dashed border between rooms within same day
                          !isLastRoomInDay && 'border-b border-dashed',
                          // Thick border between different days
                          isLastRoomInDay && !isLastDay && 'border-b-2 border-border',
                          isToday(weekDates[dayIndex]) && 'bg-primary/5'
                        )}
                      >
                        {/* Day label - only on first room, spans all rooms */}
                        {roomIndex === 0 && (
                          <td
                            rowSpan={ROOMS.length}
                            className="border-r px-2 py-1 align-middle bg-muted/20"
                          >
                            <span className="text-xs font-semibold">{DAYS_FULL[dayIndex]}</span>
                          </td>
                        )}
                        {/* Room label */}
                        <td className="border-r text-center bg-muted/10 py-1">
                          <span className="text-[10px] text-muted-foreground">{room.replace('Room ', 'R')}</span>
                        </td>
                        {/* Time grid cell spanning all time slots */}
                        <td colSpan={TIME_SLOTS.length} className="p-0 h-9 relative">
                          {/* Grid lines */}
                          <div className="absolute inset-0 flex">
                            {TIME_SLOTS.map((_, idx) => (
                              <div
                                key={idx}
                                style={{ width: '55px', minWidth: '55px' }}
                                className={cn(idx < TIME_SLOTS.length - 1 && 'border-r')}
                              />
                            ))}
                          </div>
                          {/* Class blocks for this room */}
                          {scheduleByDayAndRoom[day][room]?.map((group) => {
                            const { left, width } = getGroupHorizontalPosition(group)
                            return (
                              <div
                                key={`${day}-${room}-${group.id}`}
                                className={cn(
                                  'absolute top-1 bottom-1 rounded px-1.5 text-white text-[11px] overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shadow-sm flex items-center',
                                  groupColorMap[group.id]
                                )}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  minWidth: '45px',
                                }}
                                title={`${group.name}\n${formatTimeRange(group.schedule_time_start, group.schedule_time_end)}\nRoom: ${room}\nTeacher: ${group.teacher_name || 'N/A'}`}
                              >
                                <span className="font-medium truncate">{group.name}</span>
                              </div>
                            )
                          })}
                          {/* Unassigned groups only in first room row */}
                          {roomIndex === 0 && (scheduleByDayAndRoom[day]['Unassigned'] || []).map((group) => {
                            const { left, width } = getGroupHorizontalPosition(group)
                            return (
                              <div
                                key={`${day}-unassigned-${group.id}`}
                                className={cn(
                                  'absolute top-1 bottom-1 rounded px-1.5 text-white text-[11px] overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shadow-sm flex items-center border border-dashed border-white/50',
                                  groupColorMap[group.id]
                                )}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  minWidth: '45px',
                                }}
                                title={`${group.name}\n${formatTimeRange(group.schedule_time_start, group.schedule_time_end)}\nRoom: Not assigned\nTeacher: ${group.teacher_name || 'N/A'}`}
                              >
                                <span className="font-medium truncate">{group.name}</span>
                              </div>
                            )
                          })}
                        </td>
                      </tr>
                    )})
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              {activeGroups.slice(0, 10).map((group) => (
                <div key={group.id} className="flex items-center gap-1.5 text-xs">
                  <div className={cn('w-3 h-3 rounded', groupColorMap[group.id])} />
                  <span className="text-muted-foreground">{group.name}</span>
                </div>
              ))}
              {activeGroups.length > 10 && (
                <span className="text-xs text-muted-foreground">+{activeGroups.length - 10} more</span>
              )}
            </div>
          </TabsContent>

          <TabsContent value="list" className="flex-1 px-6 pb-6 mt-0">
            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-6">
                {DAYS_OF_WEEK.map((day, index) => {
                  const dayGroups = scheduleByDay[day]
                  if (dayGroups.length === 0) return null

                  return (
                    <div key={day}>
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs',
                            isToday(weekDates[index])
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          {weekDates[index].getDate()}
                        </span>
                        {DAYS_FULL[index]}
                        {isToday(weekDates[index]) && (
                          <Badge variant="secondary" className="text-xs">
                            Today
                          </Badge>
                        )}
                      </h3>
                      <div className="space-y-2">
                        {dayGroups.map((group) => (
                          <div
                            key={group.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div className={cn('w-1 h-12 rounded-full', groupColorMap[group.id])} />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{group.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {group.subject || 'General'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-sm">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {formatTimeRange(group.schedule_time_start, group.schedule_time_end) || 'TBD'}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <MapPin className="h-3 w-3" />
                                {group.room || 'No room'}
                              </div>
                              {group.teacher_name && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <Users className="h-3 w-3" />
                                  {group.teacher_name}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {activeGroups.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No scheduled classes</p>
                    <p className="text-sm">Add schedule to groups to see them here</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
