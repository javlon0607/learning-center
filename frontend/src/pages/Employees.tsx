import { useState, useMemo } from 'react'
import { useAmountInput } from '@/hooks/useAmountInput'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employeesApi, Employee } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Loader2, Phone, Lock, Search } from 'lucide-react'
import { useTranslation } from '@/contexts/I18nContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PhoneInput } from '@/components/ui/phone-input'
import { DateInput } from '@/components/ui/date-input'

const DEPARTMENTS = [
  { value: 'management', positions: ['Director', 'Academic Director', 'Center Manager', 'Administrator'] },
  { value: 'academic', positions: ['English Teacher', 'Senior Teacher', 'IELTS Instructor', 'Teaching Assistant'] },
  { value: 'student_support', positions: ['Receptionist', 'Student Coordinator', 'Academic Coordinator'] },
  { value: 'operations', positions: ['Accountant', 'Office Manager', 'HR Manager'] },
  { value: 'marketing', positions: ['Marketing Manager', 'SMM Specialist', 'Content Creator'] },
  { value: 'technical', positions: ['IT Specialist', 'Cleaner', 'Janitor', 'Security Guard'] },
]

const DEPT_LABEL_FALLBACK: Record<string, string> = {
  management: 'Management',
  academic: 'Academic Staff',
  student_support: 'Student Support',
  operations: 'Operations & Finance',
  marketing: 'Marketing & Media',
  technical: 'Technical & Support',
}

const DEPT_COLOR: Record<string, string> = {
  management: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  academic: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  student_support: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  operations: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  marketing: 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300',
  technical: 'bg-muted text-muted-foreground',
}

const STATUSES = ['active', 'inactive', 'fired'] as const

const emptyForm = (): Partial<Employee> => ({
  full_name: '', department: '', position: '', phone: '',
  hire_date: '', birthday: '', base_salary: 0, status: 'active', notes: '',
})

export function Employees() {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const deptLabel = (val: string) => t(`employees.dept_${val}`, DEPT_LABEL_FALLBACK[val] ?? val)

  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>(emptyForm())
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const salaryInput = useAmountInput()

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.getAll(),
  })

  const filtered = useMemo(() => {
    let list = employees
    if (deptFilter !== 'all') list = list.filter(e => e.department === deptFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        (e.phone?.includes(q) ?? false)
      )
    }
    return list
  }, [employees, deptFilter, search])

  const grouped = useMemo(() => {
    const map: Record<string, Employee[]> = {}
    for (const e of filtered) {
      if (!map[e.department]) map[e.department] = []
      map[e.department].push(e)
    }
    return map
  }, [filtered])

  const availablePositions = useMemo(() =>
    DEPARTMENTS.find(d => d.value === form.department)?.positions ?? [],
    [form.department]
  )

  const saveMutation = useMutation<{ id: number } | { ok: boolean }>({
    mutationFn: () => {
      const data = { ...form, base_salary: salaryInput.numericValue() }
      return editing ? employeesApi.update(editing.id, data) : employeesApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setDialogOpen(false)
      toast({ title: editing ? t('employees.toast_updated', 'Employee updated') : t('employees.toast_added', 'Employee added') })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => employeesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setDeleteId(null)
      toast({ title: t('employees.toast_deleted', 'Employee deleted') })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    salaryInput.reset()
    setDialogOpen(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      full_name: emp.full_name,
      department: emp.department,
      position: emp.position,
      phone: emp.phone ?? '',
      hire_date: emp.hire_date ?? '',
      birthday: emp.birthday ?? '',
      status: emp.status,
      notes: emp.notes ?? '',
    })
    salaryInput.setFromNumber(emp.base_salary)
    setDialogOpen(true)
  }

  function setField(key: keyof Employee, val: unknown) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const statusBadge = (s: string) => {
    if (s === 'active') return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-0">{t('employees.status_active', 'Active')}</Badge>
    if (s === 'fired') return <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-0">{t('employees.status_fired', 'Fired')}</Badge>
    return <Badge variant="secondary">{t('employees.status_inactive', 'Inactive')}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('employees.title', 'Employees')}</h1>
          <p className="text-muted-foreground">{t('employees.description', 'Manage staff and their salaries')}</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('employees.add', 'Add Employee')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search', 'Search') + '...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('employees.filter_all', 'All Departments')}</SelectItem>
            {DEPARTMENTS.map(d => (
              <SelectItem key={d.value} value={d.value}>{deptLabel(d.value)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span><strong className="text-foreground">{employees.filter(e => e.status === 'active').length}</strong> {t('employees.stats_active', 'active')}</span>
        <span><strong className="text-foreground">{employees.length}</strong> {t('employees.stats_total', 'total')}</span>
        <span>
          <strong className="text-foreground">
            {formatCurrency(employees.filter(e => e.status === 'active').reduce((s, e) => s + e.base_salary, 0))}
          </strong> {t('employees.stats_payroll', 'monthly payroll')}
        </span>
      </div>

      {/* Employee list by department */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('common.loading', 'Loading...')}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          {search || deptFilter !== 'all' ? t('employees.empty_filter', 'No employees match the filter.') : t('employees.empty', 'No employees yet. Add the first one!')}
        </div>
      ) : (
        <div className="space-y-6">
          {DEPARTMENTS.filter(d => grouped[d.value]).map(dept => (
            <div key={dept.value}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${DEPT_COLOR[dept.value]}`}>
                  {deptLabel(dept.value)}
                </span>
                <span className="text-xs text-muted-foreground">{t('employees.count', '{n} employees').replace('{n}', String(grouped[dept.value].length))}</span>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('employees.col_name', 'Name')}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{t('employees.col_position', 'Position')}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">{t('employees.col_phone', 'Phone')}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t('employees.col_base_salary', 'Base Salary')}</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">{t('employees.col_status', 'Status')}</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grouped[dept.value].map(emp => (
                      <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{emp.full_name}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">{emp.position}</div>
                          {emp.birthday && (
                            <div className="text-xs text-muted-foreground">
                              🎂 {formatDate(emp.birthday)}
                            </div>
                          )}
                          {emp.group_count ? (
                            <div className="text-xs text-blue-600">{emp.group_count} groups</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{emp.position}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {emp.phone
                            ? <a href={`tel:${emp.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                                <Phone className="h-3 w-3" />{emp.phone}
                              </a>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCurrency(emp.base_salary)}
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {statusBadge(emp.status)}
                        </td>
                        <td className="px-4 py-3">
                          {emp.teacher_id ? (
                            <div className="flex items-center justify-end pr-1" title={t('employees.tooltip_teacher', 'Managed in Teachers page')}>
                              <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(emp)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(emp.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('employees.edit', 'Edit Employee') : t('employees.add', 'Add Employee')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>{t('employees.form_full_name', 'Full Name')} *</Label>
              <Input value={form.full_name ?? ''} onChange={e => setField('full_name', e.target.value)} placeholder={t('employees.form_full_name_placeholder', 'Full name')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.department', 'Department')} *</Label>
              <Select value={form.department ?? ''} onValueChange={v => { setField('department', v); setField('position', '') }}>
                <SelectTrigger><SelectValue placeholder={t('employees.form_select_dept', 'Select department')} /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{deptLabel(d.value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.position', 'Position')} *</Label>
              <Select value={form.position ?? ''} onValueChange={v => setField('position', v)} disabled={!form.department}>
                <SelectTrigger><SelectValue placeholder={t('employees.form_select_pos', 'Select position')} /></SelectTrigger>
                <SelectContent>
                  {availablePositions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.phone', 'Phone')}</Label>
              <PhoneInput value={form.phone ?? ''} onChange={v => setField('phone', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.form_birthday', 'Birthday')}</Label>
              <DateInput value={form.birthday ?? ''} onChange={v => setField('birthday', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.hire_date', 'Hire Date')}</Label>
              <DateInput value={form.hire_date ?? ''} onChange={v => setField('hire_date', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employees.base_salary', 'Base Salary')} *</Label>
              <Input
                ref={salaryInput.ref}
                inputMode="numeric"
                value={salaryInput.value}
                onChange={salaryInput.onChange}
                onBlur={salaryInput.onBlur}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.status', 'Status')}</Label>
              <Select value={form.status ?? 'active'} onValueChange={v => setField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{t(`employees.status_${s}`, s.charAt(0).toUpperCase() + s.slice(1))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('common.notes', 'Notes')}</Label>
              <Input value={form.notes ?? ''} onChange={e => setField('notes', e.target.value)} placeholder={t('employees.form_notes_placeholder', 'Optional notes')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.full_name || !form.department || !form.position}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('employees.delete_title', 'Delete Employee?')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('employees.delete_confirm', 'This action cannot be undone.')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
