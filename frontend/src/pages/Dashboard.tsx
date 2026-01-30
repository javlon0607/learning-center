import { useQuery } from '@tanstack/react-query'
import { dashboardApi, DashboardStats } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import {
  Users,
  GraduationCap,
  UserCog,
  DollarSign,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your learning center
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Students"
          value={stats?.students ?? 0}
          icon={Users}
          trend="+12% from last month"
          trendUp
        />
        <StatsCard
          title="Active Groups"
          value={stats?.groups ?? 0}
          icon={GraduationCap}
          description="Currently running"
        />
        <StatsCard
          title="Teachers"
          value={stats?.teachers ?? 0}
          icon={UserCog}
          description="Active instructors"
        />
        <StatsCard
          title="Pending Leads"
          value={stats?.leads_pending ?? 0}
          icon={UserPlus}
          description="Awaiting follow-up"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.revenue ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              This month's total income
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats?.expenses ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              This month's total expenses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(stats?.profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats?.profit ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue minus expenses
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueChart />
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <a
              href="/students"
              className="flex items-center rounded-lg border p-3 transition-colors hover:bg-slate-50"
            >
              <Users className="mr-3 h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium">Add New Student</p>
                <p className="text-sm text-muted-foreground">Register a new student</p>
              </div>
            </a>
            <a
              href="/payments"
              className="flex items-center rounded-lg border p-3 transition-colors hover:bg-slate-50"
            >
              <DollarSign className="mr-3 h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Record Payment</p>
                <p className="text-sm text-muted-foreground">Add a new payment</p>
              </div>
            </a>
            <a
              href="/attendance"
              className="flex items-center rounded-lg border p-3 transition-colors hover:bg-slate-50"
            >
              <GraduationCap className="mr-3 h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium">Mark Attendance</p>
                <p className="text-sm text-muted-foreground">Take today's attendance</p>
              </div>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
