import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi, groupsApi } from '@/lib/api'
import type { StudentAttendanceHistory } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AttendanceSkeleton } from '@/components/skeletons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Check, X, Clock, AlertCircle, Loader2, Lock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'

const statusOptions = [
  { value: 'present', icon: Check, color: 'bg-green-500' },
  { value: 'absent', icon: X, color: 'bg-red-500' },
  { value: 'late', icon: Clock, color: 'bg-yellow-500' },
  { value: 'excused', icon: AlertCircle, color: 'bg-blue-500' },
] as const

const DAY_ABBRS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const statusDotColor: Record<string, string> = {
  present: 'bg-green-500',
  absent: 'bg-red-500',
  late: 'bg-yellow-500',
  excused: 'bg-blue-500',
}

const today = () => new Date().toISOString().split('T')[0]

export function Attendance() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(today())
  const [attendanceData, setAttendanceData] = useState<Record<number, string>>({})
  const [initialData, setInitialData] = useState<Record<number, string>>({})

  // Determine user role flags
  const userRoles = useMemo(() => (user?.role || 'user').split(',').map(r => r.trim()), [user])
  const isTeacherOnly = useMemo(
    () => userRoles.includes('teacher') && !userRoles.some(r => ['admin', 'manager', 'owner', 'developer'].includes(r)),
    [userRoles]
  )
  const isAdminRole = useMemo(
    () => userRoles.some(r => ['admin', 'owner', 'developer'].includes(r)),
    [userRoles]
  )

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  // Filter groups for teachers (also by selected date's day of week)
  const activeGroups = useMemo(() => {
    let filtered = groups.filter(g => g.status === 'active')
    if (isTeacherOnly && user?.teacher_id) {
      filtered = filtered.filter(g => g.teacher_id === user.teacher_id)
      // Also filter by selected date's day
      const dayIndex = new Date(selectedDate).getDay()
      const dayAbbr = DAY_ABBRS[dayIndex]
      filtered = filtered.filter(g => {
        if (!g.schedule_days) return false
        const days = g.schedule_days.toLowerCase().split(',').map(d => d.trim())
        return days.includes(dayAbbr)
      })
    }
    return filtered
  }, [groups, isTeacherOnly, user?.teacher_id, selectedDate])

  // Clear selected group if it's no longer in the filtered list (e.g. date changed)
  useEffect(() => {
    if (selectedGroup && activeGroups.length > 0 && !activeGroups.some(g => g.id === Number(selectedGroup))) {
      setSelectedGroup('')
    }
  }, [activeGroups, selectedGroup])

  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', selectedGroup, selectedDate],
    queryFn: () => attendanceApi.get(Number(selectedGroup), selectedDate),
    enabled: !!selectedGroup && !!selectedDate,
  })

  // Fetch attendance history for the selected group
  const { data: historyData } = useQuery({
    queryKey: ['attendance-history', selectedGroup],
    queryFn: () => attendanceApi.getHistory(Number(selectedGroup)),
    enabled: !!selectedGroup,
  })

  // Fetch unmarked groups for today
  const { data: unmarkedGroups = [] } = useQuery({
    queryKey: ['attendance-unmarked'],
    queryFn: attendanceApi.getUnmarked,
  })

  // Build history lookup
  const historyMap = useMemo(() => {
    const map: Record<number, StudentAttendanceHistory> = {}
    if (historyData) {
      for (const h of historyData) {
        map[h.student_id] = h
      }
    }
    return map
  }, [historyData])

  // Schedule day check
  const selectedGroupObj = useMemo(
    () => groups.find(g => g.id === Number(selectedGroup)),
    [groups, selectedGroup]
  )
  const isNonClassDay = useMemo(() => {
    if (!selectedGroupObj?.schedule_days || !selectedDate) return false
    const dayIndex = new Date(selectedDate).getDay()
    const dayAbbr = DAY_ABBRS[dayIndex]
    const scheduleDays = selectedGroupObj.schedule_days.toLowerCase().split(',').map(d => d.trim())
    return !scheduleDays.includes(dayAbbr)
  }, [selectedGroupObj, selectedDate])

  // 48h edit lock
  const isLocked = useMemo(() => {
    if (isAdminRole) return false
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    twoDaysAgo.setHours(0, 0, 0, 0)
    const selDate = new Date(selectedDate)
    return selDate < twoDaysAgo
  }, [selectedDate, isAdminRole])

  const saveAttendance = useMutation({
    mutationFn: () => {
      const rows = Object.entries(attendanceData).map(([studentId, status]) => ({
        student_id: Number(studentId),
        status,
      }))
      return attendanceApi.save(Number(selectedGroup), selectedDate, rows)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-history', selectedGroup] })
      queryClient.invalidateQueries({ queryKey: ['attendance-unmarked'] })
      setInitialData(attendanceData)
      toast({ title: t('attendance.toast_saved', 'Attendance saved successfully') })
    },
    onError: (err: Error) => {
      toast({
        title: t('attendance.toast_save_error', 'Failed to save attendance'),
        description: err.message,
        variant: 'destructive',
      })
    },
  })

  // Initialize attendance data when fetched data changes
  useEffect(() => {
    if (attendance?.rows) {
      const data: Record<number, string> = {}
      attendance.rows.forEach(row => {
        if (row.attendance_status) data[row.student_id] = row.attendance_status
      })
      setAttendanceData(data)
      setInitialData(data)
    }
  }, [attendance])

  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(attendanceData), ...Object.keys(initialData)])
    for (const k of keys) {
      if (attendanceData[Number(k)] !== initialData[Number(k)]) return true
    }
    return false
  }, [attendanceData, initialData])

  const isFutureDate = selectedDate > today()

  // Get "marked by" name from first row that has it
  const markedByName = useMemo(() => {
    if (!attendance?.rows) return null
    for (const row of attendance.rows) {
      if (row.marked_by_name) return row.marked_by_name
    }
    return null
  }, [attendance])

  // Summary stats
  const stats = useMemo(() => {
    if (!attendance?.rows?.length) return null
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
    for (const row of attendance.rows) {
      const status = attendanceData[row.student_id] || row.attendance_status
      if (status && status in counts) counts[status as keyof typeof counts]++
      else counts.unmarked++
    }
    return { ...counts, total: attendance.rows.length }
  }, [attendance, attendanceData])

  function getStatusLabel(value: string) {
    switch (value) {
      case 'present': return t('attendance.present', 'Present')
      case 'absent': return t('attendance.absent', 'Absent')
      case 'late': return t('attendance.late', 'Late')
      case 'excused': return t('attendance.excused', 'Excused')
      default: return value
    }
  }

  function handleStatusChange(studentId: number, status: string) {
    if (isLocked || isFutureDate) return
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: status,
    }))
  }

  function handleSelectAll(status: string) {
    if (isLocked || isFutureDate) return
    if (attendance?.rows) {
      const newData: Record<number, string> = {}
      attendance.rows.forEach(row => {
        newData[row.student_id] = status
      })
      setAttendanceData(newData)
    }
  }

  function handleDateChange(value: string) {
    setSelectedDate(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('attendance.title', 'Attendance')}</h1>
        <p className="text-muted-foreground">{t('attendance.description', 'Mark daily attendance for groups')}</p>
      </div>

      {/* Unmarked groups banner */}
      {(() => {
        const filtered = isTeacherOnly && user?.teacher_id
          ? unmarkedGroups.filter((g: any) => g.teacher_id === user.teacher_id)
          : unmarkedGroups
        return filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {t('attendance.unmarked_today', '{count} groups not yet marked today:').replace('{count}', String(filtered.length))}
          </span>
          {filtered.map((g: any, i: number) => (
            <span key={g.id}>
              <button
                className="text-amber-700 underline hover:text-amber-900"
                onClick={() => {
                  setSelectedGroup(String(g.id))
                  setSelectedDate(today())
                }}
              >
                {g.name}
              </button>
              {i < filtered.length - 1 && ', '}
            </span>
          ))}
        </div>
      )})()}

      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="space-y-2 w-full sm:w-auto">
          <Label>{t('attendance.form_group', 'Group')}</Label>
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="w-full sm:w-[250px]">
              <SelectValue placeholder={t('attendance.select_group', 'Select a group')} />
            </SelectTrigger>
            <SelectContent>
              {activeGroups.map((group) => (
                <SelectItem key={group.id} value={group.id.toString()}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('attendance.form_date', 'Date')}</Label>
          <DateInput
            value={selectedDate}
            onChange={handleDateChange}
            className={cn("w-[140px]", isFutureDate && "border-red-300 focus-visible:ring-red-500")}
          />
          {isFutureDate && (
            <p className="text-xs text-red-500">{t('attendance.future_date_error', 'Cannot mark attendance for future dates')}</p>
          )}
        </div>
      </div>

      {/* Schedule warning */}
      {selectedGroup && isNonClassDay && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          {t('attendance.schedule_warning', 'This group is not scheduled for classes on this day. You can still save for makeup classes.')}
        </div>
      )}

      {/* Edit lock warning */}
      {selectedGroup && isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Lock className="h-4 w-4 text-red-600 shrink-0" />
          {t('attendance.locked_message', 'Attendance locked after 48 hours. Contact admin to edit.')}
        </div>
      )}

      {!selectedGroup ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('attendance.empty_no_group', 'Select a group to mark attendance')}
          </CardContent>
        </Card>
      ) : attendanceLoading ? (
        <AttendanceSkeleton />
      ) : !attendance?.rows?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('attendance.empty_no_students', 'No students enrolled in this group')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>
                {t('attendance.title_for_group', 'Attendance for {group}').replace('{group}', selectedGroupObj?.name || '')}
              </CardTitle>
              {stats && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{stats.total} {t('attendance.students', 'students')}:</span>
                  <span className="text-green-600 font-medium">{stats.present} {t('attendance.present', 'Present')}</span>
                  <span className="text-red-600 font-medium">{stats.absent} {t('attendance.absent', 'Absent')}</span>
                  {stats.late > 0 && <span className="text-yellow-600 font-medium">{stats.late} {t('attendance.late', 'Late')}</span>}
                  {stats.excused > 0 && <span className="text-blue-600 font-medium">{stats.excused} {t('attendance.excused', 'Excused')}</span>}
                  {stats.unmarked > 0 && <span className="text-muted-foreground font-medium">{stats.unmarked} {t('attendance.unmarked', 'Unmarked')}</span>}
                </div>
              )}
            </div>
            {!isLocked && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('attendance.mark_all', 'Mark all as:')}</span>
                {statusOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant="outline"
                    onClick={() => handleSelectAll(option.value)}
                    className="h-8"
                    disabled={isFutureDate}
                  >
                    <option.icon className={cn("h-4 w-4 mr-1", option.value === 'present' ? 'text-green-600' : option.value === 'absent' ? 'text-red-600' : option.value === 'late' ? 'text-yellow-600' : 'text-blue-600')} />
                    {getStatusLabel(option.value)}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attendance.rows.map((row) => {
                const studentHistory = historyMap[row.student_id]
                return (
                  <div
                    key={row.student_id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{row.student_name}</span>
                        {/* Percentage badge */}
                        {studentHistory && studentHistory.total > 0 && (
                          <span className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full text-white",
                            studentHistory.percentage >= 85 ? 'bg-green-500' :
                            studentHistory.percentage >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          )}>
                            {studentHistory.percentage}%
                          </span>
                        )}
                      </div>
                      {/* History dots */}
                      {studentHistory && studentHistory.history.length > 0 && (
                        <div className="flex items-center gap-1">
                          {studentHistory.history.map((h, idx) => (
                            <div
                              key={idx}
                              title={`${h.date}: ${h.status}`}
                              className={cn("h-2.5 w-2.5 rounded-full", statusDotColor[h.status] || 'bg-gray-300')}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {statusOptions.map((option) => {
                        const isSelected = (attendanceData[row.student_id] || row.attendance_status) === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleStatusChange(row.student_id, option.value)}
                            disabled={isLocked || isFutureDate}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              isSelected
                                ? `${option.color} text-white`
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                              (isLocked || isFutureDate) && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <option.icon className="h-4 w-4" />
                            {getStatusLabel(option.value)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {markedByName && (
                  <span>{t('attendance.last_saved_by', 'Last saved by {name}').replace('{name}', markedByName)}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isDirty && (
                  <span className="text-sm text-amber-600">{t('attendance.unsaved_changes', 'You have unsaved changes')}</span>
                )}
                <Button
                  onClick={() => saveAttendance.mutate()}
                  disabled={saveAttendance.isPending || !isDirty || isFutureDate || isLocked || (stats?.unmarked ?? 0) > 0}
                >
                  {saveAttendance.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLocked && <Lock className="mr-2 h-4 w-4" />}
                  {t('attendance.save', 'Save Attendance')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedGroup && attendance?.rows?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('attendance.legend_title', 'Legend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {statusOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <div className={cn("h-4 w-4 rounded", option.color)} />
                  <span className="text-sm">{getStatusLabel(option.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
