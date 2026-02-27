import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/lib/api'
import { DateInput } from '@/components/ui/date-input'
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
} from 'recharts'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, TrendingUp, TrendingDown, Calendar, Users, Building2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

export function Reports() {
  const { t } = useTranslation()
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [debtorGroup, setDebtorGroup] = useState<{ id: number; name: string } | null>(null)

  const { data: groupDebtors, isLoading: debtorsLoading } = useQuery({
    queryKey: ['group-debtors', debtorGroup?.id, reportMonth],
    queryFn: () => reportsApi.getGroupDebtors(debtorGroup!.id, reportMonth),
    enabled: !!debtorGroup,
  })

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

  //const { data: summary } = useQuery({
  //  queryKey: ['reports', 'summary', dateFrom, dateTo],
  //  queryFn: () => reportsApi.getIncomeExpense(dateFrom, dateTo),
  //  enabled: !!dateFrom && !!dateTo,
  //})


  const { data: monthlyReport, isLoading: monthlyLoading } = useQuery({
    queryKey: ['reports', 'monthly', reportMonth],
    queryFn: () => reportsApi.getMonthly(reportMonth),
    enabled: !!reportMonth,
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
          <h1 className="text-2xl font-bold text-slate-900">{t('reports.title', 'Reports')}</h1>
          <p className="text-muted-foreground">{t('reports.description', 'Financial reports and analytics')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="space-y-2">
          <Label>{t('common.from', 'From')}</Label>
          <DateInput
            value={dateFrom}
            onChange={setDateFrom}
            className="w-[140px]"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('common.to', 'To')}</Label>
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
            <CardTitle className="text-sm font-medium">{t('reports.card_income', 'Total Income')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(Number.isFinite(totalPayments) ? totalPayments : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {payments.length} {t('reports.payments_count', 'payments')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.card_expenses', 'Total Expenses')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(Number.isFinite(totalExpenses) ? totalExpenses : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {expenses.length} {t('reports.expenses_count', 'expenses')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.card_profit', 'Net Profit')}</CardTitle>
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
              {t('reports.margin', 'Margin')}: {Number(totalPayments) > 0 && Number.isFinite(netProfit) ? ((netProfit / totalPayments) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="overview">{t('reports.tab_overview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="monthly">{t('reports.tab_monthly', 'Monthly')}</TabsTrigger>
          <TabsTrigger value="payments">{t('reports.tab_payments', 'Payments')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('reports.tab_expenses', 'Expenses')}</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('reports.chart_expenses_by_cat', 'Expenses by Category')}</CardTitle>
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
                    {t('reports.no_expense_data', 'No expense data')}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('reports.chart_payment_methods', 'Payment Methods')}</CardTitle>
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
                    {t('reports.no_payment_data', 'No payment data')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label>{t('reports.select_month', 'Select Month')}</Label>
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
                    <CardTitle className="text-sm font-medium">{t('reports.monthly_expected', 'Expected')}</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(monthlyReport.totals.expected_amount)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('reports.from_students', 'From')} {monthlyReport.totals.student_count} {t('reports.students', 'students')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.monthly_collected', 'Collected')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(monthlyReport.totals.collected_amount)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {monthlyReport.totals.payment_percentage}% {t('reports.collection_rate', 'collection rate')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.teacher_portions', 'Teacher Portions')}</CardTitle>
                    <Users className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(monthlyReport.totals.teacher_portion)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('reports.teacher_portions_desc', 'For per-student salary teachers')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.center_portion', 'Center Portion')}</CardTitle>
                    <Building2 className="h-4 w-4 text-purple-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">
                      {formatCurrency(monthlyReport.totals.center_portion)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('reports.remaining', 'Remaining')}: {formatCurrency(monthlyReport.totals.remaining_debt)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Table */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('reports.group_report', 'Detailed Group Report')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('reports.col_group', 'Group')}</TableHead>
                          <TableHead>{t('reports.col_teacher', 'Teacher')}</TableHead>
                          <TableHead className="text-center">{t('reports.col_students', 'Students')}</TableHead>
                          <TableHead className="text-center">{t('reports.col_paid', 'Paid')}</TableHead>
                          <TableHead className="text-right">{t('reports.col_expected', 'Expected')}</TableHead>
                          <TableHead className="text-right">{t('reports.col_collected', 'Collected')}</TableHead>
                          <TableHead className="text-right">{t('reports.col_remaining', 'Remaining')}</TableHead>
                          <TableHead className="text-center">%</TableHead>
                          <TableHead className="text-right">{t('reports.col_teacher_portion', 'Teacher')}</TableHead>
                          <TableHead className="text-right">{t('reports.col_center', 'Center')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyReport.groups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                              {t('reports.no_groups', 'No groups found')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {monthlyReport.groups.map((group) => (
                              <TableRow key={group.group_id}>
                                <TableCell
                                  className="font-medium text-blue-600 hover:underline cursor-pointer"
                                  onClick={() => setDebtorGroup({ id: group.group_id, name: group.group_name })}
                                >
                                  {group.group_name}
                                </TableCell>
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
                              <TableCell>{t('reports.total_row', 'TOTAL')}</TableCell>
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
              {t('reports.select_month_prompt', 'Select a month to view report')}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('reports.payment_details', 'Payment Details')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reports.col_date', 'Date')}</TableHead>
                      <TableHead>{t('reports.col_student', 'Student')}</TableHead>
                      <TableHead>{t('reports.col_group', 'Group')}</TableHead>
                      <TableHead>{t('reports.col_method', 'Method')}</TableHead>
                      <TableHead className="text-right">{t('reports.col_amount', 'Amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {t('reports.no_payments', 'No payments in this period')}
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('reports.expense_details', 'Expense Details')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expensesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reports.col_date', 'Date')}</TableHead>
                      <TableHead>{t('reports.col_category', 'Category')}</TableHead>
                      <TableHead>{t('reports.col_description', 'Description')}</TableHead>
                      <TableHead className="text-right">{t('reports.col_amount', 'Amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          {t('reports.no_expenses', 'No expenses in this period')}
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Group Debtors Dialog */}
      <Dialog open={!!debtorGroup} onOpenChange={(open) => !open && setDebtorGroup(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{debtorGroup?.name} — {t('reports.student_debts', 'Student Debts')}</DialogTitle>
          </DialogHeader>
          {debtorsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !groupDebtors || groupDebtors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('reports.no_students', 'No students found')}</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">{t('reports.col_student', 'Student')}</TableHead>
                    <TableHead className="text-right min-w-[120px]">{t('reports.col_expected', 'Expected')}</TableHead>
                    <TableHead className="text-right min-w-[120px]">{t('reports.col_paid', 'Paid')}</TableHead>
                    <TableHead className="text-right min-w-[120px]">{t('reports.col_debt', 'Debt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupDebtors.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium whitespace-nowrap">{s.first_name} {s.last_name}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(s.expected)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-green-600">{formatCurrency(s.paid)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {s.debt > 0 ? (
                          <span className="font-semibold text-red-600">{formatCurrency(s.debt)}</span>
                        ) : (
                          <span className="text-green-600">{formatCurrency(0)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
