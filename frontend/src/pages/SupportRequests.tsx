import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supportRequestsApi, studentsApi, employeesApi, groupsApi, enrollmentsApi, SupportRequest, Employee, Student, Group } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, XCircle, Loader2, User2, Bot, ChevronsUpDown, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TIME_SLOTS = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date()
  const dow = today.getDay()
  const diffToMon = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + diffToMon + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function formatWeekRange(days: Date[]) {
  const first = days[0], last = days[days.length - 1]
  return `${first.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const STATUS_STYLES = {
  pending:   'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100',
  confirmed: 'bg-green-50 border border-green-300 text-green-800 hover:bg-green-100',
  cancelled: 'bg-gray-50 border border-gray-200 text-gray-400 line-through cursor-default',
}

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700 border-amber-300',
  confirmed: 'bg-green-100 text-green-700 border-green-300',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-300',
}

export function SupportRequests() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addDate, setAddDate] = useState('')
  const [addTime, setAddTime] = useState('')
  const [addGroupId, setAddGroupId] = useState('')
  const [addStudentId, setAddStudentId] = useState('')
  const [addStudentSearch, setAddStudentSearch] = useState('')
  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const studentDropdownRef = useRef<HTMLDivElement>(null)
  const [addTopic, setAddTopic] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [confirmAssignee, setConfirmAssignee] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  useEffect(() => {
    if (!addStudentOpen) return
    function handleClick(e: MouseEvent) {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(e.target as Node)) {
        setAddStudentOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [addStudentOpen])

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const fromDate = formatDate(weekDays[0])
  const toDate = formatDate(weekDays[5])

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['support-requests', fromDate, toDate],
    queryFn: () => supportRequestsApi.getAll(fromDate, toDate),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getAll(),
    enabled: addOpen,
  })

  const activeGroups = (groups as Group[])
    .filter(g => g.status === 'active')
    .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)

  const { data: groupEnrollments = [] } = useQuery({
    queryKey: ['enrollments', 'group', addGroupId],
    queryFn: () => enrollmentsApi.getByGroup(Number(addGroupId)),
    enabled: addOpen && !!addGroupId,
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
    enabled: addOpen,
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => employeesApi.getAll({ status: 'active' }),
    enabled: confirmOpen,
  })

  const teachingAssistants = (employees as Employee[]).filter(e =>
    e.position.toLowerCase().includes('teaching assistant')
  )

  // Build slot map: "YYYY-MM-DD_HH:MM" → SupportRequest
  const slotMap = useMemo(() => {
    const m: Record<string, SupportRequest> = {}
    for (const r of requests) m[`${r.scheduled_date}_${r.scheduled_time}`] = r
    return m
  }, [requests])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['support-requests'] })

  const createMutation = useMutation({
    mutationFn: () => supportRequestsApi.create({
      student_id: Number(addStudentId),
      scheduled_date: addDate,
      scheduled_time: addTime,
      topic: addTopic || undefined,
      notes: addNotes || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'Request added' })
      setAddOpen(false)
      setAddGroupId(''); setAddStudentId(''); setAddDate(''); setAddTime(''); setAddTopic(''); setAddNotes(''); setAddStudentSearch('')
      invalidate()
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const confirmMutation = useMutation({
    mutationFn: () => supportRequestsApi.confirm(selectedRequest!.id, Number(confirmAssignee)),
    onSuccess: () => {
      toast({ title: 'Confirmed', description: 'Student notified via Telegram' })
      setConfirmOpen(false); setSelectedRequest(null); setConfirmAssignee('')
      invalidate()
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const cancelMutation = useMutation({
    mutationFn: () => supportRequestsApi.cancel(selectedRequest!.id, cancelReason || undefined),
    onSuccess: () => {
      toast({ title: 'Cancelled' })
      setCancelOpen(false); setSelectedRequest(null); setCancelReason('')
      invalidate()
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => supportRequestsApi.delete(id),
    onSuccess: () => { toast({ title: 'Deleted' }); setSelectedRequest(null); invalidate() },
  })

  const enrolledStudentIds = useMemo(
    () => new Set(groupEnrollments.map((e: { student_id: number }) => e.student_id)),
    [groupEnrollments]
  )

  const filteredStudents = useMemo(() =>
    (students as Student[])
      .filter(s => {
        if (s.status !== 'active') return false
        if (addGroupId && !enrolledStudentIds.has(s.id)) return false
        if (addStudentSearch) return `${s.first_name} ${s.last_name}`.toLowerCase().includes(addStudentSearch.toLowerCase())
        return true
      })
      .sort((a, b) => {
        const la = a.last_name.toLowerCase(), lb = b.last_name.toLowerCase()
        if (la !== lb) return la < lb ? -1 : 1
        return a.first_name.toLowerCase() < b.first_name.toLowerCase() ? -1 : 1
      })
      .slice(0, 100),
    [students, addGroupId, enrolledStudentIds, addStudentSearch]
  )

  const today = formatDate(new Date())
  const maxBookingDate = formatDate(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000))

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('sup.title', 'Support Requests')}</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t('sup.add', 'Add Request')}
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[200px] text-center">{formatWeekRange(weekDays)}</span>
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weekOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Pending</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> Confirmed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Cancelled</span>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-auto rounded-lg border bg-background">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="w-16 p-2 text-right text-muted-foreground font-medium border-b border-r text-xs">Time</th>
                {weekDays.map((d, i) => {
                  const isToday = formatDate(d) === today
                  return (
                    <th key={i} className={cn('p-2 text-center font-medium border-b min-w-[120px]', isToday && 'bg-primary/5 text-primary')}>
                      <div>{DAY_LABELS[i]}</div>
                      <div className={cn('text-xs font-normal', isToday ? 'text-primary' : 'text-muted-foreground')}>{formatDateLabel(d)}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time, ti) => (
                <tr key={time} className={ti % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="p-2 text-right text-xs text-muted-foreground font-mono border-r whitespace-nowrap pr-3">{time}</td>
                  {weekDays.map((d, di) => {
                    const key = `${formatDate(d)}_${time}`
                    const req = slotMap[key]
                    const isPast = formatDate(d) < today || (formatDate(d) === today && time < new Date().toTimeString().slice(0, 5))
                    return (
                      <td key={di} className="p-1 border-r last:border-r-0 align-top">
                        {req ? (
                          <button
                            onClick={() => req.status !== 'cancelled' ? setSelectedRequest(req) : setSelectedRequest(req)}
                            className={cn('w-full rounded px-2 py-1 text-left text-xs transition-colors', STATUS_STYLES[req.status])}
                          >
                            <div className="font-medium truncate">{req.student_name}</div>
                            {req.topic && <div className="text-xs opacity-70 truncate">{req.topic}</div>}
                            {req.assigned_to_name && <div className="text-xs opacity-70 truncate">👤 {req.assigned_to_name}</div>}
                            {req.source === 'bot' ? <Bot className="h-2.5 w-2.5 inline opacity-50" /> : <User2 className="h-2.5 w-2.5 inline opacity-50" />}
                          </button>
                        ) : (
                          !isPast && (
                            <button
                              onClick={() => { setAddDate(formatDate(d)); setAddTime(time); setAddOpen(true) }}
                              className="w-full h-8 rounded border border-dashed border-transparent hover:border-muted-foreground/30 hover:bg-muted/50 transition-colors"
                            />
                          )
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={open => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Support Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Student</span><p className="font-medium">{selectedRequest.student_name}</p></div>
                <div><span className="text-muted-foreground">Phone</span><p className="font-medium">{selectedRequest.student_phone || '—'}</p></div>
                <div><span className="text-muted-foreground">Date</span><p className="font-medium">{formatDateDisplay(selectedRequest.scheduled_date)}</p></div>
                <div><span className="text-muted-foreground">Time</span><p className="font-medium">{selectedRequest.scheduled_time}</p></div>
                <div><span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className={cn('mt-0.5', STATUS_BADGE[selectedRequest.status])}>
                    {selectedRequest.status}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">Source</span>
                  <p className="font-medium flex items-center gap-1">
                    {selectedRequest.source === 'bot' ? <><Bot className="h-3 w-3" /> Bot</> : <><User2 className="h-3 w-3" /> Manual</>}
                  </p>
                </div>
                {selectedRequest.assigned_to_name && (
                  <div className="col-span-2"><span className="text-muted-foreground">Assigned TA</span><p className="font-medium">{selectedRequest.assigned_to_name}</p></div>
                )}
                {selectedRequest.cancelled_reason && (
                  <div className="col-span-2"><span className="text-muted-foreground">Cancel reason</span><p className="font-medium">{selectedRequest.cancelled_reason}</p></div>
                )}
                {selectedRequest.topic && (
                  <div className="col-span-2"><span className="text-muted-foreground">Topic</span><p className="font-medium">{selectedRequest.topic}</p></div>
                )}
                {selectedRequest.notes && (
                  <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p className="font-medium">{selectedRequest.notes}</p></div>
                )}
                {selectedRequest.created_by_name && (
                  <div className="col-span-2"><span className="text-muted-foreground">Created by</span><p className="font-medium">{selectedRequest.created_by_name}</p></div>
                )}
              </div>

              {selectedRequest.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setConfirmOpen(true) }}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => setCancelOpen(true)}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                </div>
              )}
              {selectedRequest.status === 'confirmed' && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => setCancelOpen(true)}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel Session
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { deleteMutation.mutate(selectedRequest.id) }}>
                    Delete
                  </Button>
                </div>
              )}
              {selectedRequest.status === 'cancelled' && (
                <Button variant="ghost" size="sm" className="text-muted-foreground w-full" onClick={() => deleteMutation.mutate(selectedRequest.id)}>
                  Delete record
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Support Session</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select a Teaching Assistant. They will be notified via Telegram.
            </p>
            <div className="space-y-2">
              <Label>Teaching Assistant</Label>
              <Select value={confirmAssignee} onValueChange={setConfirmAssignee}>
                <SelectTrigger><SelectValue placeholder="Select TA..." /></SelectTrigger>
                <SelectContent>
                  {teachingAssistants.length === 0
                    ? <SelectItem value="none" disabled>No Teaching Assistants found</SelectItem>
                    : teachingAssistants.map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.full_name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
            <Button className="bg-green-600 hover:bg-green-700" disabled={!confirmAssignee || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm &amp; Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancel Request</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="destructive" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Request Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) { setAddGroupId(''); setAddStudentId(''); setAddStudentOpen(false); setAddDate(''); setAddTime(''); setAddTopic(''); setAddNotes(''); setAddStudentSearch('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Support Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={addGroupId} onValueChange={v => { setAddGroupId(v); setAddStudentId('') }}>
                <SelectTrigger><SelectValue placeholder="All groups..." /></SelectTrigger>
                <SelectContent>
                  {activeGroups.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Student *</Label>
              <div className="relative" ref={studentDropdownRef}>
                <button
                  type="button"
                  className={cn(
                    'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/50',
                    !addStudentId && 'text-muted-foreground'
                  )}
                  onClick={() => setAddStudentOpen(o => !o)}
                >
                  <span className="truncate">
                    {addStudentId
                      ? (() => { const s = (students as Student[]).find(s => String(s.id) === addStudentId); return s ? `${s.last_name} ${s.first_name}` : 'Select student...' })()
                      : 'Select student...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
                {addStudentOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Search student..."
                        value={addStudentSearch}
                        onChange={e => setAddStudentSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                      {filteredStudents.length === 0
                        ? <p className="p-3 text-sm text-muted-foreground text-center">No students found</p>
                        : filteredStudents.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              className={cn(
                                'w-full flex items-center px-3 py-2 text-sm text-left hover:bg-accent cursor-pointer',
                                addStudentId === String(s.id) && 'bg-accent font-medium'
                              )}
                              onClick={() => { setAddStudentId(String(s.id)); setAddStudentOpen(false); setAddStudentSearch('') }}
                            >
                              <span className="flex-1">{s.last_name} {s.first_name}</span>
                              {addStudentId === String(s.id) && <Check className="h-4 w-4 shrink-0 text-primary" />}
                            </button>
                          ))
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} min={today} max={maxBookingDate} />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Select value={addTime} onValueChange={setAddTime}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => {
                      const key = `${addDate}_${t}`
                      const taken = !!slotMap[key] && slotMap[key]?.status !== 'cancelled'
                      return (
                        <SelectItem key={t} value={t} disabled={taken}>
                          {t} {taken ? '(taken)' : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Topic *</Label>
              <Input value={addTopic} onChange={e => setAddTopic(e.target.value)} placeholder="What topic needs support?" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!addStudentId || !addDate || !addTime || !addTopic || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
