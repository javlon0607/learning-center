import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import {
  Users,
  GraduationCap,
  UserCog,
  DollarSign,
  TrendingUp,
  TrendingDown,
  UserPlus,
  ArrowRight,
  Calendar,
  Sparkles,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

export function Dashboard() {
  const { user } = useAuth()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const profit = stats?.profit ?? 0
  const isProfit = profit >= 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Welcome back, {user?.name?.split(' ')[0]}
            <Sparkles className="h-5 w-5 text-gold-500" />
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening at Legacy Academy today
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Students"
          value={stats?.students ?? 0}
          icon={Users}
          trend="+12%"
          trendUp
          iconColor="primary"
        />
        <StatsCard
          title="Active Groups"
          value={stats?.groups ?? 0}
          icon={GraduationCap}
          description="Currently running"
          iconColor="info"
        />
        <StatsCard
          title="Teachers"
          value={stats?.teachers ?? 0}
          icon={UserCog}
          description="Active instructors"
          iconColor="success"
        />
        <StatsCard
          title="Pending Leads"
          value={stats?.leads_pending ?? 0}
          icon={UserPlus}
          description="Awaiting follow-up"
          iconColor="warning"
        />
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/60 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
            <div className="p-2 rounded-lg bg-green-100">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats?.revenue ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total income this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Expenses</CardTitle>
            <div className="p-2 rounded-lg bg-red-100">
              <DollarSign className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats?.expenses ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total expenses this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <div className={`p-2 rounded-lg ${isProfit ? 'bg-green-100' : 'bg-red-100'}`}>
              {isProfit ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(profit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Revenue minus expenses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RevenueChart />
        </div>
        <Card className="lg:col-span-2 border-border/60 shadow-soft">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Link
              to="/students"
              className="group flex items-center justify-between rounded-xl border border-border/60 p-4 transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-navy-100 text-navy-600 group-hover:bg-navy-600 group-hover:text-white transition-colors">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Add New Student</p>
                  <p className="text-sm text-muted-foreground">Register a new student</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              to="/payments"
              className="group flex items-center justify-between rounded-xl border border-border/60 p-4 transition-all hover:border-green-300 hover:bg-green-50 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-green-100 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Record Payment</p>
                  <p className="text-sm text-muted-foreground">Add a new payment</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-green-600 transition-colors" />
            </Link>

            <Link
              to="/attendance"
              className="group flex items-center justify-between rounded-xl border border-border/60 p-4 transition-all hover:border-purple-300 hover:bg-purple-50 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Mark Attendance</p>
                  <p className="text-sm text-muted-foreground">Take today's attendance</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-600 transition-colors" />
            </Link>

            <Link
              to="/leads"
              className="group flex items-center justify-between rounded-xl border border-border/60 p-4 transition-all hover:border-amber-300 hover:bg-amber-50 hover:shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-amber-100 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Manage Leads</p>
                  <p className="text-sm text-muted-foreground">Follow up with prospects</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-amber-600 transition-colors" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
