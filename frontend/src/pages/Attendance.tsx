import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi, groupsApi, marksApi } from '@/lib/api'
import type { StudentAttendanceHistory, StudentMarkHistory, UnmarkedGroup } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AttendanceSkeleton } from '@/components/skeletons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Check, X, Clock, AlertCircle, Loader2, Lock, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Star, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/contexts/PermissionsContext'

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

type SortKey = 'name' | 'percentage'
type SortDir = 'asc' | 'desc'

const today = () => new Date().toISOString().split('T')[0]

export function Attendance() {
  const { t } = useTranslation()
  const { hasFeature } = usePermissions()
  const [activeTab, setActiveTab] = useState('attendance')
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(today())
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const { user } = useAuth()

  const userRoles = useMemo(() => (user?.role || 'user').split(',').map(r => r.trim()), [user])
  const isTeacherOnly = useMemo(
    () => userRoles.includes('teacher') && !userRoles.some(r => ['admin', 'manager', 'owner', 'developer'].includes(r)),
    [userRoles]
  )

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const activeGroups = useMemo(() => {
    let filtered = groups.filter(g => g.status === 'active')
    if (isTeacherOnly && user?.teacher_id) {
      filtered = filtered.filter(g => g.teacher_id === user.teacher_id)
      const dayIndex = new Date(selectedDate).getDay()
      const dayAbbr = DAY_ABBRS[dayIndex]
      filtered = filtered.filter(g => {
        if (!g.schedule_days) return false
        return g.schedule_days.toLowerCase().split(',').map(d => d.trim()).includes(dayAbbr)
      })
    }
    return filtered
  }, [groups, isTeacherOnly, user?.teacher_id, selectedDate])

  // Clear selected group only when date changes and the group is no longer valid
  useEffect(() => {
    if (selectedGroup && activeGroups.length > 0 && !activeGroups.some(g => g.id === Number(selectedGroup))) {
      setSelectedGroup('')
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const showMarksTab = hasFeature('marks')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('attendance.title', 'Attendance')}</h1>
        <p className="text-muted-foreground">{t('attendance.description', 'Mark daily attendance for groups')}</p>
      </div>

      {/* Group & date selectors — shared between tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="space-y-2 w-full sm:w-auto">
          <Label>{t('attendance.form_group', 'Group')}</Label>
          <Popover open={groupOpen} onOpenChange={(o) => { setGroupOpen(o); if (!o) setGroupSearch('') }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-10 w-full sm:w-[250px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  !selectedGroup && "text-muted-foreground"
                )}
              >
                <span className="truncate">
                  {selectedGroup
                    ? activeGroups.find(g => g.id === Number(selectedGroup))?.name ?? t('attendance.select_group', 'Select a group')
                    : t('attendance.select_group', 'Select a group')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  placeholder={t('attendance.search_group', 'Search group...')}
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto py-1">
                {activeGroups
                  .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
                  .map(group => (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2",
                        selectedGroup === group.id.toString() && "bg-accent font-medium"
                      )}
                      onClick={() => { setSelectedGroup(group.id.toString()); setGroupOpen(false); setGroupSearch('') }}
                    >
                      {selectedGroup === group.id.toString() && <Check className="h-3.5 w-3.5 shrink-0" />}
                      <span className={cn(selectedGroup !== group.id.toString() && "pl-[22px]")}>{group.name}</span>
                    </button>
                  ))}
                {activeGroups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t('attendance.no_groups_found', 'No groups found')}</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label>{t('attendance.form_date', 'Date')}</Label>
          <DateInput
            value={selectedDate}
            onChange={setSelectedDate}
            className={cn("w-[140px]", selectedDate > today() && "border-red-300 focus-visible:ring-red-500")}
          />
          {selectedDate > today() && (
            <p className="text-xs text-red-500">{t('attendance.future_date_error', 'Cannot mark attendance for future dates')}</p>
          )}
        </div>
      </div>

      {showMarksTab ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="attendance">{t('attendance.tab_attendance', 'Attendance')}</TabsTrigger>
            <TabsTrigger value="marks">{t('attendance.tab_marks', 'Marks')}</TabsTrigger>
          </TabsList>
          <TabsContent value="attendance" className="mt-4">
            <AttendanceTab
              selectedGroup={selectedGroup}
              selectedDate={selectedDate}
              setSelectedGroup={setSelectedGroup}
              setSelectedDate={setSelectedDate}
              groups={groups}
            />
          </TabsContent>
          <TabsContent value="marks" className="mt-4">
            <MarksTab
              selectedGroup={selectedGroup}
              selectedDate={selectedDate}
              groups={groups}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <AttendanceTab
          selectedGroup={selectedGroup}
          selectedDate={selectedDate}
          setSelectedGroup={setSelectedGroup}
          setSelectedDate={setSelectedDate}
          groups={groups}
        />
      )}
    </div>
  )
}

// ── Attendance Tab ──────────────────────────────────────────────────────

interface AttendanceTabProps {
  selectedGroup: string
  selectedDate: string
  setSelectedGroup: (g: string) => void
  setSelectedDate: (d: string) => void
  groups: { id: number; name: string; schedule_days?: string; teacher_id?: number; status: string }[]
}

function AttendanceTab({ selectedGroup, selectedDate, setSelectedGroup, setSelectedDate, groups }: AttendanceTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [attendanceData, setAttendanceData] = useState<Record<number, string>>({})
  const [initialData, setInitialData] = useState<Record<number, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const userRoles = useMemo(() => (user?.role || 'user').split(',').map(r => r.trim()), [user])
  const isTeacherOnly = useMemo(
    () => userRoles.includes('teacher') && !userRoles.some(r => ['admin', 'manager', 'owner', 'developer'].includes(r)),
    [userRoles]
  )
  const isAdminRole = useMemo(
    () => userRoles.some(r => ['admin', 'owner', 'developer'].includes(r)),
    [userRoles]
  )

  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', selectedGroup, selectedDate],
    queryFn: () => attendanceApi.get(Number(selectedGroup), selectedDate),
    enabled: !!selectedGroup && !!selectedDate,
  })

  const { data: historyData } = useQuery({
    queryKey: ['attendance-history', selectedGroup],
    queryFn: () => attendanceApi.getHistory(Number(selectedGroup)),
    enabled: !!selectedGroup,
  })

  const { data: unmarkedGroups = [] } = useQuery({
    queryKey: ['attendance-unmarked'],
    queryFn: attendanceApi.getUnmarked,
  })

  const filteredUnmarked: UnmarkedGroup[] = useMemo(() => {
    if (isTeacherOnly && user?.teacher_id) {
      // eslint-disable-next-line eqeqeq
      return unmarkedGroups.filter(g => g.teacher_id == user.teacher_id)
    }
    return unmarkedGroups
  }, [unmarkedGroups, isTeacherOnly, user?.teacher_id])

  const historyMap = useMemo(() => {
    const map: Record<number, StudentAttendanceHistory> = {}
    if (historyData) {
      for (const h of historyData) map[h.student_id] = h
    }
    return map
  }, [historyData])

  const selectedGroupObj = useMemo(
    () => groups.find(g => g.id === Number(selectedGroup)),
    [groups, selectedGroup]
  )

  const isNonClassDay = useMemo(() => {
    if (!selectedGroupObj?.schedule_days || !selectedDate) return false
    const dayAbbr = DAY_ABBRS[new Date(selectedDate).getDay()]
    return !selectedGroupObj.schedule_days.toLowerCase().split(',').map(d => d.trim()).includes(dayAbbr)
  }, [selectedGroupObj, selectedDate])

  const isLocked = useMemo(() => {
    if (isAdminRole) return false
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    twoDaysAgo.setHours(0, 0, 0, 0)
    return new Date(selectedDate) < twoDaysAgo
  }, [selectedDate, isAdminRole])

  const sortedRows = useMemo(() => {
    if (!attendance?.rows) return []
    return [...attendance.rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.student_name.localeCompare(b.student_name)
      } else {
        const pa = historyMap[a.student_id]?.percentage ?? -1
        const pb = historyMap[b.student_id]?.percentage ?? -1
        cmp = pa - pb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [attendance?.rows, sortKey, sortDir, historyMap])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

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

  const markedByName = useMemo(() => {
    if (!attendance?.rows) return null
    for (const row of attendance.rows) {
      if (row.marked_by_name) return row.marked_by_name
    }
    return null
  }, [attendance])

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
    setAttendanceData(prev => ({ ...prev, [studentId]: status }))
  }

  function handleSelectAll(status: string) {
    if (isLocked || isFutureDate) return
    if (attendance?.rows) {
      const newData: Record<number, string> = {}
      attendance.rows.forEach(row => { newData[row.student_id] = status })
      setAttendanceData(newData)
    }
  }

  function handleBannerGroupClick(groupId: number) {
    setSelectedGroup(String(groupId))
    setSelectedDate(today())
  }

  return (
    <div className="space-y-4">
      {/* Unmarked groups banner */}
      {filteredUnmarked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {t('attendance.unmarked_today', '{count} groups not yet marked today:').replace('{count}', String(filteredUnmarked.length))}
          </span>
          {filteredUnmarked.map((g, i) => (
            <span key={g.id}>
              <button
                type="button"
                className="text-amber-700 underline underline-offset-2 hover:text-amber-900 font-medium"
                onClick={() => handleBannerGroupClick(g.id)}
              >
                {g.name}
              </button>
              {i < filteredUnmarked.length - 1 && <span className="text-amber-600">,</span>}
            </span>
          ))}
        </div>
      )}

      {selectedGroup && isNonClassDay && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          {t('attendance.schedule_warning', 'This group is not scheduled for classes on this day. You can still save for makeup classes.')}
        </div>
      )}

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
                    <option.icon className={cn("h-4 w-4 mr-1",
                      option.value === 'present' ? 'text-green-600' :
                      option.value === 'absent' ? 'text-red-600' :
                      option.value === 'late' ? 'text-yellow-600' : 'text-blue-600'
                    )} />
                    {getStatusLabel(option.value)}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {/* Sort controls */}
            <div className="flex items-center gap-1 border-b px-4 py-2">
              <span className="text-xs text-muted-foreground mr-1">{t('attendance.sort_by', 'Sort by:')}</span>
              <button
                onClick={() => handleSort('name')}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                  sortKey === 'name'
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('attendance.col_student', 'Name')} <SortIcon col="name" />
              </button>
              <button
                onClick={() => handleSort('percentage')}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                  sortKey === 'percentage'
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t('attendance.col_attendance', 'Attendance %')} <SortIcon col="percentage" />
              </button>
            </div>

            {/* Student rows */}
            <div className="divide-y">
              {sortedRows.map((row) => {
                const studentHistory = historyMap[row.student_id]
                const currentStatus = attendanceData[row.student_id] || row.attendance_status
                return (
                  <div
                    key={row.student_id}
                    className="grid items-center gap-3 px-4 py-3"
                    style={{ gridTemplateColumns: '1fr 140px auto' }}
                  >
                    {/* Col 1: name + % badge + history dots */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{row.student_name}</span>
                        {studentHistory && studentHistory.total > 0 && (
                          <span className={cn(
                            "text-xs font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0",
                            studentHistory.percentage >= 85 ? 'bg-green-500' :
                            studentHistory.percentage >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          )}>
                            {studentHistory.percentage}%
                          </span>
                        )}
                      </div>
                      {studentHistory && studentHistory.history.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {studentHistory.history.map((h, idx) => (
                            <div
                              key={idx}
                              title={`${h.date}: ${h.status}`}
                              className={cn("h-2 w-2 rounded-full shrink-0", statusDotColor[h.status] || 'bg-gray-300')}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Col 2: phone numbers */}
                    <div className="flex flex-col gap-0.5">
                      {row.phone && (
                        <a
                          href={`tel:${row.phone}`}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                        >
                          {row.phone}
                        </a>
                      )}
                      {row.parent_phone && (
                        <a
                          href={`tel:${row.parent_phone}`}
                          className="text-xs text-muted-foreground hover:text-blue-600 hover:underline truncate"
                        >
                          {row.parent_phone}
                        </a>
                      )}
                    </div>

                    {/* Col 3: status buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {statusOptions.map((option) => {
                        const isSelected = currentStatus === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleStatusChange(row.student_id, option.value)}
                            disabled={isLocked || isFutureDate}
                            title={getStatusLabel(option.value)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                              isSelected
                                ? `${option.color} text-white`
                                : "bg-muted text-muted-foreground hover:bg-muted/70",
                              (isLocked || isFutureDate) && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <option.icon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{getStatusLabel(option.value)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t px-4 py-4 flex items-center justify-between">
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
                  {saveAttendance.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

// ── Marks Tab ───────────────────────────────────────────────────────────

const scoreColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-lime-500',
  5: 'bg-green-500',
}

const scoreDotColor: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-lime-500',
  5: 'bg-green-500',
}

interface MarksTabProps {
  selectedGroup: string
  selectedDate: string
  groups: { id: number; name: string }[]
}

function MarksTab({ selectedGroup, selectedDate, groups }: MarksTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [marksData, setMarksData] = useState<Record<number, number | null>>({})
  const [initialMarks, setInitialMarks] = useState<Record<number, number | null>>({})
  const [topic, setTopic] = useState('')
  const [initialTopic, setInitialTopic] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const isFutureDate = selectedDate > today()

  const { data: marks, isLoading } = useQuery({
    queryKey: ['marks', selectedGroup, selectedDate],
    queryFn: () => marksApi.get(Number(selectedGroup), selectedDate),
    enabled: !!selectedGroup && !!selectedDate,
  })

  const { data: markHistory } = useQuery({
    queryKey: ['marks-history', selectedGroup],
    queryFn: () => marksApi.getHistory(Number(selectedGroup)),
    enabled: !!selectedGroup,
  })

  const historyMap = useMemo(() => {
    const map: Record<number, StudentMarkHistory> = {}
    if (markHistory) {
      for (const h of markHistory) map[h.student_id] = h
    }
    return map
  }, [markHistory])

  const sortedRows = useMemo(() => {
    if (!marks?.rows) return []
    return [...marks.rows].sort((a, b) => {
      const cmp = a.student_name.localeCompare(b.student_name)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [marks?.rows, sortDir])

  useEffect(() => {
    if (marks?.rows) {
      const data: Record<number, number | null> = {}
      let savedTopic = ''
      marks.rows.forEach(row => {
        data[row.student_id] = row.score ?? null
        if (row.topic && !savedTopic) savedTopic = row.topic
      })
      setMarksData(data)
      setInitialMarks(data)
      setTopic(savedTopic)
      setInitialTopic(savedTopic)
    }
  }, [marks])

  const isDirty = useMemo(() => {
    if (topic !== initialTopic) return true
    const keys = new Set([...Object.keys(marksData), ...Object.keys(initialMarks)])
    for (const k of keys) {
      if (marksData[Number(k)] !== initialMarks[Number(k)]) return true
    }
    return false
  }, [marksData, initialMarks, topic, initialTopic])

  const saveMarks = useMutation({
    mutationFn: () => {
      const rows = Object.entries(marksData).map(([studentId, score]) => ({
        student_id: Number(studentId),
        score,
      }))
      return marksApi.save(Number(selectedGroup), selectedDate, topic, rows)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marks'] })
      queryClient.invalidateQueries({ queryKey: ['marks-history', selectedGroup] })
      setInitialMarks(marksData)
      setInitialTopic(topic)
      toast({ title: t('marks.toast_saved', 'Marks saved successfully') })
    },
    onError: (err: Error) => {
      toast({ title: t('marks.toast_save_error', 'Failed to save marks'), description: err.message, variant: 'destructive' })
    },
  })

  function handleScoreChange(studentId: number, score: number) {
    if (isFutureDate) return
    setMarksData(prev => ({
      ...prev,
      [studentId]: prev[studentId] === score ? null : score, // toggle off if same
    }))
  }

  const selectedGroupObj = groups.find(g => g.id === Number(selectedGroup))

  if (!selectedGroup) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('marks.empty_no_group', 'Select a group to mark grades')}
        </CardContent>
      </Card>
    )
  }

  if (isLoading) return <AttendanceSkeleton />

  if (!marks?.rows?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('marks.empty_no_students', 'No students enrolled in this group')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>
              {t('marks.title_for_group', 'Marks for {group}').replace('{group}', selectedGroupObj?.name || '')}
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label className="text-sm shrink-0">{t('marks.topic', 'Topic')}:</Label>
              <Input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder={t('marks.topic_placeholder', 'e.g. Unit 3 Test')}
                className="h-8 text-sm max-w-[200px]"
                disabled={isFutureDate}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex items-center gap-1 border-b px-4 py-2">
            <span className="text-xs text-muted-foreground mr-1">{t('attendance.sort_by', 'Sort by:')}</span>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-muted font-medium text-foreground transition-colors"
            >
              {t('attendance.col_student', 'Name')}
              {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            </button>
          </div>
          <div className="divide-y">
            {sortedRows.map((row) => {
              const currentScore = marksData[row.student_id]
              const history = historyMap[row.student_id]
              const attStatus = row.attendance_status ?? null
              const isBlocked = attStatus === 'absent' || attStatus === 'excused'
              return (
                <div
                  key={row.student_id}
                  className={cn(
                    "grid items-center gap-3 px-4 py-3",
                    isBlocked && "opacity-60 bg-muted/30"
                  )}
                  style={{ gridTemplateColumns: '1fr auto' }}
                >
                  {/* Student name + avg badge + history dots */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{row.student_name}</span>
                      {history && history.total > 0 && (
                        <span className={cn(
                          "text-xs font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0",
                          history.average >= 4 ? 'bg-green-500' :
                          history.average >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                        )}>
                          {history.average}
                        </span>
                      )}
                      {isBlocked && (
                        <span className="text-xs text-muted-foreground italic">
                          {attStatus === 'absent' ? t('marks.blocked_absent', 'Kelmagan') : t('marks.blocked_excused', 'Sababli')}
                        </span>
                      )}
                    </div>
                    {history && history.history.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {history.history.map((h, idx) => (
                          <div
                            key={idx}
                            title={`${h.date}: ${h.score}`}
                            className={cn("h-2 w-2 rounded-full shrink-0", scoreDotColor[h.score] || 'bg-gray-300')}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score buttons (1-5) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((score) => {
                      const isSelected = currentScore === score
                      const isDisabled = isFutureDate || isBlocked
                      return (
                        <button
                          key={score}
                          onClick={() => handleScoreChange(row.student_id, score)}
                          disabled={isDisabled}
                          title={`Score ${score}`}
                          className={cn(
                            "flex items-center justify-center rounded-lg w-9 h-9 text-sm font-bold transition-colors",
                            isSelected
                              ? `${scoreColors[score]} text-white`
                              : "bg-muted text-muted-foreground hover:bg-muted/70",
                            isDisabled && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {score}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t px-4 py-4 flex items-center justify-end gap-3">
            {isDirty && (
              <span className="text-sm text-amber-600">{t('marks.unsaved_changes', 'You have unsaved changes')}</span>
            )}
            <Button
              onClick={() => saveMarks.mutate()}
              disabled={saveMarks.isPending || !isDirty || isFutureDate}
            >
              {saveMarks.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Star className="mr-2 h-4 w-4" />
              {t('marks.save', 'Save Marks')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('marks.legend_title', 'Score Legend')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5].map(score => (
              <div key={score} className="flex items-center gap-2">
                <div className={cn("h-4 w-4 rounded", scoreColors[score])} />
                <span className="text-sm">{score}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
