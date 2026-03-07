import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  studentsApi, enrollmentsApi, paymentsApi, groupsApi, studentAttendanceApi,
  studentNotesApi, studentDebtApi, monthlyDiscountsApi,
  sourceOptions, Student, Payment,
} from '@/lib/api'
import { StudentForm } from '@/components/students/StudentForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput } from '@/components/ui/date-input'
import { StudentDetailSkeleton } from '@/components/skeletons'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { useTranslation } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAmountInput } from '@/hooks/useAmountInput'
import {
  ArrowLeft, Mail, Phone, User, Calendar, BookOpen, Info,
  Pencil, Trash2, GraduationCap, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, Cake, CreditCard, UserPlus,
  ChevronDown, Plus, Loader2, ClipboardList, MessageSquare,
} from 'lucide-react'
import { formatDate, formatDateTime, formatCurrency, calculateAge, parseAmountFromInput, cn } from '@/lib/utils'

const statusConfig = {
  active: { label: 'Active', color: 'success' as const, className: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', color: 'secondary' as const, className: 'bg-gray-100 text-gray-700' },
  graduated: { label: 'Graduated', color: 'default' as const, className: 'bg-blue-100 text-blue-700' },
  suspended: { label: 'Suspended', color: 'destructive' as const, className: 'bg-red-100 text-red-700' },
} as const

const attendanceStatusConfig = {
  present: { label: 'Present', className: 'bg-green-100 text-green-700' },
  absent: { label: 'Absent', className: 'bg-red-100 text-red-700' },
  late: { label: 'Late', className: 'bg-amber-100 text-amber-700' },
  excused: { label: 'Excused', className: 'bg-blue-100 text-blue-700' },
} as const

const PAYMENTS_PER_PAGE = 10

function formatMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

function getMonthOptions() {
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -3; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const value = `${y}-${String(m).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    months.push({ value, label })
  }
  return months
}

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const { t } = useTranslation()
  const studentId = Number(id)

  const [formOpen, setFormOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [removeEnrollmentId, setRemoveEnrollmentId] = useState<number | null>(null)
  const [paymentPage, setPaymentPage] = useState(1)

  // Enroll dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [enrollGroupId, setEnrollGroupId] = useState('')
  const [enrollDiscount, setEnrollDiscount] = useState('0')

  // Monthly discount dialog
  const [mdDialogOpen, setMdDialogOpen] = useState(false)
  const [mdGroupId, setMdGroupId] = useState<number | null>(null)
  const [mdMonth, setMdMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [mdAmount, setMdAmount] = useState('')
  const [mdReason, setMdReason] = useState('')

  // Notes
  const [addingNote, setAddingNote] = useState(false)
  const [newNoteContent, setNewNoteContent] = useState('')

  // Record Payment dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payGroupId, setPayGroupId] = useState('')
  const [paySelectedMonths, setPaySelectedMonths] = useState<string[]>([])
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0])
  const payAmount = useAmountInput()
  const [payDebtInfo, setPayDebtInfo] = useState<{
    groupPrice: number
    discountPercentage: number
    monthlyDiscount: number
    monthlyDebt: number
    monthDebts: { month: string; debt: number; paid: number; remaining: number }[]
    totalRemaining: number
  } | null>(null)
  const [payLoadingDebt, setPayLoadingDebt] = useState(false)
  const [payAllMonthsStatus, setPayAllMonthsStatus] = useState<Record<string, { remaining: number; fullyPaid: boolean }>>({})
  const [payLoadingMonths, setPayLoadingMonths] = useState(false)
  const monthOptions = useMemo(() => getMonthOptions(), [])

  // Queries
  const { data: student, isLoading } = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => studentsApi.getById(studentId),
    enabled: !!studentId,
  })

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', 'student', studentId],
    queryFn: () => enrollmentsApi.getByStudent(studentId),
    enabled: !!studentId,
  })

  const { data: studentPayments = [] } = useQuery({
    queryKey: ['payments', { student_id: studentId }],
    queryFn: () => paymentsApi.getAll({ student_id: String(studentId) }),
    enabled: !!studentId,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () => studentAttendanceApi.getByStudent(studentId),
    enabled: !!studentId,
  })

  const { data: studentNotes = [] } = useQuery({
    queryKey: ['student-notes', studentId],
    queryFn: () => studentNotesApi.getByStudent(studentId),
    enabled: !!studentId,
  })

  const { data: monthlyDiscounts = [] } = useQuery({
    queryKey: ['monthly-discounts', studentId],
    queryFn: () => monthlyDiscountsApi.getAll({ student_id: String(studentId) }),
    enabled: !!studentId,
  })

  // Available groups (active, not already enrolled)
  const enrolledGroupIds = new Set(enrollments.map(e => e.group_id))
  const availableGroups = groups.filter(g => g.status === 'active' && !enrolledGroupIds.has(g.id))
  // Groups this student IS enrolled in (for payment)
  const enrolledGroups = groups.filter(g => enrolledGroupIds.has(g.id))

  // Payment dialog: auto-select current month when group is picked
  useEffect(() => {
    if (payGroupId && paySelectedMonths.length === 0) {
      setPaySelectedMonths([getCurrentMonth()])
    }
  }, [payGroupId])

  // Payment dialog: fetch all months payment status
  useEffect(() => {
    async function fetchAllMonthsStatus() {
      if (!payGroupId) { setPayAllMonthsStatus({}); return }
      setPayLoadingMonths(true)
      try {
        const status: Record<string, { remaining: number; fullyPaid: boolean }> = {}
        for (const { value: month } of monthOptions) {
          const debt = await studentDebtApi.get(studentId, Number(payGroupId), month)
          status[month] = { remaining: debt.remaining_debt, fullyPaid: debt.remaining_debt === 0 }
        }
        setPayAllMonthsStatus(status)
      } catch { setPayAllMonthsStatus({}) }
      finally { setPayLoadingMonths(false) }
    }
    fetchAllMonthsStatus()
  }, [payGroupId, studentId, monthOptions])

  // Payment dialog: fetch debt info for selected months
  useEffect(() => {
    async function fetchDebtInfo() {
      if (!payGroupId || paySelectedMonths.length === 0) { setPayDebtInfo(null); return }
      setPayLoadingDebt(true)
      try {
        const monthDebts: { month: string; debt: number; paid: number; remaining: number }[] = []
        let totalRemaining = 0, groupPrice = 0, discountPercentage = 0, monthlyDiscount = 0, monthlyDebt = 0
        for (const month of paySelectedMonths) {
          const debt = await studentDebtApi.get(studentId, Number(payGroupId), month)
          groupPrice = debt.group_price
          discountPercentage = debt.discount_percentage
          monthlyDiscount = debt.monthly_discount || 0
          monthlyDebt = debt.monthly_debt
          monthDebts.push({ month, debt: debt.monthly_debt, paid: debt.paid_amount, remaining: debt.remaining_debt })
          totalRemaining += debt.remaining_debt
        }
        setPayDebtInfo({ groupPrice, discountPercentage, monthlyDiscount, monthlyDebt, monthDebts, totalRemaining })
      } catch { setPayDebtInfo(null) }
      finally { setPayLoadingDebt(false) }
    }
    fetchDebtInfo()
  }, [payGroupId, paySelectedMonths, studentId])

  // Mutations
  const deleteStudent = useMutation({
    mutationFn: () => studentsApi.delete(studentId),
    onSuccess: () => {
      toast({ title: t('sd.toast_student_deleted', 'Student deleted') })
      navigate('/students')
    },
    onError: (error: Error) => {
      toast({ title: t('sd.toast_cannot_delete', 'Cannot delete student'), description: error.message, variant: 'destructive' })
    },
  })

  const updateStudent = useMutation({
    mutationFn: (data: Partial<Student>) => studentsApi.update(studentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_student_updated', 'Student updated') })
      setFormOpen(false)
    },
  })

  const changeStatus = useMutation({
    mutationFn: (status: string) => studentsApi.update(studentId, { status } as Partial<Student>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_status_updated', 'Status updated') })
    },
  })

  const addNote = useMutation({
    mutationFn: (content: string) => studentNotesApi.create(studentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-notes', studentId] })
      toast({ title: t('sd.toast_note_added', 'Note added') })
      setNewNoteContent('')
      setAddingNote(false)
    },
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => studentNotesApi.delete(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-notes', studentId] })
      toast({ title: t('sd.toast_note_deleted', 'Note deleted') })
    },
    onError: (error: Error) => {
      toast({ title: t('sd.toast_cannot_delete_note', 'Cannot delete note'), description: error.message, variant: 'destructive' })
    },
  })

  const removeEnrollment = useMutation({
    mutationFn: (enrollmentId: number) => enrollmentsApi.delete(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_enrollment_removed', 'Enrollment removed') })
      setRemoveEnrollmentId(null)
    },
    onError: (error: Error) => {
      toast({ title: t('sd.toast_cannot_remove_enrollment', 'Cannot remove enrollment'), description: error.message, variant: 'destructive' })
    },
  })

  const createEnrollment = useMutation({
    mutationFn: () => enrollmentsApi.create(studentId, Number(enrollGroupId), Number(enrollDiscount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_student_enrolled', 'Student enrolled in group') })
      setEnrollDialogOpen(false)
      setEnrollGroupId('')
      setEnrollDiscount('0')
    },
  })

  const createMonthlyDiscount = useMutation({
    mutationFn: (data: { student_id: number; group_id: number; for_month: string; amount: number; reason?: string }) =>
      monthlyDiscountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-discounts', studentId] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_md_added', 'Monthly discount added') })
      setMdDialogOpen(false)
      setMdAmount('')
      setMdReason('')
    },
    onError: (error: Error) => {
      toast({ title: t('sd.toast_cannot_add_md', 'Cannot add discount'), description: error.message, variant: 'destructive' })
    },
  })

  const deleteMonthlyDiscount = useMutation({
    mutationFn: (id: number) => monthlyDiscountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-discounts', studentId] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: t('sd.toast_md_removed', 'Monthly discount removed') })
    },
    onError: (error: Error) => {
      toast({ title: t('sd.toast_cannot_remove_md', 'Cannot remove discount'), description: error.message, variant: 'destructive' })
    },
  })

  const createPayment = useMutation({
    mutationFn: (data: Omit<Payment, 'id' | 'created_at' | 'student_name' | 'group_name' | 'months_covered'> & { months?: string[] }) =>
      paymentsApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: t('sd.toast_payment_recorded', 'Payment recorded'), description: `${t('sd.invoice', 'Invoice')}: ${data.invoice_no}` })
      closePayDialog()
    },
  })

  function closePayDialog() {
    setPayDialogOpen(false)
    setPayGroupId('')
    setPaySelectedMonths([])
    setPayDebtInfo(null)
    setPayAllMonthsStatus({})
    payAmount.reset()
    setPayDate(new Date().toISOString().split('T')[0])
  }

  function togglePayMonth(month: string) {
    setPaySelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort()
    )
  }

  function handlePaySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const amountValue = parseAmountFromInput((formData.get('amount') as string) ?? '')
    if (amountValue <= 0) {
      toast({ title: t('sd.toast_enter_valid_amount', 'Enter a valid amount'), variant: 'destructive' })
      return
    }
    if (payDebtInfo && amountValue > payDebtInfo.totalRemaining + 0.01) {
      toast({ title: t('sd.toast_exceeds_debt', 'Amount exceeds remaining debt'), description: `${t('sd.maximum', 'Maximum')}: ${formatCurrency(payDebtInfo.totalRemaining)}`, variant: 'destructive' })
      return
    }
    createPayment.mutate({
      student_id: studentId,
      group_id: Number(payGroupId),
      amount: amountValue,
      payment_date: payDate,
      method: (formData.get('method') as Payment['method']) || 'cash',
      notes: formData.get('notes') as string,
      months: paySelectedMonths.length > 0 ? paySelectedMonths : undefined,
    })
  }

  // Paginated payments
  const totalPaymentPages = Math.ceil(studentPayments.length / PAYMENTS_PER_PAGE)
  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * PAYMENTS_PER_PAGE
    return studentPayments.slice(start, start + PAYMENTS_PER_PAGE)
  }, [studentPayments, paymentPage])

  const totalPaid = useMemo(() =>
    studentPayments.reduce((sum, p) => sum + p.amount, 0),
    [studentPayments]
  )

  // Attendance stats
  const attendanceStats = useMemo(() => {
    const total = attendanceRecords.length
    const present = attendanceRecords.filter(r => r.status === 'present').length
    const absent = attendanceRecords.filter(r => r.status === 'absent').length
    const late = attendanceRecords.filter(r => r.status === 'late').length
    const rate = total > 0 ? Math.round((present + late) / total * 100) : 0
    return { total, present, absent, late, rate }
  }, [attendanceRecords])

  if (isLoading) {
    return <StudentDetailSkeleton />
  }

  if (!student) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('sd.not_found', 'Student not found')}</p>
        <Button onClick={() => navigate('/students')} className="mt-4">
          {t('sd.back_to_students', 'Back to Students')}
        </Button>
      </div>
    )
  }

  const age = student.dob ? calculateAge(student.dob) : null
  const currentStatus = statusConfig[student.status]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-14 w-14 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 font-bold text-lg shrink-0">
            {student.first_name[0]}{student.last_name[0]}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">
              {student.first_name} {student.last_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity',
                    currentStatus.className
                  )}>
                    {currentStatus.label}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => changeStatus.mutate(key)}
                      disabled={student.status === key}
                      className="cursor-pointer"
                    >
                      <span className={cn('inline-block h-2 w-2 rounded-full mr-2', config.className.split(' ')[0])} />
                      {config.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {age !== null && (
                <span className="text-sm text-muted-foreground">{age} {t('sd.years_old', 'years old')}</span>
              )}
              <span className="text-sm text-muted-foreground">{t('sd.id', 'ID')}: {student.id}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setPayDialogOpen(true)} disabled={enrollments.length === 0}>
            <CreditCard className="mr-2 h-4 w-4" />{t('sd.record_payment', 'Record Payment')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEnrollDialogOpen(true)} disabled={availableGroups.length === 0}>
            <UserPlus className="mr-2 h-4 w-4" />{t('sd.add_to_group', 'Add to Group')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />{t('common.edit', 'Edit')}
          </Button>
          {hasRole('admin') && (
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('sd.card_contact', 'Contact')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {student.phone && (
              <a href={`tel:${student.phone}`} className="flex items-center gap-3 text-sm hover:text-primary">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {student.phone}
              </a>
            )}
            {student.email && (
              <a href={`mailto:${student.email}`} className="flex items-center gap-3 text-sm hover:text-primary">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {student.email}
              </a>
            )}
            {student.dob && (
              <div className="flex items-center gap-3 text-sm">
                <Cake className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(student.dob)}{age !== null ? ` (${age} ${t('sd.yo', 'y/o')})` : ''}</span>
              </div>
            )}
            {!student.phone && !student.email && !student.dob && (
              <p className="text-sm text-muted-foreground">{t('sd.no_contact', 'No contact info')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('sd.card_parent', 'Parent/Guardian')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {student.parent_name && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{student.parent_name}</span>
              </div>
            )}
            {student.parent_phone && (
              <a href={`tel:${student.parent_phone}`} className="flex items-center gap-3 text-sm hover:text-primary">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {student.parent_phone}
              </a>
            )}
            {!student.parent_name && !student.parent_phone && (
              <p className="text-sm text-muted-foreground">{t('sd.not_specified', 'Not specified')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('sd.card_summary', 'Summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span>{enrollments.length} {t('sd.enrollments', 'Enrollment(s)')}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{t('sd.joined', 'Joined')} {formatDate(student.created_at)}</span>
            </div>
            {(student.current_month_debt ?? 0) > 0 ? (
              <div className="flex items-center gap-3 text-sm text-red-600 font-medium">
                <AlertCircle className="h-4 w-4" />
                <span>{t('sd.debt', 'Debt')}: {formatCurrency(student.current_month_debt || 0)}</span>
              </div>
            ) : enrollments.length > 0 ? (
              <div className="flex items-center gap-3 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t('sd.paid_this_month', 'Paid for this month')}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('sd.card_source', 'Source')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Info className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline">
                {sourceOptions.find(s => s.value === student.source)?.label || student.source || t('sd.walk_in', 'Walk-in')}
              </Badge>
            </div>
            {student.source === 'referral' && student.referred_by_name && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  {t('sd.referred_by', 'Referred by')}: <span className="font-medium">{student.referred_by_name}</span>
                  {student.referred_by_type && (
                    <span className="text-muted-foreground"> ({student.referred_by_type})</span>
                  )}
                </span>
              </div>
            )}
            {student.created_by_name && (
              <div className="text-sm text-muted-foreground">
                {t('sd.created_by', 'Created by')}: {student.created_by_name}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="enrollments">
        <TabsList>
          <TabsTrigger value="enrollments">
            <GraduationCap className="mr-2 h-4 w-4" />
            {t('sd.tab_enrollments', 'Enrollments')} ({enrollments.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            {t('sd.tab_payments', 'Payments')} ({studentPayments.length})
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <ClipboardList className="mr-2 h-4 w-4" />
            {t('sd.tab_attendance', 'Attendance')}
          </TabsTrigger>
          <TabsTrigger value="notes">
            <MessageSquare className="mr-2 h-4 w-4" />
            {t('sd.tab_notes', 'Notes')} ({studentNotes.length})
          </TabsTrigger>
        </TabsList>

        {/* Enrollments Tab */}
        <TabsContent value="enrollments" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('sd.col_group', 'Group')}</TableHead>
                    <TableHead>{t('sd.col_price', 'Price')}</TableHead>
                    <TableHead>{t('sd.col_discount', 'Discount')}</TableHead>
                    <TableHead>{t('sd.col_monthly_cost', 'Monthly Cost')}</TableHead>
                    <TableHead>{t('sd.col_enrolled', 'Enrolled')}</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('sd.not_enrolled', 'Not enrolled in any group')}
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => setEnrollDialogOpen(true)} disabled={availableGroups.length === 0}>
                            <UserPlus className="mr-2 h-4 w-4" />{t('sd.add_to_group', 'Add to Group')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    enrollments.map((enrollment) => {
                      const price = enrollment.group_price || 0
                      const discount = enrollment.discount_percentage || 0
                      const monthlyCost = price * (1 - discount / 100)
                      const groupDiscounts = monthlyDiscounts.filter(md => md.group_id === enrollment.group_id)
                      return (
                        <React.Fragment key={enrollment.id}>
                          <TableRow>
                            <TableCell>
                              <button
                                onClick={() => navigate(`/groups/${enrollment.group_id}`)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {enrollment.group_name}
                              </button>
                            </TableCell>
                            <TableCell>{formatCurrency(price)}</TableCell>
                            <TableCell>
                              {discount > 0 ? (
                                <Badge variant="secondary" className="text-green-600">-{discount}%</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{formatCurrency(monthlyCost)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(enrollment.enrolled_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  title={t('sd.add_monthly_discount', 'Add monthly discount')}
                                  onClick={() => {
                                    setMdGroupId(enrollment.group_id)
                                    setMdDialogOpen(true)
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />{t('sd.col_discount', 'Discount')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 h-8"
                                  onClick={() => setRemoveEnrollmentId(enrollment.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {groupDiscounts.length > 0 && (
                            <TableRow className="bg-orange-50/50">
                              <TableCell colSpan={6} className="py-1 px-4">
                                <div className="flex flex-wrap gap-2">
                                  {groupDiscounts.map(md => (
                                    <Badge key={md.id} variant="outline" className="text-orange-600 border-orange-300 gap-1">
                                      {md.for_month.substring(0, 7)}: -{formatCurrency(Number(md.amount))}
                                      {md.reason && <span className="text-muted-foreground">({md.reason})</span>}
                                      <button
                                        className="ml-1 text-destructive hover:text-destructive/80"
                                        onClick={() => deleteMonthlyDiscount.mutate(md.id)}
                                        title={t('sd.remove_discount', 'Remove discount')}
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('sd.col_date', 'Date')}</TableHead>
                    <TableHead>{t('sd.col_group', 'Group')}</TableHead>
                    <TableHead>{t('sd.col_amount', 'Amount')}</TableHead>
                    <TableHead>{t('sd.col_months', 'Month(s)')}</TableHead>
                    <TableHead>{t('sd.col_method', 'Method')}</TableHead>
                    <TableHead>{t('sd.col_status', 'Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t('sd.no_payments', 'No payments recorded')}
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)} disabled={enrollments.length === 0}>
                            <CreditCard className="mr-2 h-4 w-4" />{t('sd.record_payment', 'Record Payment')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-muted-foreground">{formatDate(payment.payment_date)}</TableCell>
                        <TableCell>{payment.group_name || '—'}</TableCell>
                        <TableCell className="font-medium text-green-600">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell>
                          {payment.months_covered && payment.months_covered.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {payment.months_covered.map((m, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {m.month}
                                </Badge>
                              ))}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="capitalize">{payment.method}</TableCell>
                        <TableCell>
                          {payment.is_approved ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{t('sd.approved', 'Approved')}</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">{t('sd.pending', 'Pending')}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {studentPayments.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
              <div className="text-sm text-muted-foreground">
                {t('sd.total_paid', 'Total paid')}: <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
                <span className="ml-4">
                  {studentPayments.length} {t('sd.payments_count', 'payment(s)')}
                </span>
              </div>
              {totalPaymentPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPaymentPage(p => Math.max(1, p - 1))} disabled={paymentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-3">{t('sd.page', 'Page')} {paymentPage} {t('sd.of', 'of')} {totalPaymentPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPaymentPage(p => Math.min(totalPaymentPages, p + 1))} disabled={paymentPage === totalPaymentPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          {attendanceRecords.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="bg-card border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{attendanceStats.present}</p>
                <p className="text-xs text-muted-foreground">{t('sd.att_present', 'Present')}</p>
              </div>
              <div className="bg-card border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{attendanceStats.absent}</p>
                <p className="text-xs text-muted-foreground">{t('sd.att_absent', 'Absent')}</p>
              </div>
              <div className="bg-card border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{attendanceStats.late}</p>
                <p className="text-xs text-muted-foreground">{t('sd.att_late', 'Late')}</p>
              </div>
              <div className="bg-card border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{attendanceStats.rate}%</p>
                <p className="text-xs text-muted-foreground">{t('sd.att_rate', 'Attendance Rate')}</p>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('sd.col_date', 'Date')}</TableHead>
                    <TableHead>{t('sd.col_group', 'Group')}</TableHead>
                    <TableHead>{t('sd.col_status', 'Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {t('sd.no_attendance', 'No attendance records')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    attendanceRecords.map((record, i) => {
                      const config = attendanceStatusConfig[record.status] || attendanceStatusConfig.present
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{formatDate(record.attendance_date)}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => navigate(`/groups/${record.group_id}`)}
                              className="text-blue-600 hover:underline"
                            >
                              {record.group_name}
                            </button>
                          </TableCell>
                          <TableCell>
                            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.className)}>
                              {config.label}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {studentNotes.length} {t('sd.notes_count', 'note(s)')}
            </h3>
            {!addingNote && (
              <Button size="sm" variant="outline" onClick={() => setAddingNote(true)}>
                <Plus className="mr-2 h-4 w-4" />{t('sd.add_note', 'Add Note')}
              </Button>
            )}
          </div>

          {addingNote && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <Textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder={t('sd.note_placeholder', 'Write a note...')}
                  rows={3}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => { if (newNoteContent.trim()) addNote.mutate(newNoteContent.trim()) }}
                    disabled={addNote.isPending || !newNoteContent.trim()}
                  >
                    {addNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('sd.add_note', 'Add Note')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingNote(false); setNewNoteContent('') }}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {studentNotes.length === 0 && !addingNote ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t('sd.no_notes', 'No notes yet')}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => setAddingNote(true)}>
                    <Plus className="mr-2 h-4 w-4" />{t('sd.add_note', 'Add Note')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {studentNotes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(note.created_at)}</span>
                          {note.created_by_name && (
                            <>
                              <span>{t('sd.by', 'by')}</span>
                              <span className="font-medium text-foreground">{note.created_by_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {hasRole('admin') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0 shrink-0"
                          onClick={() => { if (window.confirm(t('sd.confirm_delete_note', 'Delete this note?'))) deleteNote.mutate(note.id) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Form */}
      <StudentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(data) => updateStudent.mutate(data)}
        student={student}
        isLoading={updateStudent.isPending}
      />

      {/* Record Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) closePayDialog(); else setPayDialogOpen(true) }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{t('sd.record_payment', 'Record Payment')} — {student.first_name} {student.last_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaySubmit} className="flex flex-col flex-1 min-h-0">
            <div className="grid gap-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2">
                <Label>{t('sd.col_group', 'Group')} *</Label>
                <Select
                  value={payGroupId}
                  onValueChange={(val) => {
                    setPayGroupId(val)
                    setPaySelectedMonths([])
                    setPayDebtInfo(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('sd.select_group', 'Select group')} />
                  </SelectTrigger>
                  <SelectContent>
                    {enrolledGroups.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name} — {formatCurrency(g.price)}/{t('sd.mo', 'mo')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {payGroupId && (
                <div className="space-y-2">
                  <Label>{t('sd.months_to_pay', 'Months to Pay')} *</Label>
                  {payLoadingMonths ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('sd.loading_months', 'Loading months...')}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {monthOptions.map(({ value, label }) => {
                        const currentMonth = getCurrentMonth()
                        const isCurrentMonth = value === currentMonth
                        const monthStatus = payAllMonthsStatus[value]
                        const isFullyPaid = monthStatus?.fullyPaid
                        const isSelected = paySelectedMonths.includes(value)

                        return (
                          <label
                            key={value}
                            className={`
                              flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all
                              ${isSelected
                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                : isFullyPaid
                                  ? 'border-green-300 bg-green-50 text-green-700'
                                  : isCurrentMonth
                                    ? 'border-blue-300 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-gray-300'
                              }
                            `}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => togglePayMonth(value)}
                            />
                            <span className={`text-sm font-medium ${isFullyPaid ? 'text-green-700' : ''}`}>
                              {label}
                            </span>
                            {isFullyPaid && (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {payLoadingDebt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('sd.loading_debt', 'Loading debt info...')}
                </div>
              )}

              {payDebtInfo && !payLoadingDebt && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>{t('sd.group_price', 'Group Price')}:</span>
                    <span className="font-medium">{formatCurrency(payDebtInfo.groupPrice)}</span>
                  </div>
                  {payDebtInfo.discountPercentage > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>{t('sd.col_discount', 'Discount')}:</span>
                      <span className="font-medium">{payDebtInfo.discountPercentage}%</span>
                    </div>
                  )}
                  {payDebtInfo.monthlyDiscount > 0 && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>{t('sd.monthly_discount', 'Monthly Discount')}:</span>
                      <span className="font-medium">-{formatCurrency(payDebtInfo.monthlyDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>{t('sd.monthly_rate', 'Monthly Rate')}:</span>
                    <span className="font-medium">{formatCurrency(payDebtInfo.monthlyDebt)}</span>
                  </div>
                  <hr />
                  <div className="space-y-1">
                    {payDebtInfo.monthDebts.map(md => (
                      <div key={md.month} className="flex justify-between text-sm">
                        <span>{formatMonthKey(md.month)}</span>
                        <span className={md.remaining === 0 ? 'text-green-600' : ''}>
                          {md.remaining === 0 ? (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> {t('sd.paid', 'Paid')}
                            </span>
                          ) : (
                            <>{t('sd.remaining', 'Remaining')}: {formatCurrency(md.remaining)}</>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr />
                  <div className="flex justify-between font-medium">
                    <span>{t('sd.total_remaining', 'Total Remaining')}:</span>
                    <span className={payDebtInfo.totalRemaining > 0 ? 'text-orange-600' : 'text-green-600'}>
                      {formatCurrency(payDebtInfo.totalRemaining)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-amount">{t('sd.col_amount', 'Amount')} *</Label>
                  <Input
                    ref={payAmount.ref}
                    id="pay-amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={payAmount.value}
                    onChange={payAmount.onChange}
                    onBlur={payAmount.onBlur}
                    required
                  />
                  {payDebtInfo && payDebtInfo.totalRemaining > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-auto py-1"
                      onClick={() => payAmount.setFromNumber(payDebtInfo.totalRemaining)}
                    >
                      {t('sd.pay_full', 'Pay full remaining')}: {formatCurrency(payDebtInfo.totalRemaining)}
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-date">{t('sd.col_date', 'Date')} *</Label>
                  <DateInput
                    id="pay-date"
                    value={payDate}
                    onChange={setPayDate}
                    required
                  />
                </div>
              </div>

              {payDebtInfo && payAmount.numericValue() > payDebtInfo.totalRemaining + 0.01 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{t('sd.toast_exceeds_debt', 'Amount exceeds remaining debt')} ({formatCurrency(payDebtInfo.totalRemaining)})</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="pay-method">{t('sd.payment_method', 'Payment Method')}</Label>
                <Select name="method" defaultValue="cash">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('sd.method_cash', 'Cash')}</SelectItem>
                    <SelectItem value="card">{t('sd.method_card', 'Card')}</SelectItem>
                    <SelectItem value="transfer">{t('sd.method_transfer', 'Bank Transfer')}</SelectItem>
                    <SelectItem value="other">{t('sd.method_other', 'Other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-notes">{t('sd.tab_notes', 'Notes')}</Label>
                <Textarea
                  id="pay-notes"
                  name="notes"
                  placeholder={t('sd.notes_placeholder', 'Any additional notes...')}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 flex-shrink-0">
              <Button type="button" variant="outline" onClick={closePayDialog}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  createPayment.isPending ||
                  !payGroupId ||
                  paySelectedMonths.length === 0 ||
                  !!(payDebtInfo && payAmount.numericValue() > payDebtInfo.totalRemaining + 0.01)
                }
              >
                {createPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('sd.record_payment', 'Record Payment')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Enroll in Group Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sd.add_to_group', 'Add to Group')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('sd.col_group', 'Group')}</Label>
              <Select value={enrollGroupId} onValueChange={setEnrollGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('sd.select_a_group', 'Select a group')} />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} — {formatCurrency(g.price)}/{t('sd.mo', 'mo')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('sd.col_discount', 'Discount')} (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={enrollDiscount}
                onChange={(e) => setEnrollDiscount(e.target.value)}
              />
            </div>
            {enrollGroupId && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('sd.group_price', 'Group Price')}:</span>
                  <span>{formatCurrency(availableGroups.find(g => g.id === Number(enrollGroupId))?.price || 0)}</span>
                </div>
                {Number(enrollDiscount) > 0 && (
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">{t('sd.after_discount', 'After discount')}:</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency((availableGroups.find(g => g.id === Number(enrollGroupId))?.price || 0) * (1 - Number(enrollDiscount) / 100))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              onClick={() => createEnrollment.mutate()}
              disabled={!enrollGroupId || createEnrollment.isPending}
            >
              {createEnrollment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('sd.enroll', 'Enroll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sd.delete_student', 'Delete Student')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sd.confirm_delete_student', 'Are you sure you want to delete this student? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteStudent.mutate()} className="bg-red-600 hover:bg-red-700">
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Enrollment Confirmation */}
      <AlertDialog open={!!removeEnrollmentId} onOpenChange={() => setRemoveEnrollmentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sd.remove_enrollment', 'Remove Enrollment')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sd.confirm_remove_enrollment', 'Are you sure you want to remove this student from the group? This will not delete payment history.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeEnrollmentId && removeEnrollment.mutate(removeEnrollmentId)} className="bg-red-600 hover:bg-red-700">
              {t('sd.remove', 'Remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Monthly Discount Dialog */}
      <Dialog open={mdDialogOpen} onOpenChange={(open) => { setMdDialogOpen(open); if (!open) { setMdAmount(''); setMdReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('sd.add_monthly_discount', 'Add Monthly Discount')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('sd.month', 'Month')}</Label>
              <Input
                type="month"
                value={mdMonth}
                onChange={e => setMdMonth(e.target.value)}
              />
            </div>
            <div>
              <Label>{t('sd.col_amount', 'Amount')}</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder={t('sd.amount_placeholder', 'e.g. 100000')}
                value={mdAmount}
                onChange={e => setMdAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>{t('sd.reason_optional', 'Reason (optional)')}</Label>
              <Input
                placeholder={t('sd.reason_placeholder', 'e.g. Financial hardship')}
                value={mdReason}
                onChange={e => setMdReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMdDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              disabled={!mdAmount || Number(mdAmount) <= 0 || !mdGroupId}
              onClick={() => {
                if (!mdGroupId) return
                createMonthlyDiscount.mutate({
                  student_id: studentId,
                  group_id: mdGroupId,
                  for_month: mdMonth + '-01',
                  amount: Number(mdAmount),
                  reason: mdReason || undefined,
                })
              }}
            >
              {t('sd.add_discount', 'Add Discount')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
