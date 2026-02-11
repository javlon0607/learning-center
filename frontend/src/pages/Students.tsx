import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentsApi, groupsApi, Student, sourceOptions } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { StudentsSkeleton } from '@/components/skeletons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { StudentForm } from '@/components/students/StudentForm'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Phone, Mail, User,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  Users, AlertCircle, CheckCircle2, GraduationCap, XCircle, Download
} from 'lucide-react'
import { formatDate, formatCurrency, calculateAge, cn } from '@/lib/utils'

type SortField = 'name' | 'phone' | 'status' | 'groups' | 'debt' | 'source' | 'created_at'
type SortDirection = 'asc' | 'desc'

const statusConfig = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: XCircle },
  graduated: { label: 'Graduated', className: 'bg-blue-100 text-blue-700 border-blue-200', icon: GraduationCap },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
} as const

const pageSizeOptions = [20, 50, 100]

export function Students() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { hasRole } = useAuth()

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [debtOnly, setDebtOnly] = useState(false)

  // Debounce search input (300ms)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null)

  // Queries
  const { data: studentsRaw = [], isLoading } = useQuery({
    queryKey: ['students', { status: statusFilter === 'all' ? undefined : statusFilter, group_id: groupFilter === 'all' ? undefined : groupFilter, source: sourceFilter === 'all' ? undefined : sourceFilter, search: debouncedSearch || undefined }],
    queryFn: () => studentsApi.getAll({
      status: statusFilter === 'all' ? undefined : statusFilter,
      group_id: groupFilter === 'all' ? undefined : groupFilter,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      search: debouncedSearch || undefined,
    }),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  // Mutations
  const createStudent = useMutation({
    mutationFn: (data: Parameters<typeof studentsApi.create>[0]) => studentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: 'Student created successfully' })
      handleCloseForm()
    },
  })

  const updateStudent = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Student> }) => studentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: 'Student updated successfully' })
      handleCloseForm()
    },
  })

  const deleteStudent = useMutation({
    mutationFn: (id: number) => studentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: 'Student deleted successfully' })
      setDeleteDialogOpen(false)
      setStudentToDelete(null)
    },
  })

  // Filter by debt (search is now server-side)
  const filteredStudents = useMemo(() => {
    if (!debtOnly) return studentsRaw
    return studentsRaw.filter(s => (s.current_month_debt || 0) > 0)
  }, [studentsRaw, debtOnly])

  // Sort
  const sortedStudents = useMemo(() => {
    const sorted = [...filteredStudents]
    sorted.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
          break
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '')
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'groups':
          comparison = (a.groups_list || '').localeCompare(b.groups_list || '')
          break
        case 'debt':
          comparison = (a.current_month_debt || 0) - (b.current_month_debt || 0)
          break
        case 'source':
          comparison = (a.source || '').localeCompare(b.source || '')
          break
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [filteredStudents, sortField, sortDirection])

  // Paginate
  const totalPages = Math.ceil(sortedStudents.length / pageSize)
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStudents.slice(start, start + pageSize)
  }, [sortedStudents, currentPage, pageSize])

  // Stats
  const stats = useMemo(() => {
    const total = studentsRaw.length
    const active = studentsRaw.filter(s => s.status === 'active').length
    const withDebt = studentsRaw.filter(s => (s.current_month_debt || 0) > 0).length
    const totalDebt = studentsRaw.reduce((sum, s) => sum + (s.current_month_debt || 0), 0)
    return { total, active, withDebt, totalDebt }
  }, [studentsRaw])

  // Handlers
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setSelectedStudent(null)
  }

  function handleEdit(student: Student) {
    setSelectedStudent(student)
    setFormOpen(true)
  }

  function handleDelete(student: Student) {
    setStudentToDelete(student)
    setDeleteDialogOpen(true)
  }

  function handleCreateOrUpdate(data: Parameters<typeof studentsApi.create>[0]) {
    if (selectedStudent) {
      updateStudent.mutate({ id: selectedStudent.id, data })
    } else {
      createStudent.mutate(data)
    }
  }

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('all')
    setGroupFilter('all')
    setSourceFilter('all')
    setDebtOnly(false)
    setCurrentPage(1)
  }

  function exportCSV() {
    const headers = ['ID', 'First Name', 'Last Name', 'Age', 'Phone', 'Email', 'Parent Name', 'Parent Phone', 'Groups', 'Status', 'Source', 'Debt', 'Enrolled']
    const rows = sortedStudents.map(s => [
      s.id,
      s.first_name,
      s.last_name,
      s.dob ? calculateAge(s.dob) : '',
      s.phone || '',
      s.email || '',
      s.parent_name || '',
      s.parent_phone || '',
      s.groups_list || '',
      s.status,
      sourceOptions.find(so => so.value === s.source)?.label || s.source || '',
      s.current_month_debt || 0,
      formatDate(s.created_at),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `students_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Sort header component
  function SortableHeader({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) {
    const isActive = sortField === field
    return (
      <TableHead className={cn("cursor-pointer select-none hover:bg-muted/50 transition-colors", className)} onClick={() => handleSort(field)}>
        <div className="flex items-center gap-1">
          {children}
          {isActive ? (
            sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="text-muted-foreground mt-1">Manage and track all student records</p>
        </div>
        <div className="flex items-center gap-2">
          {sortedStudents.length > 0 && (
            <Button variant="outline" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" />Export
            </Button>
          )}
          <Button onClick={() => setFormOpen(true)} className="bg-navy-950 hover:bg-navy-900">
            <Plus className="mr-2 h-4 w-4" />Add Student
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", statusFilter === 'all' && !debtOnly && "ring-2 ring-blue-500")}
          onClick={() => { clearFilters(); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Students</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", statusFilter === 'active' && !debtOnly && "ring-2 ring-green-500")}
          onClick={() => { clearFilters(); setStatusFilter('active'); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active Students</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", debtOnly && "ring-2 ring-red-500")}
          onClick={() => { clearFilters(); setDebtOnly(true); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", stats.withDebt > 0 ? "bg-red-100" : "bg-gray-100")}>
                <AlertCircle className={cn("h-5 w-5", stats.withDebt > 0 ? "text-red-600" : "text-gray-400")} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withDebt}</p>
                <p className="text-xs text-muted-foreground">With Debt</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", debtOnly && "ring-2 ring-amber-500")}
          onClick={() => { clearFilters(); setDebtOnly(true); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", stats.totalDebt > 0 ? "bg-amber-100" : "bg-gray-100")}>
                <AlertCircle className={cn("h-5 w-5", stats.totalDebt > 0 ? "text-amber-600" : "text-gray-400")} />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalDebt)}</p>
                <p className="text-xs text-muted-foreground">Total Debt (Month)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-xl border border-border/60">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="graduated">Graduated</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {groups.filter(g => g.status === 'active').map((group) => (
              <SelectItem key={group.id} value={group.id.toString()}>{group.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sourceOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {debtOnly && (
          <Badge variant="secondary" className="gap-1">
            Debt only
            <button onClick={() => setDebtOnly(false)} className="ml-1 hover:text-foreground">&times;</button>
          </Badge>
        )}
        {(search || statusFilter !== 'all' || groupFilter !== 'all' || sourceFilter !== 'all' || debtOnly) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
            Clear filters
          </Button>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <StudentsSkeleton />
      ) : sortedStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-card rounded-xl border border-border/60">
          <div className="p-4 rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-medium text-foreground">No students found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all' || groupFilter !== 'all' || sourceFilter !== 'all' || debtOnly
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by adding your first student'}
            </p>
          </div>
          {!search && statusFilter === 'all' && groupFilter === 'all' && sourceFilter === 'all' && !debtOnly && (
            <Button onClick={() => setFormOpen(true)} className="mt-2">
              <Plus className="mr-2 h-4 w-4" />Add Student
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-soft">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <SortableHeader field="name" className="font-semibold">Student</SortableHeader>
                  <SortableHeader field="phone" className="font-semibold">Contact</SortableHeader>
                  <TableHead className="font-semibold">Parent/Guardian</TableHead>
                  <SortableHeader field="groups" className="font-semibold">Groups</SortableHeader>
                  <SortableHeader field="debt" className="font-semibold">This Month</SortableHeader>
                  <SortableHeader field="status" className="font-semibold">Status</SortableHeader>
                  <SortableHeader field="source" className="font-semibold">Source</SortableHeader>
                  <SortableHeader field="created_at" className="font-semibold">Enrolled</SortableHeader>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedStudents.map((student, index) => {
                  const StatusIcon = statusConfig[student.status]?.icon || CheckCircle2
                  const hasDebt = (student.current_month_debt || 0) > 0
                  return (
                    <TableRow
                      key={student.id}
                      className={cn(
                        'transition-colors cursor-pointer hover:bg-muted/30',
                        index % 2 === 0 ? 'bg-card' : 'bg-muted/10'
                      )}
                      onClick={() => navigate(`/students/${student.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 font-medium text-sm shrink-0">
                            {student.first_name[0]}{student.last_name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{student.first_name} {student.last_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {student.dob ? `${calculateAge(student.dob)} y/o` : `ID: ${student.id}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {student.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              {student.phone}
                            </div>
                          )}
                          {student.email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[150px]">{student.email}</span>
                            </div>
                          )}
                          {!student.phone && !student.email && <span className="text-muted-foreground text-sm">-</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {student.parent_name ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium">{student.parent_name}</span>
                            </div>
                            {student.parent_phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" />
                                {student.parent_phone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.enrollments && student.enrollments.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {student.enrollments.map((e, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">
                                {e.group_name}
                                {e.discount > 0 && <span className="text-green-600 ml-1">-{e.discount}%</span>}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not enrolled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.enrollments && student.enrollments.length > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={cn("text-sm", hasDebt ? "text-red-600 font-medium" : "text-green-600")}>
                                  {hasDebt ? (
                                    <div className="flex items-center gap-1">
                                      <AlertCircle className="h-4 w-4" />
                                      {formatCurrency(student.current_month_debt || 0)}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="h-4 w-4" />
                                      Paid
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <div className="text-sm space-y-1">
                                  <p>Expected: {formatCurrency(student.current_month_expected || 0)}</p>
                                  <p>Paid: {formatCurrency(student.current_month_paid || 0)}</p>
                                  <p>Remaining: {formatCurrency(student.current_month_debt || 0)}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                          statusConfig[student.status]?.className
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig[student.status]?.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {sourceOptions.find(s => s.value === student.source)?.label || student.source || 'Walk-in'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatDate(student.created_at)}</span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate(`/students/${student.id}`)} className="cursor-pointer">
                              <Eye className="mr-2 h-4 w-4" />View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(student)} className="cursor-pointer">
                              <Pencil className="mr-2 h-4 w-4" />Edit Student
                            </DropdownMenuItem>
                            {hasRole('admin') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDelete(student)} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                  <Trash2 className="mr-2 h-4 w-4" />Delete Student
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sortedStudents.length)} of {sortedStudents.length}</span>
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
              <span>per page</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <ChevronLeft className="h-4 w-4 -ml-2" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm">Page</span>
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
                <span className="text-sm">of {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <ChevronRight className="h-4 w-4 -ml-2" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Student Form */}
      <StudentForm
        open={formOpen}
        onClose={handleCloseForm}
        onSubmit={handleCreateOrUpdate}
        student={selectedStudent}
        isLoading={createStudent.isPending || updateStudent.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {studentToDelete?.first_name} {studentToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => studentToDelete && deleteStudent.mutate(studentToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
