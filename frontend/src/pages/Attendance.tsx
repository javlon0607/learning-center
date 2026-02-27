import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi, groupsApi } from '@/lib/api'
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
import { Check, X, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'

const statusOptions = [
  { value: 'present', label: 'Present', icon: Check, color: 'bg-green-500' },
  { value: 'absent', label: 'Absent', icon: X, color: 'bg-red-500' },
  { value: 'late', label: 'Late', icon: Clock, color: 'bg-yellow-500' },
  { value: 'excused', label: 'Excused', icon: AlertCircle, color: 'bg-blue-500' },
]

export function Attendance() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceData, setAttendanceData] = useState<Record<number, string>>({})

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const activeGroups = groups.filter(g => g.status === 'active')

  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', selectedGroup, selectedDate],
    queryFn: () => attendanceApi.get(Number(selectedGroup), selectedDate),
    enabled: !!selectedGroup && !!selectedDate,
  })

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
      toast({ title: 'Attendance saved successfully' })
    },
  })

  // Initialize attendance data when loaded
  useState(() => {
    if (attendance?.rows) {
      const initialData: Record<number, string> = {}
      attendance.rows.forEach(row => {
        initialData[row.student_id] = row.attendance_status || 'present'
      })
      setAttendanceData(initialData)
    }
  })

  function handleStatusChange(studentId: number, status: string) {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: status,
    }))
  }

  function getStatusLabel(value: string) {
    switch (value) {
      case 'present': return t('attendance.present', 'Present')
      case 'absent': return t('attendance.absent', 'Absent')
      case 'late': return t('attendance.late', 'Late')
      case 'excused': return t('attendance.excused', 'Excused')
      default: return value
    }
  }

  function handleSelectAll(status: string) {
    if (attendance?.rows) {
      const newData: Record<number, string> = {}
      attendance.rows.forEach(row => {
        newData[row.student_id] = status
      })
      setAttendanceData(newData)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('attendance.title', 'Attendance')}</h1>
        <p className="text-muted-foreground">{t('attendance.description', 'Mark daily attendance for groups')}</p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="space-y-2 w-full sm:w-auto">
          <Label>{t('attendance.form_group', 'Group')}</Label>
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="w-full sm:w-[250px]">
              <SelectValue placeholder="Select a group" />
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
            onChange={setSelectedDate}
            className="w-[140px]"
          />
        </div>
      </div>

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
            <CardTitle>
              Attendance for {groups.find(g => g.id === Number(selectedGroup))?.name}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('attendance.mark_all', 'Mark all as:')}</span>
              {statusOptions.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelectAll(option.value)}
                  className="h-8"
                >
                  <option.icon className={cn("h-4 w-4 mr-1", option.value === 'present' ? 'text-green-600' : option.value === 'absent' ? 'text-red-600' : option.value === 'late' ? 'text-yellow-600' : 'text-blue-600')} />
                  {getStatusLabel(option.value)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attendance.rows.map((row) => (
                <div
                  key={row.student_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-3"
                >
                  <div className="font-medium">{row.student_name}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusOptions.map((option) => {
                      const isSelected = (attendanceData[row.student_id] || row.attendance_status || 'present') === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => handleStatusChange(row.student_id, option.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            isSelected
                              ? `${option.color} text-white`
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          <option.icon className="h-4 w-4" />
                          {getStatusLabel(option.value)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => saveAttendance.mutate()}
                disabled={saveAttendance.isPending}
              >
                {saveAttendance.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('attendance.save', 'Save Attendance')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  )
}
