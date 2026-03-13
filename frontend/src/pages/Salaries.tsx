import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { salaryRecordsApi, SalaryRecord } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, CheckCircle2, RefreshCw, DollarSign } from 'lucide-react'
import { useTranslation } from '@/contexts/I18nContext'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const DEPT_LABEL: Record<string, string> = {
  management: 'Management',
  academic: 'Academic Staff',
  student_support: 'Student Support',
  operations: 'Operations & Finance',
  marketing: 'Marketing & Media',
  technical: 'Technical & Support',
}

function getCurrentMonth() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -4; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    opts.push({ value, label })
  }
  return opts.reverse()
}

interface EditState {
  bonus: string
  deduction: string
  bonus_note: string
  deduction_note: string
}

export function Salaries() {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const monthOptions = useMemo(getMonthOptions, [])

  const [month, setMonth] = useState(getCurrentMonth())
  const [edits, setEdits] = useState<Record<number, EditState>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['salary-records', month],
    queryFn: () => salaryRecordsApi.getByMonth(month),
  })

  const generateMutation = useMutation({
    mutationFn: () => salaryRecordsApi.generate(month),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['salary-records', month] })
      toast({ title: `${res.generated} salary records generated` })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => salaryRecordsApi.markPaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-records', month] })
      queryClient.invalidateQueries({ queryKey: ['salary-records-summary'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const markAllPaidMutation = useMutation({
    mutationFn: () => salaryRecordsApi.markAllPaid(month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-records', month] })
      queryClient.invalidateQueries({ queryKey: ['salary-records-summary'] })
      toast({ title: t('salaries.mark_all_paid', 'All marked as paid') })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, bonus, deduction, bonus_note, deduction_note }: {
      id: number; bonus: number; deduction: number; bonus_note?: string; deduction_note?: string
    }) => salaryRecordsApi.update(id, { bonus, deduction, bonus_note, deduction_note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-records', month] })
      setSavingId(null)
    },
    onError: (e: Error) => { toast({ title: e.message, variant: 'destructive' }); setSavingId(null) },
  })

  function getEdit(rec: SalaryRecord): EditState {
    return edits[rec.id] ?? {
      bonus: String(rec.bonus),
      deduction: String(rec.deduction),
      bonus_note: rec.bonus_note ?? '',
      deduction_note: rec.deduction_note ?? '',
    }
  }

  function setEdit(id: number, field: keyof EditState, val: string) {
    setEdits(e => ({ ...e, [id]: { ...getEdit(records.find(r => r.id === id)!), ...e[id], [field]: val } }))
  }

  function saveEdit(rec: SalaryRecord) {
    const edit = edits[rec.id]
    if (!edit) return
    setSavingId(rec.id)
    updateMutation.mutate({
      id: rec.id,
      bonus: parseFloat(edit.bonus) || 0,
      deduction: parseFloat(edit.deduction) || 0,
      bonus_note: edit.bonus_note || undefined,
      deduction_note: edit.deduction_note || undefined,
    })
    setEdits(e => { const n = { ...e }; delete n[rec.id]; return n })
  }

  const grouped = useMemo(() => {
    const map: Record<string, SalaryRecord[]> = {}
    for (const r of records) {
      if (!map[r.department]) map[r.department] = []
      map[r.department].push(r)
    }
    return map
  }, [records])

  const totalNet = records.reduce((s, r) => s + r.net_amount, 0)
  const totalUnpaid = records.filter(r => !r.paid).reduce((s, r) => s + r.net_amount, 0)
  const unpaidCount = records.filter(r => !r.paid).length

  const deptOrder = ['management', 'academic', 'student_support', 'operations', 'marketing', 'technical']

  function liveNet(rec: SalaryRecord) {
    const e = edits[rec.id]
    if (!e) return rec.net_amount
    return rec.base_amount + (parseFloat(e.bonus) || 0) - (parseFloat(e.deduction) || 0)
  }

  function isDirty(rec: SalaryRecord) {
    const e = edits[rec.id]
    if (!e) return false
    return (parseFloat(e.bonus) || 0) !== rec.bonus ||
      (parseFloat(e.deduction) || 0) !== rec.deduction ||
      (e.bonus_note ?? '') !== (rec.bonus_note ?? '') ||
      (e.deduction_note ?? '') !== (rec.deduction_note ?? '')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('salaries.title', 'Salaries')}</h1>
          <p className="text-muted-foreground">{t('salaries.description', 'Monthly salary calculation and payment tracking')}</p>
        </div>
      </div>

      {/* Month selector + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button
          variant="outline"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('salaries.generating', 'Generating...')}</>
            : <><RefreshCw className="mr-2 h-4 w-4" />{t('salaries.generate', 'Generate for this month')}</>
          }
        </Button>
        {unpaidCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllPaidMutation.mutate()}
            disabled={markAllPaidMutation.isPending}
            className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            {markAllPaidMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <CheckCircle2 className="mr-2 h-4 w-4" />
            }
            {t('salaries.mark_all_paid', 'Mark All as Paid')}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Net</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xl font-bold">{formatCurrency(totalNet)}</p>
              <p className="text-xs text-muted-foreground">{records.length} employees</p>
            </CardContent>
          </Card>
          <Card className={cn(totalUnpaid > 0 ? 'border-orange-200' : 'border-green-200')}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {totalUnpaid > 0 ? 'Unpaid' : 'All Paid'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={cn("text-xl font-bold", totalUnpaid > 0 ? 'text-orange-600' : 'text-green-600')}>
                {totalUnpaid > 0 ? formatCurrency(totalUnpaid) : '✓ Done'}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalUnpaid > 0 ? `${unpaidCount} employees` : 'All salaries paid'}
              </p>
            </CardContent>
          </Card>
          <Card className="hidden md:block">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalNet - totalUnpaid)}</p>
              <p className="text-xs text-muted-foreground">{records.length - unpaidCount} employees</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground space-y-2">
          <DollarSign className="h-8 w-8 mx-auto opacity-30" />
          <p>{t('salaries.no_records', 'No salary records. Click Generate to create them.')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {deptOrder.filter(d => grouped[d]).map(dept => (
            <div key={dept}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-foreground">{DEPT_LABEL[dept] ?? dept}</span>
                <span className="text-xs text-muted-foreground">{grouped[dept].length} employees</span>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">{t('salaries.col_employee', 'Employee')}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">{t('salaries.col_base', 'Base')}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{t('salaries.col_bonus', 'Bonus')}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{t('salaries.col_deduction', 'Deduction')}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">{t('salaries.col_net', 'Net')}</th>
                      <th className="px-3 py-2.5 w-32 text-center font-medium text-muted-foreground">{t('salaries.col_status', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grouped[dept].map(rec => {
                      const edit = edits[rec.id]
                      const dirty = isDirty(rec)
                      return (
                        <tr key={rec.id} className={cn("hover:bg-muted/20 transition-colors", rec.paid && "opacity-70")}>
                          <td className="px-3 py-3">
                            <div className="font-medium">{rec.full_name}</div>
                            <div className="text-xs text-muted-foreground">{rec.position}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {formatCurrency(rec.base_amount)}
                          </td>
                          {/* Bonus */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                disabled={rec.paid}
                                value={edit?.bonus ?? String(rec.bonus)}
                                onChange={e => setEdit(rec.id, 'bonus', e.target.value)}
                                className="h-7 w-28 text-right text-xs tabular-nums text-green-700 dark:text-green-400"
                              />
                              <Input
                                disabled={rec.paid}
                                value={edit?.bonus_note ?? rec.bonus_note ?? ''}
                                onChange={e => setEdit(rec.id, 'bonus_note', e.target.value)}
                                className="h-6 w-28 text-xs"
                                placeholder="note"
                              />
                            </div>
                          </td>
                          {/* Deduction */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                disabled={rec.paid}
                                value={edit?.deduction ?? String(rec.deduction)}
                                onChange={e => setEdit(rec.id, 'deduction', e.target.value)}
                                className="h-7 w-28 text-right text-xs tabular-nums text-red-700 dark:text-red-400"
                              />
                              <Input
                                disabled={rec.paid}
                                value={edit?.deduction_note ?? rec.deduction_note ?? ''}
                                onChange={e => setEdit(rec.id, 'deduction_note', e.target.value)}
                                className="h-6 w-28 text-xs"
                                placeholder="note"
                              />
                            </div>
                          </td>
                          {/* Net */}
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(liveNet(rec))}
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-center gap-1.5">
                              {rec.paid ? (
                                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-0 text-xs">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />{t('salaries.paid', 'Paid')}
                                </Badge>
                              ) : (
                                <>
                                  {dirty && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs w-full"
                                      onClick={() => saveEdit(rec)}
                                      disabled={savingId === rec.id}
                                    >
                                      {savingId === rec.id
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : t('common.save', 'Save')
                                      }
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs w-full bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => markPaidMutation.mutate(rec.id)}
                                    disabled={markPaidMutation.isPending || dirty}
                                  >
                                    {markPaidMutation.isPending
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : t('salaries.mark_paid', 'Mark Paid')
                                    }
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
