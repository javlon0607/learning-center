import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { expensesApi, Expense } from '@/lib/api'
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

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: expensesApi.getAll,
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

  const filteredExpenses = expenses.filter(
    (e) =>
      e.category?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase())
  )

  const totalExpenses = filteredExpenses.reduce((sum, e) => e.deleted_at ? sum : sum + e.amount, 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const amountValue = parseAmountFromInput((formData.get('amount') as string) ?? '')
    if (amountValue <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' })
      return
    }
    const data = {
      category: formData.get('category') as string,
      amount: amountValue,
      description: formData.get('description') as string,
      expense_date: expenseDate,
    }
    createExpense.mutate(data)
    setExpenseDate(new Date().toISOString().split('T')[0])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-muted-foreground">Track business expenses</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
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
        <div className="rounded-md border">
          <Table>
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

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) amount.reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select name="category" required>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createExpense.isPending}>
                {createExpense.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
