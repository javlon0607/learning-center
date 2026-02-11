import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { salarySlipsApi, teachersApi, SalarySlip, TeacherSalaryPreview } from '@/lib/api'
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
import { Plus, Search, Loader2, Check, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAmountInput } from '@/hooks/useAmountInput'
import { useAuth } from '@/contexts/AuthContext'

export function Salaries() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [salaryMonth, setSalaryMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const baseAmount = useAmountInput()
  const bonus = useAmountInput()
  const deduction = useAmountInput()
  const [salaryPreview, setSalaryPreview] = useState<TeacherSalaryPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const { data: salarySlips = [], isLoading } = useQuery({
    queryKey: ['salary-slips'],
    queryFn: salarySlipsApi.getAll,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const createSalarySlip = useMutation({
    mutationFn: (data: Omit<SalarySlip, 'id' | 'created_at' | 'teacher_name' | 'total_amount'>) =>
      salarySlipsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
      toast({ title: 'Salary slip created successfully' })
      setFormOpen(false)
      setSalaryMonth(new Date().toISOString().slice(0, 7))
      setSelectedTeacherId('')
      baseAmount.reset()
      bonus.reset()
      deduction.reset()
      setSalaryPreview(null)
    },
  })

  const markAsPaid = useMutation({
    mutationFn: (id: number) =>
      salarySlipsApi.update(id, { status: 'paid', paid_at: new Date().toISOString().split('T')[0] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
      toast({ title: 'Salary slip marked as paid' })
    },
  })

  const deleteSalarySlip = useMutation({
    mutationFn: (id: number) => salarySlipsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
      toast({ title: 'Salary slip deleted successfully' })
    },
  })

  function handleDelete(id: number) {
    if (window.confirm('Are you sure you want to delete this salary slip? This action marks it as deleted.')) {
      deleteSalarySlip.mutate(id)
    }
  }

  // Fetch salary preview when teacher and month are selected
  useEffect(() => {
    if (!selectedTeacherId || !salaryMonth) {
      setSalaryPreview(null)
      return
    }
    const teacher = teachers.find((t) => t.id === Number(selectedTeacherId))
    if (!teacher) {
      setSalaryPreview(null)
      return
    }

    // For fixed salary, we can set it directly without API call
    if (teacher.salary_type === 'fixed') {
      baseAmount.setFromNumber(teacher.salary_amount ?? 0)
      setSalaryPreview({
        teacher_id: teacher.id,
        month: salaryMonth,
        salary_type: 'fixed',
        salary_percentage: 0,
        collected_amount: 0,
        base_amount: teacher.salary_amount ?? 0
      })
      return
    }

    // For per_student, fetch the calculated amount from API
    setLoadingPreview(true)
    salarySlipsApi.preview(Number(selectedTeacherId), salaryMonth)
      .then((preview) => {
        setSalaryPreview(preview)
        baseAmount.setFromNumber(preview.base_amount)
      })
      .catch(() => {
        setSalaryPreview(null)
        baseAmount.reset()
      })
      .finally(() => setLoadingPreview(false))
  }, [selectedTeacherId, salaryMonth, teachers])

  const filteredSlips = salarySlips.filter(
    (s) =>
      s.teacher_name?.toLowerCase().includes(search.toLowerCase())
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const month = salaryMonth
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    const periodStart = month ? `${month}-01` : ''
    const periodEnd = month
      ? new Date(year, monthNum, 0).toISOString().split('T')[0]
      : ''

    const data = {
      teacher_id: Number(formData.get('teacher_id')),
      period_start: periodStart,
      period_end: periodEnd,
      base_amount: baseAmount.numericValue(),
      bonus: bonus.numericValue(),
      deduction: deduction.numericValue(),
      status: 'pending' as const,
      notes: formData.get('notes') as string,
    }
    createSalarySlip.mutate(data)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salaries</h1>
          <p className="text-muted-foreground">Manage teacher salary slips</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Salary Slip
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
                <TableHead>Teacher</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Deduction</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSlips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No salary slips found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSlips.map((slip) => {
                  const isDeleted = !!slip.deleted_at
                  return (
                    <TableRow key={slip.id} className={isDeleted ? 'opacity-50' : ''}>
                      <TableCell className={`font-medium ${isDeleted ? 'line-through' : ''}`}>{slip.teacher_name}</TableCell>
                      <TableCell>
                        {formatDate(slip.period_start)} - {formatDate(slip.period_end)}
                      </TableCell>
                      <TableCell>{formatCurrency(slip.base_amount)}</TableCell>
                      <TableCell className="text-green-600">+{formatCurrency(slip.bonus)}</TableCell>
                      <TableCell className="text-red-600">-{formatCurrency(slip.deduction)}</TableCell>
                      <TableCell className={`font-semibold ${isDeleted ? 'line-through' : ''}`}>{formatCurrency(slip.total_amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={slip.status === 'paid' ? 'success' : 'warning'}>
                            {slip.status}
                          </Badge>
                          {isDeleted && <Badge variant="destructive">Deleted</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {slip.status === 'pending' && !isDeleted && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markAsPaid.mutate(slip.id)}
                              disabled={markAsPaid.isPending}
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Pay
                            </Button>
                          )}
                          {slip.status === 'paid' && slip.paid_at && !isDeleted && (
                            <span className="text-sm text-muted-foreground">
                              {formatDate(slip.paid_at)}
                            </span>
                          )}
                          {isAdmin && !isDeleted && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(slip.id)}
                              disabled={deleteSalarySlip.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Salary Slip</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="teacher_id">Teacher *</Label>
                <Select
                  name="teacher_id"
                  required
                  value={selectedTeacherId}
                  onValueChange={setSelectedTeacherId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.filter(t => t.status === 'active').map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.first_name} {teacher.last_name} - {formatCurrency(teacher.salary_amount)} ({teacher.salary_type === 'per_student' ? `${teacher.salary_amount}%` : 'fixed'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_month">Month *</Label>
                <Input
                  id="salary_month"
                  type="month"
                  value={salaryMonth}
                  onChange={(e) => setSalaryMonth(e.target.value)}
                  required
                />
              </div>
              {/* Salary Preview Info */}
              {loadingPreview && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating salary...
                </div>
              )}
              {salaryPreview && !loadingPreview && salaryPreview.salary_type === 'per_student' && (
                <div className="rounded-md bg-blue-50 p-3 text-sm space-y-1">
                  <p className="font-medium text-blue-900">Per-Student Salary Calculation</p>
                  <p className="text-blue-700">
                    Collected payments: <span className="font-semibold">{formatCurrency(salaryPreview.collected_amount)}</span>
                  </p>
                  <p className="text-blue-700">
                    Teacher rate: <span className="font-semibold">{salaryPreview.salary_percentage}%</span>
                  </p>
                  <p className="text-blue-700">
                    Calculated base: <span className="font-semibold">{formatCurrency(salaryPreview.base_amount)}</span>
                  </p>
                </div>
              )}
              {salaryPreview && !loadingPreview && salaryPreview.salary_type === 'fixed' && (
                <div className="rounded-md bg-green-50 p-3 text-sm">
                  <p className="text-green-700">
                    Fixed salary: <span className="font-semibold">{formatCurrency(salaryPreview.base_amount)}</span>
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base_amount">Base Amount *</Label>
                  <Input
                    ref={baseAmount.ref}
                    id="base_amount"
                    name="base_amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={baseAmount.value}
                    onChange={baseAmount.onChange}
                    onBlur={baseAmount.onBlur}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bonus">Bonus</Label>
                  <Input
                    ref={bonus.ref}
                    id="bonus"
                    name="bonus"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={bonus.value}
                    onChange={bonus.onChange}
                    onBlur={bonus.onBlur}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deduction">Deduction</Label>
                  <Input
                    ref={deduction.ref}
                    id="deduction"
                    name="deduction"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={deduction.value}
                    onChange={deduction.onChange}
                    onBlur={deduction.onBlur}
                  />
                </div>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSalarySlip.isPending}>
                {createSalarySlip.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Slip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
