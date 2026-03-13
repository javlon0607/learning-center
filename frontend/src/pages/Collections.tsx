import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collectionsApi, CollectionDebtor, CollectionCall, CollectionGroupDebtor } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Search, Phone, PhoneCall, Users, DollarSign, Loader2, MessageSquare,
  ChevronUp, ChevronDown, ChevronsUpDown, ArrowLeft,
} from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { usePermissions } from '@/contexts/PermissionsContext'

type SortField = 'name' | 'phone' | 'groups' | 'expected' | 'paid' | 'debt' | 'last_call' | 'calls'
type SortDirection = 'asc' | 'desc'
type TabValue = 'students' | 'by-group'
type GroupSortField = 'name' | 'debtors' | 'total_debt'
type GroupDebtorSortField = 'name' | 'phone' | 'groups' | 'expected' | 'paid' | 'debt' | 'last_call' | 'calls'

export function Collections() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const { hasFeature } = usePermissions()
  const hasDashboard = hasFeature('dashboard')

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('debt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [detailStudent, setDetailStudent] = useState<CollectionDebtor | CollectionGroupDebtor | null>(null)
  const [callDialogOpen, setCallDialogOpen] = useState(false)
  const [callStudent, setCallStudent] = useState<CollectionDebtor | null>(null)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [activeTab, setActiveTab] = useState<TabValue>('students')
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  // For logging calls from By Group tab
  const [groupCallStudent, setGroupCallStudent] = useState<CollectionGroupDebtor | null>(null)
  const [groupSortField, setGroupSortField] = useState<GroupSortField>('total_debt')
  const [groupSortDir, setGroupSortDir] = useState<SortDirection>('desc')
  const [gdSortField, setGdSortField] = useState<GroupDebtorSortField>('debt')
  const [gdSortDir, setGdSortDir] = useState<SortDirection>('desc')

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  }, [month])

  // Queries
  const { data: debtors = [], isLoading } = useQuery({
    queryKey: ['collections', month],
    queryFn: () => collectionsApi.getDebtors(month),
  })

  const { data: stats } = useQuery({
    queryKey: ['collection-stats'],
    queryFn: collectionsApi.getStats,
  })

  const { data: callHistory = [] } = useQuery({
    queryKey: ['collection-calls', detailStudent?.id],
    queryFn: () => collectionsApi.getCallHistory(detailStudent!.id),
    enabled: !!detailStudent,
  })

  const { data: studentPayments = [] } = useQuery({
    queryKey: ['collection-student-history', detailStudent?.id, month],
    queryFn: () => collectionsApi.getStudentHistory(detailStudent!.id, month),
    enabled: !!detailStudent,
  })

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['collection-groups', month],
    queryFn: () => collectionsApi.getGroups(month),
    enabled: activeTab === 'by-group',
  })

  const { data: groupDebtors = [], isLoading: groupDebtorsLoading } = useQuery({
    queryKey: ['collection-group-debtors', selectedGroupId, month],
    queryFn: () => collectionsApi.getGroupDebtors(selectedGroupId!, month),
    enabled: !!selectedGroupId,
  })

  const addCallMutation = useMutation({
    mutationFn: ({ studentId, notes }: { studentId: number; notes: string }) =>
      collectionsApi.addCall(studentId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['collection-calls'] })
      queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
      queryClient.invalidateQueries({ queryKey: ['collection-group-debtors'] })
      toast({ title: t('collections.toast_logged', 'Call logged successfully') })
      setCallDialogOpen(false)
    },
    onError: () => {
      toast({ title: t('collections.toast_log_error', 'Failed to log call'), variant: 'destructive' })
    },
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return debtors
    const s = search.toLowerCase()
    return debtors.filter(d =>
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(s) ||
      d.phone?.toLowerCase().includes(s) ||
      d.parent_phone?.toLowerCase().includes(s)
    )
  }, [debtors, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
          break
        case 'phone':
          cmp = (a.phone || '').localeCompare(b.phone || '')
          break
        case 'groups':
          cmp = (a.enrollments.map(e => e.group_name).join(', ')).localeCompare(b.enrollments.map(e => e.group_name).join(', '))
          break
        case 'expected':
          cmp = a.expected - b.expected
          break
        case 'paid':
          cmp = a.paid - b.paid
          break
        case 'debt':
          cmp = a.debt - b.debt
          break
        case 'last_call':
          cmp = (a.last_call_date || '').localeCompare(b.last_call_date || '')
          break
        case 'calls':
          cmp = a.call_count - b.call_count
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortField, sortDirection])

  const totalDebt = useMemo(() => debtors.reduce((sum, d) => sum + d.debt, 0), [debtors])
  const totalCalls = useMemo(() => debtors.reduce((sum, d) => sum + d.call_count, 0), [debtors])

  const sortedGroups = useMemo(() => {
    const arr = [...groups]
    arr.sort((a, b) => {
      let cmp = 0
      switch (groupSortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'debtors': cmp = a.debtor_count - b.debtor_count; break
        case 'total_debt': cmp = a.total_debt - b.total_debt; break
      }
      return groupSortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [groups, groupSortField, groupSortDir])

  const sortedGroupDebtors = useMemo(() => {
    const arr = groupDebtors.filter(d => d.debt > 0)
    arr.sort((a, b) => {
      let cmp = 0
      switch (gdSortField) {
        case 'name': cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`); break
        case 'phone': cmp = (a.phone || '').localeCompare(b.phone || ''); break
        case 'groups': cmp = (a.enrollments.map(e => e.group_name).join(', ')).localeCompare(b.enrollments.map(e => e.group_name).join(', ')); break
        case 'expected': cmp = a.expected - b.expected; break
        case 'paid': cmp = a.paid - b.paid; break
        case 'debt': cmp = a.debt - b.debt; break
        case 'last_call': cmp = (a.last_call_date || '').localeCompare(b.last_call_date || ''); break
        case 'calls': cmp = a.call_count - b.call_count; break
      }
      return gdSortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [groupDebtors, gdSortField, gdSortDir])

  function handleLogCall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const studentId = callStudent?.id ?? groupCallStudent?.id
    if (!studentId) return
    const formData = new FormData(e.currentTarget)
    const notes = (formData.get('notes') as string)?.trim()
    if (!notes) return
    addCallMutation.mutate({ studentId, notes })
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function SortableHeader({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) {
    const isActive = sortField === field
    return (
      <th
        className={cn("p-3 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors", className)}
        onClick={() => handleSort(field)}
      >
        <div className={cn("flex items-center gap-1", className?.includes('text-right') && 'justify-end', className?.includes('text-center') && 'justify-center')}>
          {children}
          {isActive ? (
            sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      </th>
    )
  }

  function handleGroupSort(field: GroupSortField) {
    if (groupSortField === field) setGroupSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setGroupSortField(field); setGroupSortDir('asc') }
  }

  function handleGdSort(field: GroupDebtorSortField) {
    if (gdSortField === field) setGdSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setGdSortField(field); setGdSortDir('asc') }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: SortDirection }) {
    if (active) return dir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
    return <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />
  }

  function openCallDialog(student: CollectionDebtor | CollectionGroupDebtor) {
    if ('parent_phone' in student) {
      setCallStudent(student as CollectionDebtor)
      setGroupCallStudent(null)
    } else {
      setGroupCallStudent(student as CollectionGroupDebtor)
      setCallStudent(null)
    }
    setCallDialogOpen(true)
  }

  const callDialogStudentName = callStudent
    ? `${callStudent.first_name} ${callStudent.last_name}`
    : groupCallStudent
      ? `${groupCallStudent.first_name} ${groupCallStudent.last_name}`
      : ''

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('collections.title', 'Collections')}</h1>
        <p className="text-muted-foreground">{t('collections.description', 'Students with outstanding debt')} {t('col.for_month', 'for')} {monthLabel}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 dark:bg-red-900/20 p-2">
                <Users className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('collections.stat_debtors', 'Students with Debt')}</p>
                <p className="text-2xl font-bold">{debtors.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/20 p-2">
                <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('collections.stat_total', 'Total Outstanding')}</p>
                <p className="text-2xl font-bold">{hasDashboard ? formatCurrency(totalDebt) : '***'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900/20 p-2">
                <PhoneCall className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('collections.stat_calls', 'Calls Made')}</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl font-bold">{totalCalls}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{t('col.calls_today', 'Today')}: <span className="font-semibold text-foreground">{stats?.calls_today ?? 0}</span></span>
                    <span>•</span>
                    <span>{t('col.calls_this_month', 'Month')}: <span className="font-semibold text-foreground">{stats?.calls_this_month ?? 0}</span></span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Month selector + Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-3 items-center">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('collections.search', 'Search by name or phone...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex rounded-lg border bg-muted/50 p-1">
          <button
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === 'students' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => { setActiveTab('students'); setSelectedGroupId(null) }}
          >
            {t('col.tab_students', 'Students')}
          </button>
          <button
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === 'by-group' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('by-group')}
          >
            {t('col.tab_by_group', 'By Group')}
          </button>
        </div>
      </div>

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <SortableHeader field="name" className="text-left">{t('collections.col_student', 'Student')}</SortableHeader>
                <SortableHeader field="phone" className="text-left">{t('collections.col_phone', 'Phone')}</SortableHeader>
                <SortableHeader field="groups" className="text-left">{t('collections.col_groups', 'Groups')}</SortableHeader>
                <SortableHeader field="expected" className="text-right">{t('collections.col_expected', 'Expected')}</SortableHeader>
                <SortableHeader field="paid" className="text-right">{t('collections.col_paid', 'Paid')}</SortableHeader>
                <SortableHeader field="debt" className="text-right">{t('collections.col_debt', 'Debt')}</SortableHeader>
                <SortableHeader field="last_call" className="text-left">{t('collections.col_last_call', 'Last Call')}</SortableHeader>
                <SortableHeader field="calls" className="text-center">{t('collections.col_calls', 'Calls')}</SortableHeader>
                <th className="text-right p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {search ? t('collections.no_match', 'No matching students found.') : t('collections.no_debtors', 'No students with outstanding debt this month.')}
                  </td>
                </tr>
              ) : (
                sorted.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => setDetailStudent(d)}
                  >
                    <td className="p-3">
                      <div className="font-medium">{d.first_name} {d.last_name}</div>
                      {d.parent_name && (
                        <div className="text-xs text-muted-foreground">{d.parent_name}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="space-y-0.5">
                        {d.phone && (
                          <a
                            href={`tel:${d.phone}`}
                            className="text-primary hover:underline block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {d.phone}
                          </a>
                        )}
                        {d.parent_phone && d.parent_phone !== d.phone && (
                          <a
                            href={`tel:${d.parent_phone}`}
                            className="text-primary hover:underline block text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {d.parent_phone} <span className="text-muted-foreground">({t('collections.detail_parent', 'Parent')})</span>
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {d.enrollments.map((e) => (
                          <Badge key={e.group_id} variant="outline" className="text-xs">
                            {e.group_name}
                            {e.monthly_discount > 0 && <span className="ml-1 text-orange-500">*</span>}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right">{formatCurrency(d.expected)}</td>
                    <td className="p-3 text-right">{formatCurrency(d.paid)}</td>
                    <td className="p-3 text-right font-semibold text-red-600">{formatCurrency(d.debt)}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {d.last_call_date ? formatDate(d.last_call_date) : '—'}
                    </td>
                    <td className="p-3 text-center">
                      {d.call_count > 0 ? (
                        <Badge variant="secondary">{d.call_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          openCallDialog(d)
                        }}
                      >
                        <PhoneCall className="h-4 w-4 mr-1" />{t('collections.log_call', 'Log Call')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* By Group Tab */}
      {activeTab === 'by-group' && !selectedGroupId && (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto shadow-soft">
          {groupsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('collections.no_debtors', 'No students with outstanding debt this month.')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 font-medium text-left cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGroupSort('name')}>
                    <div className="flex items-center gap-1">{t('col.group_name', 'Group')} <SortIcon active={groupSortField === 'name'} dir={groupSortDir} /></div>
                  </th>
                  <th className="p-3 font-medium text-right cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGroupSort('debtors')}>
                    <div className="flex items-center gap-1 justify-end">{t('col.debtor_count', 'Debtors')} <SortIcon active={groupSortField === 'debtors'} dir={groupSortDir} /></div>
                  </th>
                  <th className="p-3 font-medium text-right cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGroupSort('total_debt')}>
                    <div className="flex items-center gap-1 justify-end">{t('col.total_debt', 'Total Debt')} <SortIcon active={groupSortField === 'total_debt'} dir={groupSortDir} /></div>
                  </th>
                  <th className="p-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {sortedGroups.map((g) => (
                  <tr key={g.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedGroupId(g.id)}>
                    <td className="p-3 font-medium">{g.name}</td>
                    <td className="p-3 text-right">
                      <Badge variant="secondary">{g.debtor_count} / {g.total_students}</Badge>
                    </td>
                    <td className="p-3 text-right font-semibold text-red-600">{hasDashboard ? formatCurrency(g.total_debt) : '***'}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedGroupId(g.id) }}>
                        {t('col.view_debtors', 'View Debtors')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* By Group Tab - Group Debtors Detail */}
      {activeTab === 'by-group' && selectedGroupId && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedGroupId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t('col.back_to_groups', 'Back to groups')}
          </Button>
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto shadow-soft">
            {groupDebtorsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedGroupDebtors.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t('collections.no_debtors', 'No students with outstanding debt this month.')}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 font-medium text-left cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('name')}>
                      <div className="flex items-center gap-1">{t('collections.col_student', 'Student')} <SortIcon active={gdSortField === 'name'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-left cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('phone')}>
                      <div className="flex items-center gap-1">{t('collections.col_phone', 'Phone')} <SortIcon active={gdSortField === 'phone'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-left cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('groups')}>
                      <div className="flex items-center gap-1">{t('collections.col_groups', 'Groups')} <SortIcon active={gdSortField === 'groups'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-right cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('expected')}>
                      <div className="flex items-center gap-1 justify-end">{t('collections.col_expected', 'Expected')} <SortIcon active={gdSortField === 'expected'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-right cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('paid')}>
                      <div className="flex items-center gap-1 justify-end">{t('collections.col_paid', 'Paid')} <SortIcon active={gdSortField === 'paid'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-right cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('debt')}>
                      <div className="flex items-center gap-1 justify-end">{t('collections.col_debt', 'Debt')} <SortIcon active={gdSortField === 'debt'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-left cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('last_call')}>
                      <div className="flex items-center gap-1">{t('collections.col_last_call', 'Last Call')} <SortIcon active={gdSortField === 'last_call'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-center cursor-pointer select-none hover:bg-muted/70 transition-colors" onClick={() => handleGdSort('calls')}>
                      <div className="flex items-center gap-1 justify-center">{t('collections.col_calls', 'Calls')} <SortIcon active={gdSortField === 'calls'} dir={gdSortDir} /></div>
                    </th>
                    <th className="p-3 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroupDebtors.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setDetailStudent(d)}>
                      <td className="p-3">
                        <div className="font-medium">{d.first_name} {d.last_name}</div>
                        {d.parent_name && (
                          <div className="text-xs text-muted-foreground">{d.parent_name}</div>
                        )}
                        {d.monthly_discount > 0 && (
                          <Badge variant="outline" className="mt-1 text-xs text-orange-500 border-orange-300">
                            {t('col.monthly_discount', 'Monthly Discount')}: {formatCurrency(d.monthly_discount)}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          {d.phone && (
                            <a href={`tel:${d.phone}`} className="text-primary hover:underline block">{d.phone}</a>
                          )}
                          {d.parent_phone && d.parent_phone !== d.phone && (
                            <a href={`tel:${d.parent_phone}`} className="text-primary hover:underline block text-xs">
                              {d.parent_phone} <span className="text-muted-foreground">({t('collections.detail_parent', 'Parent')})</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {d.enrollments.map((e) => (
                            <Badge key={e.group_id} variant="outline" className="text-xs">
                              {e.group_name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right">{formatCurrency(d.expected)}</td>
                      <td className="p-3 text-right">{formatCurrency(d.paid)}</td>
                      <td className="p-3 text-right font-semibold text-red-600">{formatCurrency(d.debt)}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {d.last_call_date ? formatDate(d.last_call_date) : '—'}
                      </td>
                      <td className="p-3 text-center">
                        {d.call_count > 0 ? (
                          <Badge variant="secondary">{d.call_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openCallDialog(d) }}
                        >
                          <PhoneCall className="h-4 w-4 mr-1" />{t('collections.log_call', 'Log Call')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      {detailStudent && (
        <Sheet open={!!detailStudent} onOpenChange={(open) => !open && setDetailStudent(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto" preventAutoFocus>
            <SheetHeader>
              <SheetTitle>{detailStudent.first_name} {detailStudent.last_name}</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Debt summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('collections.detail_expected', 'Expected')}</p>
                  <p className="text-lg font-bold">{formatCurrency(detailStudent.expected)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('collections.detail_paid', 'Paid')}</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(detailStudent.paid)}</p>
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{t('collections.detail_debt', 'Debt')}</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(detailStudent.debt)}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{t('collections.detail_contact', 'Contact')}</h4>
                {detailStudent.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${detailStudent.phone}`} className="text-primary hover:underline">{detailStudent.phone}</a>
                  </div>
                )}
                {(detailStudent.parent_name || detailStudent.parent_phone) && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      {detailStudent.parent_phone ? (
                        <a href={`tel:${detailStudent.parent_phone}`} className="text-primary hover:underline">{detailStudent.parent_phone}</a>
                      ) : null}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({t('collections.detail_parent', 'Parent')}{detailStudent.parent_name ? `: ${detailStudent.parent_name}` : ''})
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Groups with monthly discount */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{t('collections.detail_groups', 'Groups')}</h4>
                <div className="space-y-2">
                  {detailStudent.enrollments.map((e) => (
                    <div key={e.group_id} className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">
                        {e.group_name}
                        {'price' in e && <> — {formatCurrency(e.price)}</>}
                        {'discount' in e && (e as { discount: number }).discount > 0 && ` (${(e as { discount: number }).discount}% off)`}
                      </Badge>
                      {'monthly_discount' in e && (e as { monthly_discount: number }).monthly_discount > 0 && (
                        <Badge variant="outline" className="text-orange-500 border-orange-300 text-xs">
                          {t('col.monthly_discount', 'Monthly Discount')}: {formatCurrency((e as { monthly_discount: number }).monthly_discount)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Log call button */}
              <Button
                className="w-full"
                onClick={() => openCallDialog(detailStudent)}
              >
                <PhoneCall className="h-4 w-4 mr-2" />{t('collections.btn_log_call', 'Log New Call')}
              </Button>

              {/* Payment history for this month */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{t('col.payment_history', 'Payment History')}</h4>
                {studentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('col.no_payments', 'No payments this month')}</p>
                ) : (
                  <div className="space-y-2">
                    {studentPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-900/20">
                        <div>
                          <p className="text-sm font-medium">{formatCurrency(p.month_amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(p.payment_date)} {p.group_name && `• ${p.group_name}`}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">{p.method}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Call history */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{t('collections.detail_call_history', 'Call History')}</h4>
                {callHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('collections.no_calls', 'No calls recorded yet.')}</p>
                ) : (
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-2 pr-4">
                      {callHistory.map((call: CollectionCall) => (
                        <div key={call.id} className="flex gap-3 p-2 rounded bg-muted/30">
                          <div className="shrink-0 mt-0.5">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDateTime(call.created_at)}</span>
                              {call.created_by_name && (
                                <>
                                  <span>•</span>
                                  <span>{call.created_by_name}</span>
                                </>
                              )}
                            </div>
                            <p className="text-sm mt-1">{call.notes}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Log Call Dialog */}
      <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('collections.dialog_log_call', 'Log Call')} — {callDialogStudentName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogCall}>
            <div className="py-4">
              <Textarea
                name="notes"
                rows={4}
                placeholder={t('collections.call_notes_placeholder', 'What was discussed during the call?')}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCallDialogOpen(false)}>
                {t('common.btn_cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={addCallMutation.isPending}>
                {addCallMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.btn_save', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
