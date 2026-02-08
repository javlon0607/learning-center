import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, auditLogApi, type AuditLogEntry } from '@/lib/api'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { TrendingUp, TrendingDown, History, Calendar, Users, Building2, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

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
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7))

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

  // Audit log state
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditEntityType, setAuditEntityType] = useState('all')
  const [auditAction, setAuditAction] = useState('all')
  const [auditPage, setAuditPage] = useState(1)
  const auditPageSize = 50

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-log', auditDateFrom, auditDateTo, auditEntityType, auditAction, auditPage],
    queryFn: () => auditLogApi.getList({
      ...(auditDateFrom ? { date_from: auditDateFrom } : {}),
      ...(auditDateTo ? { date_to: auditDateTo } : {}),
      ...(auditEntityType !== 'all' ? { entity_type: auditEntityType } : {}),
      ...(auditAction !== 'all' ? { action: auditAction } : {}),
      limit: String(auditPageSize),
      offset: String((auditPage - 1) * auditPageSize),
    }),
  })

  const auditLog = auditData?.rows ?? []
  const auditTotal = auditData?.total ?? 0
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize))

  const { data: monthlyReport, isLoading: monthlyLoading } = useQuery({
    queryKey: ['reports', 'monthly', reportMonth],
    queryFn: () => reportsApi.getMonthly(reportMonth),
    enabled: !!reportMonth,
  })

  // Data for monthly report charts
  const monthlyChartData = useMemo(() => {
    if (!monthlyReport) return { barData: [], pieData: [] }

    const barData = monthlyReport.groups.map(g => ({
      name: g.group_name.length > 15 ? g.group_name.slice(0, 15) + '...' : g.group_name,
      expected: g.expected_amount,
      collected: g.collected_amount,
    }))

    const pieData = [
      { name: 'Teacher Portions', value: monthlyReport.totals.teacher_portion },
      { name: 'Center Portion', value: monthlyReport.totals.center_portion },
    ].filter(d => d.value > 0)

    return { barData, pieData }
  }, [monthlyReport])

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
          <DateInput
            value={dateFrom}
            onChange={setDateFrom}
            className="w-[140px]"
          />
        </div>
        <div className="space-y-2">
          <Label>To</Label>
          <DateInput
            value={dateTo}
            onChange={setDateTo}
            className="w-[140px]"
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
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
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

        <TabsContent value="monthly" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label>Select Month</Label>
              <Input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-[200px]"
              />
            </div>
          </div>

          {monthlyLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : monthlyReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Expected</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(monthlyReport.totals.expected_amount)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      From {monthlyReport.totals.student_count} students
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Collected</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(monthlyReport.totals.collected_amount)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {monthlyReport.totals.payment_percentage}% collection rate
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Teacher Portions</CardTitle>
                    <Users className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(monthlyReport.totals.teacher_portion)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      For per-student salary teachers
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Center Portion</CardTitle>
                    <Building2 className="h-4 w-4 text-purple-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">
                      {formatCurrency(monthlyReport.totals.center_portion)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Remaining: {formatCurrency(monthlyReport.totals.remaining_debt)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Collection by Group</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {monthlyChartData.barData.length > 0 ? (
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyChartData.barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                            <YAxis />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="expected" fill="#94a3b8" name="Expected" />
                            <Bar dataKey="collected" fill="#22c55e" name="Collected" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {monthlyChartData.pieData.length > 0 ? (
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={monthlyChartData.pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {monthlyChartData.pieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#8b5cf6'} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No revenue data
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Group Report</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Group</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead className="text-center">Students</TableHead>
                          <TableHead className="text-center">Paid</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Collected</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-center">%</TableHead>
                          <TableHead className="text-right">Teacher</TableHead>
                          <TableHead className="text-right">Center</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyReport.groups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                              No groups found
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {monthlyReport.groups.map((group) => (
                              <TableRow key={group.group_id}>
                                <TableCell className="font-medium">{group.group_name}</TableCell>
                                <TableCell>{group.teacher_name}</TableCell>
                                <TableCell className="text-center">{group.student_count}</TableCell>
                                <TableCell className="text-center">{group.paid_student_count}</TableCell>
                                <TableCell className="text-right">{formatCurrency(group.expected_amount)}</TableCell>
                                <TableCell className="text-right text-green-600">{formatCurrency(group.collected_amount)}</TableCell>
                                <TableCell className="text-right text-orange-600">{formatCurrency(group.remaining_debt)}</TableCell>
                                <TableCell className="text-center">
                                  <span className={group.payment_percentage >= 80 ? 'text-green-600' : group.payment_percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                                    {group.payment_percentage}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-blue-600">{formatCurrency(group.teacher_portion)}</TableCell>
                                <TableCell className="text-right text-purple-600">{formatCurrency(group.center_portion)}</TableCell>
                              </TableRow>
                            ))}
                            {/* Totals Row */}
                            <TableRow className="bg-muted/50 font-bold">
                              <TableCell>TOTAL</TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-center">{monthlyReport.totals.student_count}</TableCell>
                              <TableCell className="text-center">{monthlyReport.totals.paid_student_count}</TableCell>
                              <TableCell className="text-right">{formatCurrency(monthlyReport.totals.expected_amount)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(monthlyReport.totals.collected_amount)}</TableCell>
                              <TableCell className="text-right text-orange-600">{formatCurrency(monthlyReport.totals.remaining_debt)}</TableCell>
                              <TableCell className="text-center">{monthlyReport.totals.payment_percentage}%</TableCell>
                              <TableCell className="text-right text-blue-600">{formatCurrency(monthlyReport.totals.teacher_portion)}</TableCell>
                              <TableCell className="text-right text-purple-600">{formatCurrency(monthlyReport.totals.center_portion)}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Select a month to view report
            </div>
          )}
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

        <TabsContent value="audit" className="mt-4 space-y-4">
          {/* Audit Filters */}
          <div className="flex flex-wrap items-end gap-3 p-4 bg-card rounded-xl border border-border/60">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <DateInput value={auditDateFrom} onChange={(v) => { setAuditDateFrom(v); setAuditPage(1); }} className="w-[140px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <DateInput value={auditDateTo} onChange={(v) => { setAuditDateTo(v); setAuditPage(1); }} className="w-[140px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entity</Label>
              <Select value={auditEntityType} onValueChange={(v) => { setAuditEntityType(v); setAuditPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="discount">Discount</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="salary_slip">Salary</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={auditAction} onValueChange={(v) => { setAuditAction(v); setAuditPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="soft_delete">Soft Delete</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="lead_convert">Lead Convert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(auditDateFrom || auditDateTo || auditEntityType !== 'all' || auditAction !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setAuditDateFrom(''); setAuditDateTo(''); setAuditEntityType('all'); setAuditAction('all'); setAuditPage(1); }}>
                Clear filters
              </Button>
            )}
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (auditLog.length === 0) return
                  const headers = ['ID', 'User', 'Entity', 'Entity ID', 'Action', 'Before', 'After', 'IP', 'Timestamp']
                  const csvRows = [headers.join(',')]
                  auditLog.forEach((e: AuditLogEntry) => {
                    const row = [
                      e.id,
                      `"${(e.changed_by_name || e.changed_by_username || '').replace(/"/g, '""')}"`,
                      e.entity_type,
                      e.entity_id ?? '',
                      e.action,
                      `"${formatAuditValues(e.old_values).replace(/"/g, '""')}"`,
                      `"${formatAuditValues(e.new_values).replace(/"/g, '""')}"`,
                      e.ip_address || '',
                      e.created_at,
                    ]
                    csvRows.push(row.join(','))
                  })
                  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="h-4 w-4 mr-1" />Export CSV
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Change history
                <span className="text-sm font-normal text-muted-foreground ml-2">({auditTotal} entries)</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Who changed Payments, Discounts, Attendance, Salaries, Students, Leads, Groups, Teachers, Users — with before/after values and timestamp.
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
                          <TableCell className="capitalize">{entry.action?.replace('_', ' ')}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={formatAuditValues(entry.old_values)}>
                            {formatAuditValues(entry.old_values)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs" title={formatAuditValues(entry.new_values)}>
                            {formatAuditValues(entry.new_values)}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDateTime(entry.created_at)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Audit Pagination */}
          {auditTotalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <span className="text-sm text-muted-foreground">
                Showing {((auditPage - 1) * auditPageSize) + 1}–{Math.min(auditPage * auditPageSize, auditTotal)} of {auditTotal}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAuditPage(1)} disabled={auditPage === 1}>
                  <ChevronLeft className="h-4 w-4" /><ChevronLeft className="h-4 w-4 -ml-2" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAuditPage(auditPage - 1)} disabled={auditPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-3">Page {auditPage} of {auditTotalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAuditPage(auditPage + 1)} disabled={auditPage === auditTotalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAuditPage(auditTotalPages)} disabled={auditPage === auditTotalPages}>
                  <ChevronRight className="h-4 w-4" /><ChevronRight className="h-4 w-4 -ml-2" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
