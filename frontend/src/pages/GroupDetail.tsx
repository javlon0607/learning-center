import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, enrollmentsApi, studentsApi, groupTransfersApi, Enrollment } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Users, DollarSign, User, Plus, Trash2, Percent, Search, ArrowRightLeft, Loader2, Printer } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCurrency } from '@/lib/utils'

const statusColors = {
  active: 'success',
  inactive: 'secondary',
  completed: 'default',
} as const

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const groupId = Number(id)
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')
  const [discountPercentage, setDiscountPercentage] = useState<string>('0')
  const [studentSearch, setStudentSearch] = useState('')
  const [enrollmentToRemove, setEnrollmentToRemove] = useState<{ id: number; studentName: string } | null>(null)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [enrollmentToTransfer, setEnrollmentToTransfer] = useState<Enrollment | null>(null)
  const [targetGroupId, setTargetGroupId] = useState<string>('')
  const [transferReason, setTransferReason] = useState('')
  const [transferDiscount, setTransferDiscount] = useState('0')

  function printAttendanceSheet() {
    if (!group) return
    const now = new Date()
    const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const logoUrl = `${window.location.origin}/logo-full.jpg`

    const studentRows = enrollments.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.student_name ?? ''}</td>
        <td>${e.student_phone ?? ''}</td>
        ${Array(14).fill('<td></td>').join('')}
      </tr>`).join('')

    const emptyRows = Array(3).fill(`
      <tr>
        <td></td><td></td><td></td>
        ${Array(14).fill('<td></td>').join('')}
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Attendance — ${group.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #111;
      background: #fff;
      padding: 14mm 12mm 10mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Watermark ── */
    .watermark {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 72pt;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.04);
      white-space: nowrap;
      pointer-events: none;
      z-index: -1;
      letter-spacing: 6px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
      border-bottom: 2.5px solid #111;
      margin-bottom: 10px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left img { height: 52px; width: auto; border-radius: 6px; }
    .header-left .title { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; line-height: 1.1; }
    .header-left .subtitle {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      color: #555;
      margin-top: 3px;
    }
    .header-right { text-align: right; }
    .header-right .month-label {
      font-size: 13px;
      font-weight: 700;
      border: 2px solid #111;
      border-radius: 6px;
      padding: 4px 14px;
      display: inline-block;
    }
    .header-right .doc-type {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #777;
      margin-top: 4px;
    }

    /* ── Meta info ── */
    .meta {
      display: flex;
      gap: 0;
      margin-bottom: 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
      overflow: hidden;
    }
    .meta-item {
      flex: 1;
      padding: 6px 12px;
      border-right: 1px solid #ccc;
    }
    .meta-item:last-child { border-right: none; }
    .meta-item .lbl { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 2px; }
    .meta-item .val { font-size: 11px; font-weight: 700; color: #111; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.col-num  { width: 7mm; }
    col.col-name { width: 48mm; }
    col.col-phone{ width: 28mm; }
    col.col-date { width: 8mm; }

    thead tr { height: 52px; }
    th {
      background: #e8e8e8;
      color: #111;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 0 4px;
      text-align: center;
      vertical-align: middle;
      border: 1px solid #999;
    }
    th:nth-child(2) { text-align: left; padding-left: 8px; }

    tbody tr { height: 26px; }
    td {
      border: 1px solid #bbb;
      padding: 0 4px;
      text-align: center;
      vertical-align: middle;
      overflow: hidden;
    }
    td:nth-child(1) { color: #777; font-size: 10px; }
    td:nth-child(2) { text-align: left; padding-left: 8px; font-weight: 500; }
    td:nth-child(3) { font-size: 10px; }

    /* ── Footer ── */
    .footer {
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 9px;
      color: #777;
      padding-top: 8px;
    }
    .footer .copy { font-size: 9px; color: #999; }
    .footer .sig { display: flex; gap: 48px; }
    .footer .sig-item { text-align: center; }
    .footer .sig-item .line { border-top: 1px solid #555; width: 90px; margin-bottom: 4px; }
    .footer .sig-item .name { font-size: 9px; color: #555; }

    @media print {
      body { padding: 10mm 10mm 8mm; }
      @page { margin: 0; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <div class="watermark">LEGACY ACADEMY</div>

  <div class="header">
    <div class="header-left">
      <img src="${logoUrl}" alt="Legacy Academy" onerror="this.style.display='none'"/>
      <div>
        <div class="title">Legacy Academy</div>
        <div class="subtitle">Education Center</div>
      </div>
    </div>
    <div class="header-right">
      <div class="month-label">${monthYear}</div>
      <div class="doc-type">Attendance Sheet</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item">
      <div class="lbl">Group</div>
      <div class="val">${group.name}</div>
    </div>
    <div class="meta-item">
      <div class="lbl">Teacher</div>
      <div class="val">${group.teacher_name ?? '—'}</div>
    </div>
    <div class="meta-item">
      <div class="lbl">Total Students</div>
      <div class="val">${enrollments.length}</div>
    </div>
    <div class="meta-item">
      <div class="lbl">Academic Year</div>
      <div class="val">${now.getFullYear()}</div>
    </div>
  </div>

  <table>
    <colgroup>
      <col class="col-num"/>
      <col class="col-name"/>
      <col class="col-phone"/>
      ${Array(14).fill('<col class="col-date"/>').join('')}
    </colgroup>
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left;padding-left:8px">Full Name</th>
        <th>Phone</th>
        ${Array(14).fill('<th></th>').join('')}
      </tr>
    </thead>
    <tbody>
      ${studentRows}
      ${emptyRows}
    </tbody>
  </table>

  <div class="footer">
    <div class="copy">Legacy Academy &copy; ${now.getFullYear()}</div>
    <div class="sig">
      <div class="sig-item"><div class="line"></div><div class="name">Administrator</div></div>
      <div class="sig-item"><div class="line"></div><div class="name">Director</div></div>
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=1100,height=700')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const group = groups.find((g) => g.id === groupId)

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', 'group', groupId],
    queryFn: () => enrollmentsApi.getByGroup(groupId),
    enabled: !!groupId,
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
  })

  const enrolledStudentIds = new Set(enrollments.map((e) => e.student_id))

  // Get all active students not enrolled in THIS group, sorted:
  // 1. Students with no enrollments first
  // 2. Then alphabetically by name
  const availableStudents = students
    .filter((s) => s.status === 'active' && !enrolledStudentIds.has(s.id))
    .map((s) => ({
      ...s,
      hasEnrollments: (s.enrollments && s.enrollments.length > 0) || (s.groups_list && s.groups_list.trim() !== ''),
      groupNames: s.enrollments?.map(e => e.group_name).join(', ') || s.groups_list || '',
    }))
    .sort((a, b) => {
      // Students without enrollments come first
      if (!a.hasEnrollments && b.hasEnrollments) return -1
      if (a.hasEnrollments && !b.hasEnrollments) return 1
      // Then sort by name
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase()
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })

  // Filter by search query
  const filteredStudents = availableStudents.filter((s) => {
    if (!studentSearch.trim()) return true
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    return fullName.includes(studentSearch.toLowerCase())
  })

  const enrollStudent = useMutation({
    mutationFn: ({ studentId, groupId, discountPct }: { studentId: number; groupId: number; discountPct: number }) =>
      enrollmentsApi.create(studentId, groupId, discountPct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      toast({ title: 'Student enrolled successfully' })
      setEnrollDialogOpen(false)
      setSelectedStudentId('')
      setDiscountPercentage('0')
    },
  })

  const unenrollStudent = useMutation({
    mutationFn: (enrollmentId: number) => enrollmentsApi.delete(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      toast({ title: 'Student removed from group' })
    },
  })

  const transferStudent = useMutation({
    mutationFn: (data: {
      student_id: number
      from_group_id: number
      to_group_id: number
      reason?: string
      discount_percentage?: number
    }) => groupTransfersApi.transfer(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({
        title: 'Student transferred',
        description: result.message,
      })
      setTransferDialogOpen(false)
      setEnrollmentToTransfer(null)
      setTargetGroupId('')
      setTransferReason('')
      setTransferDiscount('0')
    },
    onError: (err: Error) => {
      toast({ title: 'Transfer failed', description: err.message, variant: 'destructive' })
    },
  })

  // Groups available for transfer (all active groups except current)
  const transferableGroups = groups.filter(
    (g) => g.id !== groupId && g.status === 'active'
  )

  if (!group) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Group not found</p>
        <Button onClick={() => navigate('/groups')} className="mt-4">
          Back to Groups
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/groups')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="text-muted-foreground">{group.subject || 'No subject'}</p>
        </div>
        <Badge variant={statusColors[group.status]} className="ml-auto">
          {group.status}
        </Badge>
        <Button variant="outline" size="sm" onClick={printAttendanceSheet}>
          <Printer className="h-4 w-4 mr-2" />
          Davomat varaqasi
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teacher</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {group.teacher_name || 'Unassigned'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enrollments.length} / {group.capacity}
            </div>
            <p className="text-xs text-muted-foreground">
              {group.capacity - enrollments.length} spots available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(group.price)}
            </div>
            <p className="text-xs text-muted-foreground">per month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Enrolled Students</CardTitle>
          <Button
            size="sm"
            onClick={() => setEnrollDialogOpen(true)}
            disabled={enrollments.length >= group.capacity}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Monthly Rate</TableHead>
                <TableHead>Enrolled Date</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No students enrolled
                  </TableCell>
                </TableRow>
              ) : (
                enrollments.map((enrollment) => {
                  const discount = enrollment.discount_percentage || 0
                  const monthlyRate = group.price * (1 - discount / 100)
                  return (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <button
                          onClick={() => navigate(`/students/${enrollment.student_id}`)}
                          className="text-blue-600 hover:underline"
                        >
                          {enrollment.student_name}
                        </button>
                      </TableCell>
                      <TableCell>
                        {discount > 0 ? (
                          <Badge variant="secondary" className="text-green-600">
                            {discount}% off
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(monthlyRate)}
                      </TableCell>
                      <TableCell>{enrollment.enrolled_at}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEnrollmentToTransfer(enrollment)
                              setTransferDiscount(String(enrollment.discount_percentage || 0))
                              setTransferDialogOpen(true)
                            }}
                            title="Transfer to another group"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEnrollmentToRemove({ id: enrollment.id, studentName: enrollment.student_name || 'this student' })}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={enrollDialogOpen} onOpenChange={(open) => {
        setEnrollDialogOpen(open)
        if (!open) {
          setSelectedStudentId('')
          setDiscountPercentage('0')
          setStudentSearch('')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-[200px] rounded-md border">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {availableStudents.length === 0 ? 'No available students' : 'No students found'}
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => setSelectedStudentId(student.id.toString())}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedStudentId === student.id.toString()
                            ? 'bg-blue-100 text-blue-900'
                            : 'hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {student.first_name} {student.last_name}
                          </span>
                          {student.hasEnrollments && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0">
                              {student.groupNames}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              {selectedStudentId && (
                <p className="text-sm text-blue-600">
                  Selected: {filteredStudents.find(s => s.id.toString() === selectedStudentId)?.first_name} {filteredStudents.find(s => s.id.toString() === selectedStudentId)?.last_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount">Discount % (0–100)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="discount"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPercentage}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || v === '-') {
                      setDiscountPercentage(v)
                      return
                    }
                    const n = Number(v)
                    if (!Number.isFinite(n)) return
                    setDiscountPercentage(String(Math.max(0, Math.min(100, n))))
                  }}
                  className="w-24"
                />
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
              {Number(discountPercentage) > 0 && (
                <p className="text-sm text-muted-foreground">
                  Student will pay {formatCurrency(group.price * (1 - Number(discountPercentage) / 100))} per month
                  <span className="text-green-600"> ({discountPercentage}% off)</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pct = Number(discountPercentage)
                if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                  toast({
                    title: 'Invalid discount',
                    description: 'Discount must be between 0 and 100%.',
                    variant: 'destructive',
                  })
                  return
                }
                enrollStudent.mutate({
                  studentId: Number(selectedStudentId),
                  groupId,
                  discountPct: pct,
                })
              }}
              disabled={!selectedStudentId || enrollStudent.isPending}
            >
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!enrollmentToRemove} onOpenChange={(open) => { if (!open) setEnrollmentToRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium">{enrollmentToRemove?.studentName}</span> from this group? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (enrollmentToRemove) {
                  unenrollStudent.mutate(enrollmentToRemove.id)
                  setEnrollmentToRemove(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => {
        setTransferDialogOpen(open)
        if (!open) {
          setEnrollmentToTransfer(null)
          setTargetGroupId('')
          setTransferReason('')
          setTransferDiscount('0')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">Student:</span>{' '}
                <span className="font-medium">{enrollmentToTransfer?.student_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">From:</span>{' '}
                <span className="font-medium">{group?.name}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Transfer to Group *</Label>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target group" />
                </SelectTrigger>
                <SelectContent>
                  {transferableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name} ({formatCurrency(g.price)}/mo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferableGroups.length === 0 && (
                <p className="text-xs text-amber-600">No other active groups available</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-discount">Discount % in new group</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="transfer-discount"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={transferDiscount}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || v === '-') {
                      setTransferDiscount(v)
                      return
                    }
                    const n = Number(v)
                    if (!Number.isFinite(n)) return
                    setTransferDiscount(String(Math.max(0, Math.min(100, n))))
                  }}
                  className="w-24"
                />
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-reason">Reason (optional)</Label>
              <Textarea
                id="transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g., Schedule conflict, level change, etc."
                rows={2}
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> If the student has already paid for the current month in this group,
                the payment will be credited to the new group automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!enrollmentToTransfer || !targetGroupId) return
                const pct = Number(transferDiscount)
                if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                  toast({
                    title: 'Invalid discount',
                    description: 'Discount must be between 0 and 100%.',
                    variant: 'destructive',
                  })
                  return
                }
                transferStudent.mutate({
                  student_id: enrollmentToTransfer.student_id,
                  from_group_id: groupId,
                  to_group_id: Number(targetGroupId),
                  reason: transferReason || undefined,
                  discount_percentage: pct,
                })
              }}
              disabled={!targetGroupId || transferStudent.isPending}
            >
              {transferStudent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
