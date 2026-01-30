import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { salarySlipsApi, teachersApi, SalarySlip } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Loader2, Check } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export function Salaries() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const { data: salarySlips = [], isLoading } = useQuery({
    queryKey: ['salary-slips'],
    queryFn: salarySlipsApi.getAll,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const createSalarySlip = useMutation({
    mutationFn: (data: Omit<SalarySlip, 'id' | 'created_at' | 'teacher_name' | 'total_amount'>) =>
      salarySlipsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
      toast({ title: 'Salary slip created successfully' })
      setFormOpen(false)
    },
  })

  const markAsPaid = useMutation({
    mutationFn: (id: number) =>
      salarySlipsApi.update(id, { status: 'paid', paid_at: new Date().toISOString().split('T')[0] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] })
      toast({ title: 'Salary slip marked as paid' })
    },
  })

  const filteredSlips = salarySlips.filter(
    (s) =>
      s.teacher_name?.toLowerCase().includes(search.toLowerCase())
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      teacher_id: Number(formData.get('teacher_id')),
      period_start: formData.get('period_start') as string,
      period_end: formData.get('period_end') as string,
      base_amount: Number(formData.get('base_amount')),
      bonus: Number(formData.get('bonus')) || 0,
      deduction: Number(formData.get('deduction')) || 0,
      status: 'pending' as const,
      notes: formData.get('notes') as string,
    }
    createSalarySlip.mutate(data)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salaries</h1>
          <p className="text-muted-foreground">Manage teacher salary slips</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Salary Slip
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Deduction</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSlips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No salary slips found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSlips.map((slip) => (
                  <TableRow key={slip.id}>
                    <TableCell className="font-medium">{slip.teacher_name}</TableCell>
                    <TableCell>
                      {formatDate(slip.period_start)} - {formatDate(slip.period_end)}
                    </TableCell>
                    <TableCell>{formatCurrency(slip.base_amount)}</TableCell>
                    <TableCell className="text-green-600">+{formatCurrency(slip.bonus)}</TableCell>
                    <TableCell className="text-red-600">-{formatCurrency(slip.deduction)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(slip.total_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={slip.status === 'paid' ? 'success' : 'warning'}>
                        {slip.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {slip.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsPaid.mutate(slip.id)}
                          disabled={markAsPaid.isPending}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Pay
                        </Button>
                      )}
                      {slip.status === 'paid' && slip.paid_at && (
                        <span className="text-sm text-muted-foreground">
                          {formatDate(slip.paid_at)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Salary Slip</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="teacher_id">Teacher *</Label>
                <Select name="teacher_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.filter(t => t.status === 'active').map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.first_name} {teacher.last_name} - {formatCurrency(teacher.salary_amount)} ({teacher.salary_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="period_start">Period Start *</Label>
                  <Input
                    id="period_start"
                    name="period_start"
                    type="date"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="period_end">Period End *</Label>
                  <Input
                    id="period_end"
                    name="period_end"
                    type="date"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base_amount">Base Amount *</Label>
                  <Input
                    id="base_amount"
                    name="base_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bonus">Bonus</Label>
                  <Input
                    id="bonus"
                    name="bonus"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deduction">Deduction</Label>
                  <Input
                    id="deduction"
                    name="deduction"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSalarySlip.isPending}>
                {createSalarySlip.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Slip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
