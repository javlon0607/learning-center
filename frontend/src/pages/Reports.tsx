import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, auditLogApi, type AuditLogEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Download, TrendingUp, TrendingDown, History } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

function formatAuditValues(obj: Record<string, unknown> | null): string {
  if (!obj || typeof obj !== 'object') return '—'
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v === null || v === undefined ? '—' : String(v)}`)
    .join(', ')
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

export function Reports() {
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['reports', 'payments', dateFrom, dateTo],
    queryFn: () => reportsApi.getPayments(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  })

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['reports', 'expenses', dateFrom, dateTo],
    queryFn: () => reportsApi.getExpenses(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  })

  const { data: summary } = useQuery({
    queryKey: ['reports', 'summary', dateFrom, dateTo],
    queryFn: () => reportsApi.getIncomeExpense(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  })

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => auditLogApi.getList({ limit: '100' }),
  })

  const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const netProfit = Number.isFinite(totalPayments) && Number.isFinite(totalExpenses)
    ? totalPayments - totalExpenses
    : 0

  // Group expenses by category for pie chart
  const expensesByCategory = expenses.reduce((acc, e) => {
    const amt = Number(e.amount) || 0
    acc[e.category] = (acc[e.category] || 0) + amt
    return acc
  }, {} as Record<string, number>)

  const expensePieData = Object.entries(expensesByCategory).map(([name, value]) => ({
    name,
    value,
  }))

  // Group payments by method
  const paymentsByMethod = payments.reduce((acc, p) => {
    const amt = Number(p.amount) || 0
    acc[p.method] = (acc[p.method] || 0) + amt
    return acc
  }, {} as Record<string, number>)

  const paymentMethodData = Object.entries(paymentsByMethod).map(([name, value]) => ({
    name,
    value,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-muted-foreground">Financial reports and analytics</p>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label>From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <div className="space-y-2">
          <Label>To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(Number.isFinite(totalPayments) ? totalPayments : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {payments.length} payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(Number.isFinite(totalExpenses) ? totalExpenses : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {expenses.length} expenses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {netProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(Number.isFinite(netProfit) ? netProfit : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Margin: {Number(totalPayments) > 0 && Number.isFinite(netProfit) ? ((netProfit / totalPayments) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="audit">Change history</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent>
                {expensePieData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expensePieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expensePieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No expense data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethodData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paymentMethodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="value" fill="#3b82f6" name="Amount" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No payment data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No payments in this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell>{payment.student_name}</TableCell>
                          <TableCell>{payment.group_name || '-'}</TableCell>
                          <TableCell className="capitalize">{payment.method}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Expense Details</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expensesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No expenses in this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.expense_date)}</TableCell>
                          <TableCell className="capitalize">{expense.category}</TableCell>
                          <TableCell>{expense.description || '-'}</TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {formatCurrency(expense.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Change history
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Who changed Payments, Discounts, Attendance, Salaries — with before/after values and timestamp.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Who changed</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Before</TableHead>
                      <TableHead>After</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No change history yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLog.map((entry: AuditLogEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {entry.changed_by_name || entry.changed_by_username || `User #${entry.user_id ?? '?'}`}
                          </TableCell>
                          <TableCell>
                            <span className="capitalize">{entry.entity_type}</span>
                            {entry.entity_id != null && ` #${entry.entity_id}`}
                          </TableCell>
                          <TableCell className="capitalize">{entry.action}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={formatAuditValues(entry.old_values)}>
                            {formatAuditValues(entry.old_values)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs" title={formatAuditValues(entry.new_values)}>
                            {formatAuditValues(entry.new_values)}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDate(entry.created_at)} {new Date(entry.created_at).toLocaleTimeString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
