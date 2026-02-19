import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { expensesApi, salarySlipsApi, teachersApi, Expense, TeacherSalaryPreview } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
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
import { Plus, Search, Loader2, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate, parseAmountFromInput } from '@/lib/utils'
import { useAmountInput } from '@/hooks/useAmountInput'
import { useAuth } from '@/contexts/AuthContext'

const categories = [
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'other', label: 'Other' },
]

export function Expenses() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const amount = useAmountInput()
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0])

  // Salary-specific state
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [salaryMonth, setSalaryMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [salaryPreview, setSalaryPreview] = useState<TeacherSalaryPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const baseAmount = useAmountInput()
  const bonus = useAmountInput()
  const deduction = useAmountInput()

  const isSalaryCategory = selectedCategory === 'salaries'

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: expensesApi.getAll,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const createExpense = useMutation({
    mutationFn: (data: Omit<Expense, 'id' | 'created_at'>) =>
      expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Expense recorded successfully' })
      setFormOpen(false)
      amount.reset()
    },
  })

  const [submittingSalary, setSubmittingSalary] = useState(false)

  const deleteExpense = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Expense deleted successfully' })
    },
    onError: (error: Error) => {
      toast({ title: 'Cannot delete expense', description: error.message, variant: 'destructive' })
    },
  })

  function handleDelete(id: number) {
    if (window.confirm('Are you sure you want to delete this expense? This action marks it as deleted.')) {
      deleteExpense.mutate(id)
    }
  }

  // Reset salary fields when category changes away from salaries
  useEffect(() => {
    if (!isSalaryCategory) {
      setSelectedTeacherId('')
      setSalaryMonth(new Date().toISOString().slice(0, 7))
      setSalaryPreview(null)
      baseAmount.reset()
      bonus.reset()
      deduction.reset()
    }
  }, [isSalaryCategory])

  // Fetch salary preview when teacher and month are selected
  useEffect(() => {
    if (!isSalaryCategory || !selectedTeacherId || !salaryMonth) {
      setSalaryPreview(null)
      return
    }
    const teacher = teachers.find((t) => t.id === Number(selectedTeacherId))
    if (!teacher) {
      setSalaryPreview(null)
      return
    }

    if (teacher.salary_type === 'fixed') {
      baseAmount.setFromNumber(teacher.salary_amount ?? 0)
      setSalaryPreview({
        teacher_id: teacher.id,
        month: salaryMonth,
        salary_type: 'fixed',
        salary_percentage: 0,
        collected_amount: 0,
        base_amount: teacher.salary_amount ?? 0,
      })
      return
    }

    setLoadingPreview(true)
    salarySlipsApi
      .preview(Number(selectedTeacherId), salaryMonth)
      .then((preview) => {
        setSalaryPreview(preview)
        baseAmount.setFromNumber(preview.base_amount)
      })
      .catch(() => {
        setSalaryPreview(null)
        baseAmount.reset()
      })
      .finally(() => setLoadingPreview(false))
  }, [selectedTeacherId, salaryMonth, teachers, isSalaryCategory])

  // Reset salary state when dialog closes
  function handleDialogChange(open: boolean) {
    setFormOpen(open)
    if (!open) {
      amount.reset()
      setSelectedCategory('')
      setSelectedTeacherId('')
      setSalaryMonth(new Date().toISOString().slice(0, 7))
      setSalaryPreview(null)
      baseAmount.reset()
      bonus.reset()
      deduction.reset()
      setExpenseDate(new Date().toISOString().split('T')[0])
    }
  }

  const filteredExpenses = expenses.filter(
    (e) =>
      e.category?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase())
  )

  const totalExpenses = filteredExpenses.reduce((sum, e) => e.deleted_at ? sum : sum + e.amount, 0)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (isSalaryCategory) {
      // Salary submission: create salary slip + expense
      const total = baseAmount.numericValue() + bonus.numericValue() - deduction.numericValue()
      if (total <= 0) {
        toast({ title: 'Salary total must be greater than zero', variant: 'destructive' })
        return
      }

      const teacher = teachers.find((t) => t.id === Number(selectedTeacherId))
      if (!teacher) {
        toast({ title: 'Please select a teacher', variant: 'destructive' })
        return
      }

      const month = salaryMonth
      const [yearStr, monthStr] = month.split('-')
      const year = Number(yearStr)
      const monthNum = Number(monthStr)
      const periodStart = `${month}-01`
      const periodEnd = new Date(year, monthNum, 0).toISOString().split('T')[0]
      const teacherName = `${teacher.first_name} ${teacher.last_name}`

      setSubmittingSalary(true)
      try {
        // 1. Create salary slip
        await salarySlipsApi.create({
          teacher_id: teacher.id,
          period_start: periodStart,
          period_end: periodEnd,
          base_amount: baseAmount.numericValue(),
          bonus: bonus.numericValue(),
          deduction: deduction.numericValue(),
          status: 'paid',
          notes: formData.get('notes') as string,
        })

        // 2. Create expense
        await expensesApi.create({
          category: 'salaries',
          amount: total,
          description: `Salary: ${teacherName} — ${month}`,
          expense_date: new Date().toISOString().split('T')[0],
        })

        queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
        queryClient.invalidateQueries({ queryKey: ['expenses'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        toast({ title: 'Salary expense recorded successfully' })
        handleDialogChange(false)
      } catch (err: any) {
        toast({ title: 'Failed to create salary expense', description: err.message, variant: 'destructive' })
      } finally {
        setSubmittingSalary(false)
      }
    } else {
      // Normal expense submission
      const amountValue = parseAmountFromInput((formData.get('amount') as string) ?? '')
      if (amountValue <= 0) {
        toast({ title: 'Enter a valid amount', variant: 'destructive' })
        return
      }
      const data = {
        category: selectedCategory,
        amount: amountValue,
        description: formData.get('description') as string,
        expense_date: expenseDate,
      }
      createExpense.mutate(data)
      setExpenseDate(new Date().toISOString().split('T')[0])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-muted-foreground">Track business expenses</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total Expenses</p>
          <p className="text-xl font-bold text-red-600">
            {formatCurrency(totalExpenses)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    No expenses found
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => {
                  const isDeleted = !!expense.deleted_at
                  return (
                    <TableRow key={expense.id} className={isDeleted ? 'opacity-50' : ''}>
                      <TableCell>{formatDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {expense.category}
                          </Badge>
                          {isDeleted && <Badge variant="destructive">Deleted</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className={`max-w-[300px] ${isDeleted ? 'line-through' : ''}`}>
                        {expense.description || '-'}
                      </TableCell>
                      <TableCell className={`text-right font-medium text-red-600 ${isDeleted ? 'line-through' : ''}`}>
                        {formatCurrency(expense.amount)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {!isDeleted && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(expense.id)}
                              disabled={deleteExpense.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  name="category"
                  required
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isSalaryCategory ? (
                <>
                  {/* Salary-specific fields */}
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

                  {/* Salary Preview */}
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
                </>
              ) : (
                <>
                  {/* Normal expense fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount *</Label>
                      <Input
                        ref={amount.ref}
                        id="amount"
                        name="amount"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount.value}
                        onChange={amount.onChange}
                        onBlur={amount.onBlur}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expense_date">Date *</Label>
                      <DateInput
                        id="expense_date"
                        value={expenseDate}
                        onChange={setExpenseDate}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Enter expense details..."
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createExpense.isPending || submittingSalary}>
                {(createExpense.isPending || submittingSalary) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSalaryCategory ? 'Add Salary Expense' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
