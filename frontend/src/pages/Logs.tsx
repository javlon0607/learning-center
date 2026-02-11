import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditLogApi, type AuditLogEntry } from '@/lib/api'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  X,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

function formatAuditValues(obj: Record<string, unknown> | null): string {
  if (!obj || typeof obj !== 'object') return '—'
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v === null || v === undefined ? '—' : String(v)}`)
    .join(', ')
}

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700 border-green-200',
  update: 'bg-blue-100 text-blue-700 border-blue-200',
  delete: 'bg-red-100 text-red-700 border-red-200',
  soft_delete: 'bg-orange-100 text-orange-700 border-orange-200',
  login: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  logout: 'bg-gray-100 text-gray-700 border-gray-200',
  lead_convert: 'bg-purple-100 text-purple-700 border-purple-200',
}

const PAGE_SIZE = 50

export function Logs() {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', dateFrom, dateTo, entityType, action, page],
    queryFn: () =>
      auditLogApi.getList({
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(entityType !== 'all' ? { entity_type: entityType } : {}),
        ...(action !== 'all' ? { action } : {}),
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      }),
  })

  const logs = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const filteredLogs = search
    ? logs.filter(
        (e) =>
          e.changed_by_username?.toLowerCase().includes(search.toLowerCase()) ||
          e.entity_type?.toLowerCase().includes(search.toLowerCase()) ||
          e.action?.toLowerCase().includes(search.toLowerCase()) ||
          e.ip_address?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const hasFilters = dateFrom || dateTo || entityType !== 'all' || action !== 'all'

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setEntityType('all')
    setAction('all')
    setSearch('')
    setPage(1)
  }

  function exportCSV() {
    if (filteredLogs.length === 0) return
    const headers = ['ID', 'Username', 'Entity', 'Entity ID', 'Action', 'Before', 'After', 'IP', 'Timestamp']
    const csvRows = [headers.join(',')]
    filteredLogs.forEach((e: AuditLogEntry) => {
      const row = [
        e.id,
        `"${(e.changed_by_username || '').replace(/"/g, '""')}"`,
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
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
          <p className="text-muted-foreground">
            System activity and change history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredLogs.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-card rounded-xl border border-border/60">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search username, entity, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <DateInput
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(1) }}
            className="w-[140px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <DateInput
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(1) }}
            className="w-[140px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Entity</Label>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
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
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
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
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ScrollText className="h-4 w-4" />
        <span>{total} total entries</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Before</TableHead>
                <TableHead>After</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No logs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((entry: AuditLogEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {entry.changed_by_username || `user_${entry.user_id ?? '?'}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="capitalize">{entry.entity_type}</span>
                      {entry.entity_id != null && (
                        <span className="text-muted-foreground"> #{entry.entity_id}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${actionColors[entry.action] || ''}`}
                      >
                        {entry.action?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs text-muted-foreground"
                      title={formatAuditValues(entry.old_values)}
                    >
                      {formatAuditValues(entry.old_values)}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs"
                      title={formatAuditValues(entry.new_values)}
                    >
                      {formatAuditValues(entry.new_values)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {entry.ip_address || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <ChevronLeft className="h-4 w-4 -ml-2" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
              <ChevronRight className="h-4 w-4 -ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
