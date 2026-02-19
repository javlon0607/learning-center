import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collectionsApi, CollectionDebtor, CollectionCall } from '@/lib/api'
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
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

type SortField = 'name' | 'phone' | 'groups' | 'expected' | 'paid' | 'debt' | 'last_call' | 'calls'
type SortDirection = 'asc' | 'desc'

export function Collections() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('debt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [detailStudent, setDetailStudent] = useState<CollectionDebtor | null>(null)
  const [callDialogOpen, setCallDialogOpen] = useState(false)
  const [callStudent, setCallStudent] = useState<CollectionDebtor | null>(null)

  const { data: debtors = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: collectionsApi.getDebtors,
  })

  const { data: callHistory = [] } = useQuery({
    queryKey: ['collection-calls', detailStudent?.id],
    queryFn: () => collectionsApi.getCallHistory(detailStudent!.id),
    enabled: !!detailStudent,
  })

  const addCallMutation = useMutation({
    mutationFn: ({ studentId, notes }: { studentId: number; notes: string }) =>
      collectionsApi.addCall(studentId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['collection-calls', callStudent?.id] })
      toast({ title: 'Call logged successfully' })
      setCallDialogOpen(false)
    },
    onError: () => {
      toast({ title: 'Failed to log call', variant: 'destructive' })
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

  const currentMonthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  function handleLogCall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!callStudent) return
    const formData = new FormData(e.currentTarget)
    const notes = (formData.get('notes') as string)?.trim()
    if (!notes) return
    addCallMutation.mutate({ studentId: callStudent.id, notes })
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

  function openCallDialog(student: CollectionDebtor) {
    setCallStudent(student)
    setCallDialogOpen(true)
  }

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
        <h1 className="text-2xl font-bold text-slate-900">Collections</h1>
        <p className="text-muted-foreground">Students with outstanding debt for {currentMonthLabel}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2">
                <Users className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Students with Debt</p>
                <p className="text-2xl font-bold">{debtors.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(totalDebt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <PhoneCall className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Calls Made</p>
                <p className="text-2xl font-bold">{totalCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortableHeader field="name" className="text-left">Student</SortableHeader>
              <SortableHeader field="phone" className="text-left">Phone</SortableHeader>
              <SortableHeader field="groups" className="text-left">Groups</SortableHeader>
              <SortableHeader field="expected" className="text-right">Expected</SortableHeader>
              <SortableHeader field="paid" className="text-right">Paid</SortableHeader>
              <SortableHeader field="debt" className="text-right">Debt</SortableHeader>
              <SortableHeader field="last_call" className="text-left">Last Call</SortableHeader>
              <SortableHeader field="calls" className="text-center">Calls</SortableHeader>
              <th className="text-right p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {search ? 'No matching students found.' : 'No students with outstanding debt this month.'}
                </td>
              </tr>
            ) : (
              sorted.map((d) => (
                <tr
                  key={d.id}
                  className="border-b hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailStudent(d)}
                >
                  <td className="p-3 font-medium">{d.first_name} {d.last_name}</td>
                  <td className="p-3">
                    {d.phone && (
                      <a
                        href={`tel:${d.phone}`}
                        className="text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {d.phone}
                      </a>
                    )}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        openCallDialog(d)
                      }}
                    >
                      <PhoneCall className="h-4 w-4 mr-1" />Log Call
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
                  <p className="text-xs text-muted-foreground">Expected</p>
                  <p className="text-lg font-bold">{formatCurrency(detailStudent.expected)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(detailStudent.paid)}</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Debt</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(detailStudent.debt)}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Contact</h4>
                {detailStudent.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${detailStudent.phone}`} className="text-blue-600 hover:underline">{detailStudent.phone}</a>
                  </div>
                )}
                {detailStudent.parent_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${detailStudent.parent_phone}`} className="text-blue-600 hover:underline">{detailStudent.parent_phone}</a>
                    <span className="text-xs text-muted-foreground">(Parent)</span>
                  </div>
                )}
              </div>

              {/* Groups */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Groups</h4>
                <div className="flex flex-wrap gap-2">
                  {detailStudent.enrollments.map((e) => (
                    <Badge key={e.group_id} variant="outline">
                      {e.group_name} — {formatCurrency(e.price)}
                      {e.discount > 0 && ` (${e.discount}% off)`}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Log call button */}
              <Button
                className="w-full"
                onClick={() => openCallDialog(detailStudent)}
              >
                <PhoneCall className="h-4 w-4 mr-2" />Log New Call
              </Button>

              {/* Call history */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Call History</h4>
                {callHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calls recorded yet.</p>
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
              Log Call — {callStudent?.first_name} {callStudent?.last_name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogCall}>
            <div className="py-4">
              <Textarea
                name="notes"
                rows={4}
                placeholder="What was discussed during the call?"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCallDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addCallMutation.isPending}>
                {addCallMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
