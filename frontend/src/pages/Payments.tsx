import { useState, useMemo, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { paymentsApi, studentsApi, groupsApi, enrollmentsApi, studentDebtApi, Payment } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput } from '@/components/ui/date-input'
import { formatCurrency, formatDate, formatDateTime, formatAmountForInput, parseAmountFromInput } from '@/lib/utils'

// Format YYYY-MM as "Jan 2026" using local date (avoid UTC parsing shifting month)
function formatMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

// Generate month options (3 months back, current, and 3 months forward = 7 total)
// Use local date components for YYYY-MM so timezone doesn't shift the month (toISOString() would use UTC).
function getMonthOptions() {
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -3; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const value = `${y}-${String(m).padStart(2, '0')}` // YYYY-MM in local
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    months.push({ value, label })
  }
  return months
}

// Get current month in YYYY-MM format
function getCurrentMonth() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function Payments() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [debtInfo, setDebtInfo] = useState<{
    groupPrice: number
    discountPercentage: number
    monthlyDebt: number
    monthDebts: { month: string; debt: number; paid: number; remaining: number }[]
    totalRemaining: number
  } | null>(null)
  const [loadingDebt, setLoadingDebt] = useState(false)
  // Track payment status for all displayed months (for styling fully paid months)
  const [allMonthsStatus, setAllMonthsStatus] = useState<Record<string, { remaining: number; fullyPaid: boolean }>>({})
  const [loadingMonthsStatus, setLoadingMonthsStatus] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [filterPaymentMonth, setFilterPaymentMonth] = useState<string>('')
  const [filterCourseMonth, setFilterCourseMonth] = useState<string>('')
  const [filterGroupId, setFilterGroupId] = useState<string>('')
  const [filterMethod, setFilterMethod] = useState<string>('')

  const monthOptions = useMemo(() => getMonthOptions(), [])
  const paymentMethods = useMemo(() => [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'transfer', label: 'Bank Transfer' },
    { value: 'other', label: 'Other' },
  ], [])

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: paymentsApi.getAll,
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  // Get students enrolled in the selected group (for Record Payment: group first, then students in that group)
  const { data: groupEnrollments = [] } = useQuery({
    queryKey: ['enrollments', 'group', selectedGroupId],
    queryFn: () => enrollmentsApi.getByGroup(Number(selectedGroupId)),
    enabled: !!selectedGroupId,
  })

  // Auto-select current month when student is selected
  useEffect(() => {
    if (selectedStudentId && selectedGroupId && selectedMonths.length === 0) {
      const currentMonth = getCurrentMonth()
      setSelectedMonths([currentMonth])
    }
  }, [selectedStudentId, selectedGroupId])

  // Fetch payment status for ALL displayed months when student+group are selected (for styling)
  useEffect(() => {
    async function fetchAllMonthsStatus() {
      if (!selectedStudentId || !selectedGroupId) {
        setAllMonthsStatus({})
        return
      }

      setLoadingMonthsStatus(true)
      try {
        const status: Record<string, { remaining: number; fullyPaid: boolean }> = {}
        for (const { value: month } of monthOptions) {
          const debt = await studentDebtApi.get(Number(selectedStudentId), Number(selectedGroupId), month)
          status[month] = {
            remaining: debt.remaining_debt,
            fullyPaid: debt.remaining_debt === 0
          }
        }
        setAllMonthsStatus(status)
      } catch (err) {
        console.error('Failed to fetch months status:', err)
        setAllMonthsStatus({})
      } finally {
        setLoadingMonthsStatus(false)
      }
    }
    fetchAllMonthsStatus()
  }, [selectedStudentId, selectedGroupId, monthOptions])

  // Fetch debt info when student, group and months are selected
  useEffect(() => {
    async function fetchDebtInfo() {
      if (!selectedStudentId || !selectedGroupId || selectedMonths.length === 0) {
        setDebtInfo(null)
        return
      }

      setLoadingDebt(true)
      try {
        const monthDebts: { month: string; debt: number; paid: number; remaining: number }[] = []
        let totalRemaining = 0
        let groupPrice = 0
        let discountPercentage = 0
        let monthlyDebt = 0

        for (const month of selectedMonths) {
          const debt = await studentDebtApi.get(Number(selectedStudentId), Number(selectedGroupId), month)
          groupPrice = debt.group_price
          discountPercentage = debt.discount_percentage
          monthlyDebt = debt.monthly_debt
          monthDebts.push({
            month,
            debt: debt.monthly_debt,
            paid: debt.paid_amount,
            remaining: debt.remaining_debt
          })
          totalRemaining += debt.remaining_debt
        }

        setDebtInfo({ groupPrice, discountPercentage, monthlyDebt, monthDebts, totalRemaining })
      } catch (err) {
        console.error('Failed to fetch debt info:', err)
        setDebtInfo(null)
      } finally {
        setLoadingDebt(false)
      }
    }
    fetchDebtInfo()
  }, [selectedStudentId, selectedGroupId, selectedMonths])

  const createPayment = useMutation({
    mutationFn: (data: Omit<Payment, 'id' | 'created_at' | 'student_name' | 'group_name' | 'months_covered'> & { months?: string[] }) =>
      paymentsApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast({
        title: 'Payment recorded',
        description: `Invoice: ${data.invoice_no}`,
      })
      setFormOpen(false)
      resetForm()
    },
  })

  function resetForm() {
    setAmountStr('')
    setSelectedStudentId('')
    setSelectedGroupId('')
    setSelectedMonths([])
    setDebtInfo(null)
    setAllMonthsStatus({})
    setPaymentDate(new Date().toISOString().split('T')[0])
  }

  function toggleMonth(month: string) {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month].sort()
    )
  }

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const searchMatch =
        !search ||
        p.student_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.group_name?.toLowerCase().includes(search.toLowerCase())
      if (!searchMatch) return false

      if (filterPaymentMonth) {
        const d = new Date(p.created_at)
        const payMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (payMonth !== filterPaymentMonth) return false
      }
      if (filterCourseMonth) {
        const months = p.months_covered?.map((mc) => mc.month) ?? []
        if (months.length === 0) {
          const d = new Date(p.payment_date)
          const payDateMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (payDateMonth !== filterCourseMonth) return false
        } else if (!months.includes(filterCourseMonth)) return false
      }
      if (filterGroupId && p.group_id !== Number(filterGroupId)) return false
      if (filterMethod && p.method !== filterMethod) return false
      return true
    })
  }, [payments, search, filterPaymentMonth, filterCourseMonth, filterGroupId, filterMethod])

  function handleAmountChange(value: string) {
    const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const parts = cleaned.split('.')
    // Allow only one decimal point; preserve trailing zeros (e.g. 1.00, 10, 0.50)
    const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned
    flushSync(() => setAmountStr(sanitized))
  }

  function handleAmountBlur() {
    const parsed = parseAmountFromInput(amountStr)
    setAmountStr(parsed === 0 ? '' : formatAmountForInput(parsed) || formatCurrency(parsed))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const amountValue = parseAmountFromInput((formData.get('amount') as string) ?? '')
    if (amountValue <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' })
      return
    }

    // Validate amount against remaining debt if debt info available
    if (debtInfo && amountValue > debtInfo.totalRemaining + 0.01) {
      toast({
        title: 'Amount exceeds remaining debt',
        description: `Maximum allowed: ${formatCurrency(debtInfo.totalRemaining)}`,
        variant: 'destructive'
      })
      return
    }

    const data = {
      student_id: Number(selectedStudentId),
      group_id: selectedGroupId ? Number(selectedGroupId) : undefined,
      amount: amountValue,
      payment_date: paymentDate,
      method: (formData.get('method') as Payment['method']) || 'cash',
      notes: formData.get('notes') as string,
      months: selectedMonths.length > 0 ? selectedMonths : undefined,
    }
    createPayment.mutate(data)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-muted-foreground">Track student payments</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterPaymentMonth || '_all'} onValueChange={(v) => setFilterPaymentMonth(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Payment month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All payment months</SelectItem>
            {monthOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCourseMonth || '_all'} onValueChange={(v) => setFilterCourseMonth(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Course month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All course months</SelectItem>
            {monthOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterGroupId || '_all'} onValueChange={(v) => setFilterGroupId(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All groups</SelectItem>
            {groups.filter(g => g.status === 'active').map((g) => (
              <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMethod || '_all'} onValueChange={(v) => setFilterMethod(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All methods</SelectItem>
            {paymentMethods.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & time</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Paid for</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => {
                  const paidFor = payment.months_covered?.length
                    ? payment.months_covered.map((mc) => formatMonthKey(mc.month)).join(', ')
                    : payment.payment_date
                      ? formatMonthKey(payment.payment_date.slice(0, 7))
                      : '-'
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDateTime(payment.created_at)}</TableCell>
                      <TableCell className="font-medium">{payment.student_name}</TableCell>
                      <TableCell>{payment.group_name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{paidFor}</TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {payment.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {payment.notes || '-'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="grid gap-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2">
                <Label htmlFor="group_id">Group *</Label>
                <Select
                  value={selectedGroupId}
                  onValueChange={(val) => {
                    setSelectedGroupId(val)
                    setSelectedStudentId('')
                    setSelectedMonths([])
                    setDebtInfo(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.filter(g => g.status === 'active').map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name} - {formatCurrency(group.price)}/month
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedGroupId && (
                <div className="space-y-2">
                  <Label htmlFor="student_id">Student *</Label>
                  <Select
                    value={selectedStudentId}
                    onValueChange={(val) => {
                      setSelectedStudentId(val)
                      setSelectedMonths([])
                      setDebtInfo(null)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select student in this group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupEnrollments.length > 0 ? (
                        groupEnrollments.map((e) => (
                          <SelectItem key={e.student_id} value={e.student_id.toString()}>
                            {e.student_name ?? `Student ${e.student_id}`}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>
                          No students in this group
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {groupEnrollments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No students enrolled in this group
                    </p>
                  )}
                </div>
              )}

              {selectedGroupId && (
                <div className="space-y-2">
                  <Label>Months to Pay *</Label>
                  {loadingMonthsStatus ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading months...
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {monthOptions.map(({ value, label }) => {
                        const currentMonth = getCurrentMonth()
                        const isCurrentMonth = value === currentMonth
                        const monthStatus = allMonthsStatus[value]
                        const isFullyPaid = monthStatus?.fullyPaid
                        const isSelected = selectedMonths.includes(value)

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
                              onCheckedChange={() => toggleMonth(value)}
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

              {loadingDebt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading debt info...
                </div>
              )}

              {debtInfo && !loadingDebt && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Group Price:</span>
                    <span className="font-medium">{formatCurrency(debtInfo.groupPrice)}</span>
                  </div>
                  {debtInfo.discountPercentage > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount:</span>
                      <span className="font-medium">{debtInfo.discountPercentage}%</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Monthly Rate:</span>
                    <span className="font-medium">{formatCurrency(debtInfo.monthlyDebt)}</span>
                  </div>
                  <hr />
                  <div className="space-y-1">
                    {debtInfo.monthDebts.map(md => (
                      <div key={md.month} className="flex justify-between text-sm">
                        <span>{formatMonthKey(md.month)}</span>
                        <span className={md.remaining === 0 ? 'text-green-600' : ''}>
                          {md.remaining === 0 ? (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Paid
                            </span>
                          ) : (
                            <>Remaining: {formatCurrency(md.remaining)}</>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr />
                  <div className="flex justify-between font-medium">
                    <span>Total Remaining:</span>
                    <span className={debtInfo.totalRemaining > 0 ? 'text-orange-600' : 'text-green-600'}>
                      {formatCurrency(debtInfo.totalRemaining)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    onBlur={handleAmountBlur}
                    required
                  />
                  {debtInfo && debtInfo.totalRemaining > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-auto py-1"
                      onClick={() => setAmountStr(debtInfo.totalRemaining.toString())}
                    >
                      Pay full remaining: {formatCurrency(debtInfo.totalRemaining)}
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_date">Date *</Label>
                  <DateInput
                    id="payment_date"
                    value={paymentDate}
                    onChange={setPaymentDate}
                    required
                  />
                </div>
              </div>

              {debtInfo && parseAmountFromInput(amountStr) > debtInfo.totalRemaining + 0.01 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Amount exceeds remaining debt ({formatCurrency(debtInfo.totalRemaining)})</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="method">Payment Method</Label>
                <Select name="method" defaultValue="cash">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createPayment.isPending ||
                  !selectedStudentId ||
                  !selectedGroupId ||
                  selectedMonths.length === 0 ||
                  !!(debtInfo && parseAmountFromInput(amountStr) > debtInfo.totalRemaining + 0.01)
                }
              >
                {createPayment.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
