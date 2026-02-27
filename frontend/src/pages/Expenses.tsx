import { useState, useEffect, useMemo } from 'react'
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
import { Plus, Search, Loader2, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatCurrency, formatDate, parseAmountFromInput } from '@/lib/utils'
import { useAmountInput } from '@/hooks/useAmountInput'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useTranslation } from '@/contexts/I18nContext'

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthOptions() {
  const months: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i >= -11; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const value = `${y}-${String(m).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    months.push({ value, label })
  }
  return months
}

export function Expenses() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hasFeature } = usePermissions()
  const { t } = useTranslation()
  const categories = useMemo(() => [
    { value: 'rent', label: t('expenses.cat_rent', 'Rent') },
    { value: 'utilities', label: t('expenses.cat_utilities', 'Utilities') },
    { value: 'supplies', label: t('expenses.cat_supplies', 'Supplies') },
    { value: 'marketing', label: t('expenses.cat_marketing', 'Marketing') },
    { value: 'equipment', label: t('expenses.cat_equipment', 'Equipment') },
    { value: 'maintenance', label: t('expenses.cat_maintenance', 'Maintenance') },
    { value: 'salaries', label: t('expenses.cat_salaries', 'Salaries') },
    { value: 'other', label: t('expenses.cat_other', 'Other') },
  ], [t])
  const canDelete = hasFeature('expenses_delete')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMonth, setFilterMonth] = useState(() => getCurrentMonth())
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const monthOptions = useMemo(() => getMonthOptions(), [])
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
      toast({ title: t('expenses.toast_recorded', 'Expense recorded successfully') })
      setFormOpen(false)
      amount.reset()
    },
  })

  const [submittingSalary, setSubmittingSalary] = useState(false)

  // Pagination
  const pageSizeOptions = [20, 50, 100]
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const deleteExpense = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: t('expenses.toast_deleted', 'Expense deleted successfully') })
    },
    onError: (error: Error) => {
      toast({ title: t('expenses.toast_delete_error', 'Cannot delete expense'), description: error.message, variant: 'destructive' })
    },
  })

  function handleDelete(id: number) {
    if (window.confirm(t('expenses.confirm_delete', 'Are you sure you want to delete this expense? This action marks it as deleted.'))) {
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

  useEffect(() => { setCurrentPage(1) }, [search, filterCategory, filterMonth, filterDateFrom, filterDateTo])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (search && !e.category?.toLowerCase().includes(search.toLowerCase()) && !e.description?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCategory && e.category !== filterCategory) return false
      if (filterMonth && e.expense_date?.slice(0, 7) !== filterMonth) return false
      if (filterDateFrom && e.expense_date < filterDateFrom) return false
      if (filterDateTo && e.expense_date > filterDateTo) return false
      return true
    })
  }, [expenses, search, filterCategory, filterMonth, filterDateFrom, filterDateTo])

  // Total for current month (always from raw data, unaffected by filters)
  const currentMonthTotal = useMemo(() => {
    const cm = getCurrentMonth()
    return expenses
      .filter(e => !e.deleted_at && e.expense_date?.slice(0, 7) === cm)
      .reduce((sum, e) => sum + Number(e.amount), 0)
  }, [expenses])

  // Total matching the current filters
  const totalExpenses = filteredExpenses.reduce((sum, e) => e.deleted_at ? sum : sum + Number(e.amount), 0)

  const hasActiveFilters = !!(filterCategory || filterMonth !== getCurrentMonth() || filterDateFrom || filterDateTo || search)

  const totalPages = Math.ceil(filteredExpenses.length / pageSize)
  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (isSalaryCategory) {
      // Salary submission: create salary slip + expense
      const total = baseAmount.numericValue() + bonus.numericValue() - deduction.numericValue()
      if (total <= 0) {
        toast({ title: t('expenses.toast_salary_zero', 'Salary total must be greater than zero'), variant: 'destructive' })
        return
      }

      const teacher = teachers.find((t) => t.id === Number(selectedTeacherId))
      if (!teacher) {
        toast({ title: t('expenses.toast_select_teacher', 'Please select a teacher'), variant: 'destructive' })
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
        toast({ title: t('expenses.toast_salary_recorded', 'Salary expense recorded successfully') })
        handleDialogChange(false)
      } catch (err: any) {
        toast({ title: t('expenses.toast_salary_error', 'Failed to create salary expense'), description: err.message, variant: 'destructive' })
      } finally {
        setSubmittingSalary(false)
      }
    } else {
      // Normal expense submission
      const amountValue = parseAmountFromInput((formData.get('amount') as string) ?? '')
      if (amountValue <= 0) {
        toast({ title: t('expenses.toast_invalid_amount', 'Enter a valid amount'), variant: 'destructive' })
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
          <h1 className="text-2xl font-bold text-slate-900">{t('expenses.title', 'Expenses')}</h1>
          <p className="text-muted-foreground">{t('expenses.description', 'Track business expenses')}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('expenses.add', 'Add Expense')}
        </Button>
      </div>

      {/* Totals */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border bg-card px-4 py-3 min-w-[160px]">
          <p className="text-xs text-muted-foreground">{t('expenses.this_month', 'This Month')}</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(currentMonthTotal)}</p>
        </div>
        {hasActiveFilters && (
          <div className="rounded-lg border bg-card px-4 py-3 min-w-[160px]">
            <p className="text-xs text-muted-foreground">{t('expenses.filtered_total', 'Filtered Total')}</p>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(totalExpenses)}</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('expenses.search', 'Search expenses...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory || '_all'} onValueChange={(v) => setFilterCategory(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder={t('expenses.all_categories', 'All categories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t('expenses.all_categories', 'All categories')}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth || '_all'} onValueChange={(v) => setFilterMonth(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('expenses.all_months', 'All months')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t('expenses.all_months', 'All months')}</SelectItem>
            {monthOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <DateInput
            value={filterDateFrom}
            onChange={setFilterDateFrom}
            placeholder={t('common.from_date', 'From date')}
            className="w-[130px]"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <DateInput
            value={filterDateTo}
            onChange={setFilterDateTo}
            placeholder={t('common.to_date', 'To date')}
            className="w-[130px]"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setFilterCategory(''); setFilterMonth(getCurrentMonth()); setFilterDateFrom(''); setFilterDateTo('') }}
          >
            <X className="mr-1 h-3 w-3" />
            {t('common.btn_clear', 'Clear')}
          </Button>
        )}
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
                <TableHead>{t('expenses.col_date', 'Date')}</TableHead>
                <TableHead>{t('expenses.col_category', 'Category')}</TableHead>
                <TableHead>{t('expenses.col_description', 'Description')}</TableHead>
                <TableHead className="text-right">{t('expenses.col_amount', 'Amount')}</TableHead>
                {canDelete && <TableHead className="w-[80px]">{t('common.col_actions', 'Actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    {t('expenses.no_data', 'No expenses found')}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedExpenses.map((expense) => {
                  const isDeleted = !!expense.deleted_at
                  return (
                    <TableRow key={expense.id} className={isDeleted ? 'opacity-50' : ''}>
                      <TableCell>{formatDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {expense.category}
                          </Badge>
                          {isDeleted && <Badge variant="destructive">{t('common.deleted', 'Deleted')}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className={`max-w-[300px] ${isDeleted ? 'line-through' : ''}`}>
                        {expense.description || '-'}
                      </TableCell>
                      <TableCell className={`text-right font-medium text-red-600 ${isDeleted ? 'line-through' : ''}`}>
                        {formatCurrency(expense.amount)}
                      </TableCell>
                      {canDelete && (
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

      {!isLoading && filteredExpenses.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('common.showing', 'Showing')} {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredExpenses.length)} {t('common.of', 'of')} {filteredExpenses.length}</span>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{t('common.per_page', 'per page')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
              <ChevronLeft className="h-4 w-4 -ml-2" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              <span className="text-sm">{t('common.page', 'Page')}</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = Number(e.target.value)
                  if (page >= 1 && page <= totalPages) setCurrentPage(page)
                }}
                className="w-14 h-8 text-center"
              />
              <span className="text-sm">{t('common.of', 'of')} {totalPages}</span>
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
              <ChevronRight className="h-4 w-4 -ml-2" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('expenses.dialog_add', 'Add Expense')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category">{t('expenses.form_category', 'Category')} *</Label>
                <Select
                  name="category"
                  required
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('expenses.form_select_category', 'Select category')} />
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
                    <Label htmlFor="teacher_id">{t('expenses.form_teacher', 'Teacher')} *</Label>
                    <Select
                      name="teacher_id"
                      required
                      value={selectedTeacherId}
                      onValueChange={setSelectedTeacherId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('expenses.form_select_teacher', 'Select teacher')} />
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
                    <Label htmlFor="salary_month">{t('expenses.form_month', 'Month')} *</Label>
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
                      {t('expenses.calculating_salary', 'Calculating salary...')}
                    </div>
                  )}
                  {salaryPreview && !loadingPreview && salaryPreview.salary_type === 'per_student' && (
                    <div className="rounded-md bg-blue-50 p-3 text-sm space-y-1">
                      <p className="font-medium text-blue-900">{t('expenses.salary_per_student', 'Per-Student Salary Calculation')}</p>
                      <p className="text-blue-700">
                        {t('expenses.salary_collected', 'Collected payments')}: <span className="font-semibold">{formatCurrency(salaryPreview.collected_amount)}</span>
                      </p>
                      <p className="text-blue-700">
                        {t('expenses.salary_teacher_rate', 'Teacher rate')}: <span className="font-semibold">{salaryPreview.salary_percentage}%</span>
                      </p>
                      <p className="text-blue-700">
                        {t('expenses.salary_calculated_base', 'Calculated base')}: <span className="font-semibold">{formatCurrency(salaryPreview.base_amount)}</span>
                      </p>
                    </div>
                  )}
                  {salaryPreview && !loadingPreview && salaryPreview.salary_type === 'fixed' && (
                    <div className="rounded-md bg-green-50 p-3 text-sm">
                      <p className="text-green-700">
                        {t('expenses.salary_fixed', 'Fixed salary')}: <span className="font-semibold">{formatCurrency(salaryPreview.base_amount)}</span>
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="base_amount">{t('expenses.form_base_amount', 'Base Amount')} *</Label>
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
                      <Label htmlFor="bonus">{t('expenses.form_bonus', 'Bonus')}</Label>
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
                      <Label htmlFor="deduction">{t('expenses.form_deduction', 'Deduction')}</Label>
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
                    <Label htmlFor="notes">{t('common.form_notes', 'Notes')}</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      placeholder={t('common.notes_placeholder', 'Any additional notes...')}
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Normal expense fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">{t('expenses.form_amount', 'Amount')} *</Label>
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
                      <Label htmlFor="expense_date">{t('expenses.form_date', 'Date')} *</Label>
                      <DateInput
                        id="expense_date"
                        value={expenseDate}
                        onChange={setExpenseDate}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{t('expenses.form_description', 'Description')}</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder={t('expenses.form_description_placeholder', 'Enter expense details...')}
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                {t('common.btn_cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={createExpense.isPending || submittingSalary}>
                {(createExpense.isPending || submittingSalary) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSalaryCategory ? t('expenses.btn_add_salary', 'Add Salary Expense') : t('expenses.btn_add', 'Add Expense')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
