import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Pencil, Trash2, ShoppingCart, X, TrendingUp, AlertTriangle, DollarSign, Clock, Users, PackagePlus } from 'lucide-react'
import {
  booksApi, bookIssuesApi, groupsApi, enrollmentsApi,
  Book, BookIssue, BookMonthStat, Enrollment,
} from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { usePermissions } from '@/contexts/PermissionsContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAmountInput } from '@/hooks/useAmountInput'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchableSelect } from '@/components/ui/searchable-select'

// ── Book Form Dialog ───────────────────────────────────────────────────────

interface BookFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  book?: Book
  onSuccess?: () => void
}

function BookFormDialog({ open, onOpenChange, book, onSuccess }: BookFormDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [title, setTitle]      = useState(book?.title ?? '')
  const [author, setAuthor]    = useState(book?.author ?? '')
  const [isbn, setIsbn]        = useState(book?.isbn ?? '')
  const [description, setDesc] = useState(book?.description ?? '')
  const price    = useAmountInput(book ? String(book.price) : '')
  const quantity = useAmountInput(book ? String(book.quantity) : '')

  const isEdit = !!book

  function resetForm() {
    setTitle(book?.title ?? '')
    setAuthor(book?.author ?? '')
    setIsbn(book?.isbn ?? '')
    setDesc(book?.description ?? '')
    price.setFromNumber(book?.price ?? 0)
    quantity.setFromNumber(book?.quantity ?? 0)
  }

  const createMutation = useMutation({
    mutationFn: booksApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: t('books.toast_added', 'Book added') })
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof booksApi.update>[1] }) =>
      booksApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: t('books.toast_updated', 'Book updated') })
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  function handleSubmit() {
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }
    if (isEdit) {
      updateMutation.mutate({ id: book.id, data: {
        title: title.trim(),
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        description: description.trim() || undefined,
      }})
    } else {
      createMutation.mutate({
        title: title.trim(),
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        price: price.numericValue(),
        quantity: Math.round(quantity.numericValue()),
        description: description.trim() || undefined,
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('books.edit', 'Edit Book') : t('books.add', 'Add Book')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{t('books.form_title', 'Title *')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('books.form_author', 'Author')}</Label>
              <Input value={author} onChange={e => setAuthor(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t('books.form_isbn', 'ISBN')}</Label>
              <Input value={isbn} onChange={e => setIsbn(e.target.value)} className="mt-1" />
            </div>
          </div>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('books.form_price', 'Price *')}</Label>
                <Input ref={price.ref} value={price.value} onChange={price.onChange} onBlur={price.onBlur} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label>{t('books.form_quantity', 'Quantity *')}</Label>
                <Input ref={quantity.ref} value={quantity.value} onChange={quantity.onChange} onBlur={quantity.onBlur} className="mt-1" placeholder="0" />
              </div>
            </div>
          )}
          <div>
            <Label>{t('books.form_description', 'Description')}</Label>
            <Input value={description} onChange={e => setDesc(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('common.loading', 'Loading...') : (isEdit ? t('common.save', 'Save') : t('common.add', 'Add'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Stock Dialog ───────────────────────────────────────────────────────

interface AddStockDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  book: Book
}

function AddStockDialog({ open, onOpenChange, book }: AddStockDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const qty   = useAmountInput('')
  const price = useAmountInput(String(book.price))

  useEffect(() => {
    if (open) {
      qty.setFromNumber(0)
      price.setFromNumber(book.price)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (data: { quantity: number; price?: number; notes?: string }) =>
      booksApi.addStock(book.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: 'Stock added' })
      onOpenChange(false)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  function handleSubmit() {
    const q = Math.round(qty.numericValue())
    if (q < 1) { toast({ title: 'Quantity must be at least 1', variant: 'destructive' }); return }
    const newPrice = price.numericValue()
    mutation.mutate({
      quantity: q,
      price: newPrice !== book.price ? newPrice : undefined,
    })
  }

  const newPrice = price.numericValue()
  const priceChanged = newPrice !== book.price

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Stock — {book.title}</DialogTitle>
          <DialogDescription>Current stock: {book.available} available / {book.quantity} total</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>New Batch Quantity *</Label>
            <Input ref={qty.ref} value={qty.value} onChange={qty.onChange} onBlur={qty.onBlur} className="mt-1" placeholder="0" />
          </div>
          <div>
            <Label>
              Selling Price
              {priceChanged && <span className="ml-2 text-xs text-amber-600">(was {book.price.toLocaleString()} → will update)</span>}
            </Label>
            <Input ref={price.ref} value={price.value} onChange={price.onChange} onBlur={price.onBlur} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Change only if the new batch has a different selling price</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? t('common.loading', 'Loading...') : 'Add Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Issue Book Dialog ──────────────────────────────────────────────────────

interface StudentRow {
  studentId: number
  name: string
  phone?: string
  checked: boolean
  qty: number
}

interface IssueDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  book: Book
}

function IssueDialog({ open, onOpenChange, book }: IssueDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [groupId, setGroupId] = useState('')
  const [rows, setRows]       = useState<StudentRow[]>([])
  const [notes, setNotes]     = useState('')

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const { data: enrollments = [], isFetching: loadingStudents } = useQuery({
    queryKey: ['enrollments', 'group', groupId],
    queryFn: () => enrollmentsApi.getByGroup(Number(groupId)),
    enabled: !!groupId,
  })

  // When enrollments load, initialize rows (all checked, qty=1)
  useEffect(() => {
    if (!groupId) { setRows([]); return }
    setRows(
      (enrollments as Enrollment[]).map(e => ({
        studentId: e.student_id,
        name:      e.student_name ?? '',
        phone:     e.student_phone,
        checked:   false,
        qty:       1,
      }))
    )
  }, [enrollments, groupId])

  // Reset when dialog closes
  useEffect(() => {
    if (!open) { setGroupId(''); setRows([]); setNotes('') }
  }, [open])

  const groupOptions = useMemo(() =>
    groups.map(g => ({ value: String(g.id), label: g.name })),
  [groups])

  const selectedRows = rows.filter(r => r.checked)
  const totalBooks   = selectedRows.reduce((s, r) => s + r.qty, 0)
  const totalPrice   = totalBooks * book.price
  const allChecked   = rows.length > 0 && rows.every(r => r.checked)
  const someChecked  = rows.some(r => r.checked)

  function toggleAll() {
    setRows(prev => prev.map(r => ({ ...r, checked: !allChecked })))
  }

  function toggleRow(studentId: number) {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, checked: !r.checked } : r))
  }

  function setQty(studentId: number, val: string) {
    const n = Math.max(1, parseInt(val) || 1)
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, qty: n } : r))
  }

  const mutation = useMutation({
    mutationFn: bookIssuesApi.createBulk,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['book-issues'] })
      toast({ title: t('books.toast_issued', 'Book issued successfully') + ` (${data.count})` })
      onOpenChange(false)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  function handleSubmit() {
    if (!groupId) {
      toast({ title: t('books.issue_group', 'Select a group'), variant: 'destructive' })
      return
    }
    if (selectedRows.length === 0) {
      toast({ title: t('books.issue_select_students', 'Select at least one student'), variant: 'destructive' })
      return
    }
    if (totalBooks > book.available) {
      toast({ title: t('books.no_stock', 'Not enough stock') + `. ${t('books.stat_available', 'Available')}: ${book.available}, needed: ${totalBooks}`, variant: 'destructive' })
      return
    }
    mutation.mutate({
      book_id:  book.id,
      students: selectedRows.map(r => ({ student_id: r.studentId, quantity: r.qty })),
      notes:    notes.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('books.issue_book', 'Issue Book')}</DialogTitle>
          <DialogDescription className="font-medium">{book.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Group select */}
          <div>
            <Label>{t('books.issue_group', 'Group *')}</Label>
            <div className="mt-1">
              <SearchableSelect
                value={groupId}
                onValueChange={v => { setGroupId(v); setRows([]) }}
                options={groupOptions}
                placeholder={t('books.issue_group', 'Select group...')}
              />
            </div>
          </div>

          {/* Student list */}
          {groupId && (
            <div className="border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-muted/50 border-b">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {loadingStudents
                    ? t('common.loading', 'Loading...')
                    : `${rows.length} ${t('books.students_in_group', 'students in group')}`
                  }
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t('books.stat_available', 'Available')}: <strong>{book.available}</strong>
                </span>
              </div>

              {/* Rows */}
              <div className="max-h-56 overflow-y-auto">
                {rows.length === 0 && !loadingStudents ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    {t('books.no_students_in_group', 'No students in this group')}
                  </div>
                ) : (
                  rows.map(row => (
                    <div
                      key={row.studentId}
                      className={`flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-gray-50 dark:hover:bg-muted/40 cursor-pointer transition-colors ${row.checked ? '' : 'opacity-50'}`}
                      onClick={() => toggleRow(row.studentId)}
                    >
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => toggleRow(row.studentId)}
                        onClick={e => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{row.name}</div>
                        {row.phone && <div className="text-xs text-muted-foreground">{row.phone}</div>}
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={e => { e.stopPropagation(); setQty(row.studentId, e.target.value) }}
                        onClick={e => e.stopPropagation()}
                        disabled={!row.checked}
                        className="w-14 text-center text-sm border rounded px-1 py-0.5 disabled:opacity-40"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Summary */}
          {selectedRows.length > 0 && (
            <div className="rounded-lg bg-gray-50 dark:bg-muted/50 border px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {selectedRows.length} {t('books.students', 'students')} · {totalBooks} {t('books.books_count', 'books')}
              </span>
              <span className="text-lg font-bold">{formatCurrency(totalPrice)}</span>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>{t('books.issue_notes', 'Notes')}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || selectedRows.length === 0 || book.available < 1}
          >
            {mutation.isPending
              ? t('common.loading', 'Loading...')
              : `${t('books.issue', 'Issue')} → ${selectedRows.length} ${t('books.students', 'students')}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Mark Paid Dialog ───────────────────────────────────────────────────────

interface MarkPaidDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  issue: BookIssue | null
  onSuccess: () => void
}

function MarkPaidDialog({ open, onOpenChange, issue, onSuccess }: MarkPaidDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [method, setMethod] = useState('cash')

  const mutation = useMutation({
    mutationFn: ({ id, method }: { id: number; method: string }) =>
      bookIssuesApi.markPaid(id, method),
    onSuccess: () => {
      toast({ title: t('books.toast_paid', 'Marked as paid') })
      onSuccess()
      onOpenChange(false)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  if (!issue) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('books.mark_paid', 'Mark as Paid')}</DialogTitle>
          <DialogDescription>
            {issue.student_name} — {issue.book_title}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-gray-50 border px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('books.issue_price', 'Amount')}</span>
            <span className="text-lg font-bold">{formatCurrency(issue.total_price)}</span>
          </div>
          <div>
            <Label>{t('books.issue_method', 'Payment Method')}</Label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="cash">{t('payments.method_cash', 'Cash')}</option>
              <option value="card">{t('payments.method_card', 'Card')}</option>
              <option value="transfer">{t('payments.method_transfer', 'Bank Transfer')}</option>
              <option value="other">{t('payments.method_other', 'Other')}</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={() => mutation.mutate({ id: issue.id, method })} disabled={mutation.isPending}>
            {mutation.isPending ? t('common.loading', 'Loading...') : t('books.mark_paid', 'Mark as Paid')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Issues Table (shared between All Issues tab and per-book history) ──────

interface IssuesTableProps {
  bookId?: number
  studentId?: number
}

function IssuesTable({ bookId, studentId }: IssuesTableProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const [page, setPage]             = useState(1)
  const [isPaidFilter, setFilter]   = useState<string>('')
  const [bookFilter, setBookFilter] = useState<string>('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [markPaidIssue, setMarkPaidIssue] = useState<BookIssue | null>(null)
  const [markPaidOpen, setMarkPaidOpen]   = useState(false)

  // Only fetch books/groups when used in "all issues" mode
  const isAllMode = !bookId && !studentId

  const { data: books = [] } = useQuery({
    queryKey: ['books'],
    queryFn: booksApi.getAll,
    enabled: isAllMode,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
    enabled: isAllMode,
  })

  const params: Record<string, string> = { page: String(page), per_page: '20' }
  if (bookId)       params.book_id    = String(bookId)
  if (studentId)    params.student_id = String(studentId)
  if (bookFilter)   params.book_id    = bookFilter
  if (groupFilter)  params.group_id   = groupFilter
  if (isPaidFilter) params.is_paid    = isPaidFilter

  const { data, isLoading } = useQuery({
    queryKey: ['book-issues', { bookId, studentId, bookFilter, groupFilter, isPaidFilter, page }],
    queryFn: () => bookIssuesApi.getAll(params),
  })

  const issues   = data?.data ?? []
  const total    = data?.total ?? 0
  const perPage  = data?.per_page ?? 20
  const totalPages = Math.ceil(total / perPage)

  function handleMarkPaid(issue: BookIssue) {
    setMarkPaidIssue(issue)
    setMarkPaidOpen(true)
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {isAllMode && (
          <select
            value={bookFilter}
            onChange={e => { setBookFilter(e.target.value); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">{t('books.filter_all_books', 'All Books')}</option>
            {books.map(b => (
              <option key={b.id} value={String(b.id)}>{b.title}</option>
            ))}
          </select>
        )}
        {isAllMode && (
          <select
            value={groupFilter}
            onChange={e => { setGroupFilter(e.target.value); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">{t('books.filter_all_groups', 'All Groups')}</option>
            {groups.map(g => (
              <option key={g.id} value={String(g.id)}>{g.name}</option>
            ))}
          </select>
        )}
        <select
          value={isPaidFilter}
          onChange={e => { setFilter(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">{t('books.filter_all', 'All')}</option>
          <option value="0">{t('books.filter_unpaid', 'Unpaid')}</option>
          <option value="1">{t('books.filter_paid', 'Paid')}</option>
        </select>
        <span className="text-sm text-muted-foreground ml-auto">
          {t('books.total_records', 'Total')}: {total}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-center py-8 text-muted-foreground">{t('common.loading', 'Loading...')}</p>
      ) : issues.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">{t('books.no_history', 'No records')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {!bookId    && <th className="pb-2 pr-4 font-medium">{t('books.col_title', 'Book')}</th>}
                {!studentId && <th className="pb-2 pr-4 font-medium">{t('books.col_student', 'Student')}</th>}
                <th className="pb-2 pr-4 font-medium text-right">{t('books.col_qty', 'Qty')}</th>
                <th className="pb-2 pr-4 font-medium text-right">{t('books.col_total', 'Total')}</th>
                <th className="pb-2 pr-4 font-medium">{t('books.col_status', 'Status')}</th>
                <th className="pb-2 pr-4 font-medium">{t('books.col_date', 'Date')}</th>
                <th className="pb-2 font-medium">{t('books.col_notes', 'Notes')}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {issues.map(issue => (
                <tr key={issue.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-muted/40">
                  {!bookId    && <td className="py-2 pr-4 font-medium">{issue.book_title}</td>}
                  {!studentId && <td className="py-2 pr-4">{issue.student_name}</td>}
                  <td className="py-2 pr-4 text-right">{issue.quantity}</td>
                  <td className="py-2 pr-4 text-right font-mono">{formatCurrency(issue.total_price)}</td>
                  <td className="py-2 pr-4">
                    {issue.is_paid ? (
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30">{t('books.paid', 'Paid')}</Badge>
                    ) : (
                      <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30">{t('books.unpaid', 'Unpaid')}</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(issue.issued_at)}</td>
                  <td className="py-2 pr-4 text-muted-foreground max-w-[120px] truncate">{issue.notes ?? '—'}</td>
                  <td className="py-2">
                    {!issue.is_paid && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleMarkPaid(issue)}
                      >
                        {t('books.mark_paid', 'Mark Paid')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t('common.prev', 'Prev')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            {t('common.next', 'Next')}
          </Button>
        </div>
      )}

      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        issue={markPaidIssue}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['book-issues'] })
          qc.invalidateQueries({ queryKey: ['books'] })
        }}
      />
    </div>
  )
}

// ── Per-book History Dialog ────────────────────────────────────────────────

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  book: Book
}

function HistoryDialog({ open, onOpenChange, book }: HistoryDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('books.history', 'Issue History')} — {book.title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto">
          <IssuesTable bookId={book.id} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Monthly Report ─────────────────────────────────────────────────────────

function MonthlyReport() {
  const { t } = useTranslation()
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['books-stats'],
    queryFn: booksApi.getStats,
  })

  function fmtMonth(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
  }

  if (isLoading) return <p className="text-center py-6 text-muted-foreground">{t('common.loading', 'Loading...')}</p>
  if (stats.length === 0) return <p className="text-center py-6 text-muted-foreground">{t('books.no_history', 'No data yet')}</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">{t('books.col_month', 'Month')}</th>
            <th className="pb-2 pr-4 font-medium text-right">{t('books.col_issues', 'Issues')}</th>
            <th className="pb-2 pr-4 font-medium text-right">{t('books.col_books_count', 'Books')}</th>
            <th className="pb-2 pr-4 font-medium text-right">{t('books.col_revenue', 'Revenue')}</th>
            <th className="pb-2 pr-4 font-medium text-right">{t('books.col_paid', 'Paid')}</th>
            <th className="pb-2 font-medium text-right">{t('books.col_unpaid', 'Unpaid')}</th>
          </tr>
        </thead>
        <tbody>
          {(stats as BookMonthStat[]).map(row => (
            <tr key={row.month} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-muted/40">
              <td className="py-2 pr-4 font-medium">{fmtMonth(row.month)}</td>
              <td className="py-2 pr-4 text-right">{row.issues_count}</td>
              <td className="py-2 pr-4 text-right">{row.books_count}</td>
              <td className="py-2 pr-4 text-right font-mono">{formatCurrency(Number(row.total_revenue))}</td>
              <td className="py-2 pr-4 text-right font-mono text-green-600">{formatCurrency(Number(row.paid_revenue))}</td>
              <td className="py-2 text-right font-mono text-red-600">{formatCurrency(Number(row.unpaid_revenue))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Books Page ────────────────────────────────────────────────────────

export function Books() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { hasFeature } = usePermissions()
  const canDeleteBooks = hasFeature('books_delete')

  const [search, setSearch]             = useState('')
  const [addOpen, setAddOpen]           = useState(false)
  const [editBook, setEditBook]         = useState<Book | null>(null)
  const [restockBook, setRestockBook]   = useState<Book | null>(null)
  const [issueBook, setIssueBook]       = useState<Book | null>(null)
  const [historyBook, setHistoryBook]   = useState<Book | null>(null)
  const [deleteBook, setDeleteBook]     = useState<Book | null>(null)

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['books'],
    queryFn: booksApi.getAll,
  })

  const deleteMutation = useMutation({
    mutationFn: booksApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: t('books.toast_deleted', 'Book deleted') })
      setDeleteBook(null)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return books
    const q = search.toLowerCase()
    return books.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author ?? '').toLowerCase().includes(q) ||
      (b.isbn ?? '').toLowerCase().includes(q)
    )
  }, [books, search])

  const stats = useMemo(() => ({
    titles:        books.length,
    copies:        books.reduce((s, b) => s + b.quantity, 0),
    issued:        books.reduce((s, b) => s + b.issued_count, 0),
    available:     books.reduce((s, b) => s + b.available, 0),
    totalRevenue:  books.reduce((s, b) => s + Number(b.unpaid_amount) + (b.issued_count * 0), 0),
    unpaidAmount:  books.reduce((s, b) => s + Number(b.unpaid_amount), 0),
    unpaidCount:   books.reduce((s, b) => s + Number(b.unpaid_count), 0),
  }), [books])

  // Compute total revenue from monthly stats via separate query
  const { data: monthStats = [] } = useQuery({
    queryKey: ['books-stats'],
    queryFn: booksApi.getStats,
  })
  const totalRevenue = useMemo(() =>
    (monthStats as BookMonthStat[]).reduce((s, r) => s + Number(r.total_revenue), 0),
  [monthStats])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-gold-500" />
            {t('books.title', 'Books')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('books.description', 'Manage book inventory and sales to students')}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('books.add', 'Add Book')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: t('books.stat_titles',    'Total Titles'),   value: stats.titles,    icon: BookOpen },
          { label: t('books.stat_copies',    'Total Copies'),   value: stats.copies,    icon: BookOpen },
          { label: t('books.stat_issued',    'Issued'),         value: stats.issued,    icon: TrendingUp },
          { label: t('books.stat_available', 'Available'),      value: stats.available, icon: BookOpen },
          { label: t('books.stat_revenue',   'Total Revenue'),  value: formatCurrency(totalRevenue), icon: DollarSign, raw: true },
          { label: t('books.stat_unpaid',    'Unpaid'),         value: stats.unpaidAmount > 0 ? `${stats.unpaidCount} · ${formatCurrency(stats.unpaidAmount)}` : '0', icon: Clock, raw: true, warn: stats.unpaidAmount > 0 },
        ].map(s => (
          <div key={s.label} className={`bg-white dark:bg-card rounded-xl border shadow-sm px-4 py-3 ${s.warn ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20' : 'border-gray-100 dark:border-border'}`}>
            <p className={`text-xs ${s.warn ? 'text-red-500' : 'text-muted-foreground'}`}>{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.warn ? 'text-red-600' : ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">
            <BookOpen className="mr-2 h-4 w-4" />
            {t('books.tab_inventory', 'Inventory')}
          </TabsTrigger>
          <TabsTrigger value="issues">
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t('books.tab_issues', 'All Issues')}
            {stats.unpaidCount > 0 && (
              <Badge className="ml-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs px-1.5 py-0">
                {stats.unpaidCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="report">
            <TrendingUp className="mr-2 h-4 w-4" />
            {t('books.tab_report', 'Monthly Report')}
          </TabsTrigger>
        </TabsList>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory" className="mt-4">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t('books.search', 'Search books...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-sm"
              />
              {search && (
                <Button variant="ghost" size="icon" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-border shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">{t('common.loading', 'Loading...')}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">{t('books.empty', 'No books found')}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('books.col_title', 'Title')}</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t('books.col_author', 'Author')}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('books.col_price', 'Price')}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('books.col_quantity', 'Stock')}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t('books.col_issued', 'Issued')}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('books.col_available', 'Available')}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t('books.stat_unpaid', 'Unpaid')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(book => (
                      <tr key={book.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-foreground">{book.title}</div>
                          {book.isbn && <div className="text-xs text-muted-foreground mt-0.5">ISBN: {book.isbn}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{book.author ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(book.price)}</td>
                        <td className="px-4 py-3 text-right">{book.quantity}</td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">{book.issued_count}</td>
                        <td className="px-4 py-3 text-right">
                          {book.available === 0 ? (
                            <span className="text-red-600 font-medium">{book.available}</span>
                          ) : book.available <= 2 ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                              <AlertTriangle className="h-3 w-3" />
                              {book.available}
                            </span>
                          ) : (
                            <span className="text-green-600 font-medium">{book.available}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          {Number(book.unpaid_count) > 0 ? (
                            <span className="text-red-600 font-medium text-xs">
                              {book.unpaid_count} · {formatCurrency(Number(book.unpaid_amount))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title={t('books.issue', 'Issue Book')}
                              onClick={() => setIssueBook(book)}
                              disabled={book.available === 0}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title={t('books.history', 'History')}
                              onClick={() => setHistoryBook(book)}
                            >
                              <TrendingUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title="Add Stock"
                              onClick={() => setRestockBook(book)}
                            >
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title={t('common.edit', 'Edit')}
                              onClick={() => setEditBook(book)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {canDeleteBooks && (
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                                title={t('common.delete', 'Delete')}
                                onClick={() => setDeleteBook(book)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── All Issues Tab ── */}
        <TabsContent value="issues" className="mt-4">
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-border shadow-sm p-4">
            <IssuesTable />
          </div>
        </TabsContent>

        {/* ── Monthly Report Tab ── */}
        <TabsContent value="report" className="mt-4">
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-border shadow-sm p-4">
            <h3 className="font-semibold mb-4">{t('books.tab_report', 'Monthly Report')} (last 24 months)</h3>
            <MonthlyReport />
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <BookFormDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Edit Dialog */}
      {editBook && (
        <BookFormDialog
          open={!!editBook}
          onOpenChange={v => { if (!v) setEditBook(null) }}
          book={editBook}
          onSuccess={() => setEditBook(null)}
        />
      )}

      {/* Add Stock Dialog */}
      {restockBook && (
        <AddStockDialog
          open={!!restockBook}
          onOpenChange={v => { if (!v) setRestockBook(null) }}
          book={restockBook}
        />
      )}

      {/* Issue Dialog */}
      {issueBook && (
        <IssueDialog
          open={!!issueBook}
          onOpenChange={v => { if (!v) setIssueBook(null) }}
          book={issueBook}
        />
      )}

      {/* History Dialog */}
      {historyBook && (
        <HistoryDialog
          open={!!historyBook}
          onOpenChange={v => { if (!v) setHistoryBook(null) }}
          book={historyBook}
        />
      )}

      {/* Delete Confirm */}
      {deleteBook && (
        <Dialog open={!!deleteBook} onOpenChange={v => { if (!v) setDeleteBook(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('common.delete', 'Delete')}</DialogTitle>
              <DialogDescription>
                {t('books.confirm_delete', 'Delete this book?')} &quot;{deleteBook.title}&quot;
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteBook(null)}>{t('common.cancel', 'Cancel')}</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteBook.id)}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete', 'Delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
