import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, enrollmentsApi, studentsApi, groupTransfersApi, Enrollment } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Users, DollarSign, User, Plus, Trash2, Percent, Search, ArrowRightLeft, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCurrency } from '@/lib/utils'

const statusColors = {
  active: 'success',
  inactive: 'secondary',
  completed: 'default',
} as const

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const groupId = Number(id)
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')
  const [discountPercentage, setDiscountPercentage] = useState<string>('0')
  const [studentSearch, setStudentSearch] = useState('')
  const [enrollmentToRemove, setEnrollmentToRemove] = useState<{ id: number; studentName: string } | null>(null)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [enrollmentToTransfer, setEnrollmentToTransfer] = useState<Enrollment | null>(null)
  const [targetGroupId, setTargetGroupId] = useState<string>('')
  const [transferReason, setTransferReason] = useState('')
  const [transferDiscount, setTransferDiscount] = useState('0')

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const group = groups.find((g) => g.id === groupId)

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', 'group', groupId],
    queryFn: () => enrollmentsApi.getByGroup(groupId),
    enabled: !!groupId,
  })

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
  })

  const enrolledStudentIds = new Set(enrollments.map((e) => e.student_id))

  // Get all active students not enrolled in THIS group, sorted:
  // 1. Students with no enrollments first
  // 2. Then alphabetically by name
  const availableStudents = students
    .filter((s) => s.status === 'active' && !enrolledStudentIds.has(s.id))
    .map((s) => ({
      ...s,
      hasEnrollments: (s.enrollments && s.enrollments.length > 0) || (s.groups_list && s.groups_list.trim() !== ''),
      groupNames: s.enrollments?.map(e => e.group_name).join(', ') || s.groups_list || '',
    }))
    .sort((a, b) => {
      // Students without enrollments come first
      if (!a.hasEnrollments && b.hasEnrollments) return -1
      if (a.hasEnrollments && !b.hasEnrollments) return 1
      // Then sort by name
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase()
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })

  // Filter by search query
  const filteredStudents = availableStudents.filter((s) => {
    if (!studentSearch.trim()) return true
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase()
    return fullName.includes(studentSearch.toLowerCase())
  })

  const enrollStudent = useMutation({
    mutationFn: ({ studentId, groupId, discountPct }: { studentId: number; groupId: number; discountPct: number }) =>
      enrollmentsApi.create(studentId, groupId, discountPct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      toast({ title: 'Student enrolled successfully' })
      setEnrollDialogOpen(false)
      setSelectedStudentId('')
      setDiscountPercentage('0')
    },
  })

  const unenrollStudent = useMutation({
    mutationFn: (enrollmentId: number) => enrollmentsApi.delete(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      toast({ title: 'Student removed from group' })
    },
  })

  const transferStudent = useMutation({
    mutationFn: (data: {
      student_id: number
      from_group_id: number
      to_group_id: number
      reason?: string
      discount_percentage?: number
    }) => groupTransfersApi.transfer(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({
        title: 'Student transferred',
        description: result.message,
      })
      setTransferDialogOpen(false)
      setEnrollmentToTransfer(null)
      setTargetGroupId('')
      setTransferReason('')
      setTransferDiscount('0')
    },
    onError: (err: Error) => {
      toast({ title: 'Transfer failed', description: err.message, variant: 'destructive' })
    },
  })

  // Groups available for transfer (all active groups except current)
  const transferableGroups = groups.filter(
    (g) => g.id !== groupId && g.status === 'active'
  )

  if (!group) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Group not found</p>
        <Button onClick={() => navigate('/groups')} className="mt-4">
          Back to Groups
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/groups')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="text-muted-foreground">{group.subject || 'No subject'}</p>
        </div>
        <Badge variant={statusColors[group.status]} className="ml-auto">
          {group.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teacher</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {group.teacher_name || 'Unassigned'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enrollments.length} / {group.capacity}
            </div>
            <p className="text-xs text-muted-foreground">
              {group.capacity - enrollments.length} spots available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(group.price)}
            </div>
            <p className="text-xs text-muted-foreground">per month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Enrolled Students</CardTitle>
          <Button
            size="sm"
            onClick={() => setEnrollDialogOpen(true)}
            disabled={enrollments.length >= group.capacity}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Monthly Rate</TableHead>
                <TableHead>Enrolled Date</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No students enrolled
                  </TableCell>
                </TableRow>
              ) : (
                enrollments.map((enrollment) => {
                  const discount = enrollment.discount_percentage || 0
                  const monthlyRate = group.price * (1 - discount / 100)
                  return (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <button
                          onClick={() => navigate(`/students/${enrollment.student_id}`)}
                          className="text-blue-600 hover:underline"
                        >
                          {enrollment.student_name}
                        </button>
                      </TableCell>
                      <TableCell>
                        {discount > 0 ? (
                          <Badge variant="secondary" className="text-green-600">
                            {discount}% off
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(monthlyRate)}
                      </TableCell>
                      <TableCell>{enrollment.enrolled_at}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEnrollmentToTransfer(enrollment)
                              setTransferDiscount(String(enrollment.discount_percentage || 0))
                              setTransferDialogOpen(true)
                            }}
                            title="Transfer to another group"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEnrollmentToRemove({ id: enrollment.id, studentName: enrollment.student_name || 'this student' })}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={enrollDialogOpen} onOpenChange={(open) => {
        setEnrollDialogOpen(open)
        if (!open) {
          setSelectedStudentId('')
          setDiscountPercentage('0')
          setStudentSearch('')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-[200px] rounded-md border">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {availableStudents.length === 0 ? 'No available students' : 'No students found'}
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => setSelectedStudentId(student.id.toString())}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedStudentId === student.id.toString()
                            ? 'bg-blue-100 text-blue-900'
                            : 'hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {student.first_name} {student.last_name}
                          </span>
                          {student.hasEnrollments && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0">
                              {student.groupNames}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              {selectedStudentId && (
                <p className="text-sm text-blue-600">
                  Selected: {filteredStudents.find(s => s.id.toString() === selectedStudentId)?.first_name} {filteredStudents.find(s => s.id.toString() === selectedStudentId)?.last_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount">Discount % (0–100)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="discount"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPercentage}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || v === '-') {
                      setDiscountPercentage(v)
                      return
                    }
                    const n = Number(v)
                    if (!Number.isFinite(n)) return
                    setDiscountPercentage(String(Math.max(0, Math.min(100, n))))
                  }}
                  className="w-24"
                />
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
              {Number(discountPercentage) > 0 && (
                <p className="text-sm text-muted-foreground">
                  Student will pay {formatCurrency(group.price * (1 - Number(discountPercentage) / 100))} per month
                  <span className="text-green-600"> ({discountPercentage}% off)</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pct = Number(discountPercentage)
                if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                  toast({
                    title: 'Invalid discount',
                    description: 'Discount must be between 0 and 100%.',
                    variant: 'destructive',
                  })
                  return
                }
                enrollStudent.mutate({
                  studentId: Number(selectedStudentId),
                  groupId,
                  discountPct: pct,
                })
              }}
              disabled={!selectedStudentId || enrollStudent.isPending}
            >
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!enrollmentToRemove} onOpenChange={(open) => { if (!open) setEnrollmentToRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium">{enrollmentToRemove?.studentName}</span> from this group? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (enrollmentToRemove) {
                  unenrollStudent.mutate(enrollmentToRemove.id)
                  setEnrollmentToRemove(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => {
        setTransferDialogOpen(open)
        if (!open) {
          setEnrollmentToTransfer(null)
          setTargetGroupId('')
          setTransferReason('')
          setTransferDiscount('0')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">Student:</span>{' '}
                <span className="font-medium">{enrollmentToTransfer?.student_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">From:</span>{' '}
                <span className="font-medium">{group?.name}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Transfer to Group *</Label>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target group" />
                </SelectTrigger>
                <SelectContent>
                  {transferableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name} ({formatCurrency(g.price)}/mo)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferableGroups.length === 0 && (
                <p className="text-xs text-amber-600">No other active groups available</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-discount">Discount % in new group</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="transfer-discount"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={transferDiscount}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || v === '-') {
                      setTransferDiscount(v)
                      return
                    }
                    const n = Number(v)
                    if (!Number.isFinite(n)) return
                    setTransferDiscount(String(Math.max(0, Math.min(100, n))))
                  }}
                  className="w-24"
                />
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-reason">Reason (optional)</Label>
              <Textarea
                id="transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g., Schedule conflict, level change, etc."
                rows={2}
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> If the student has already paid for the current month in this group,
                the payment will be credited to the new group automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!enrollmentToTransfer || !targetGroupId) return
                const pct = Number(transferDiscount)
                if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                  toast({
                    title: 'Invalid discount',
                    description: 'Discount must be between 0 and 100%.',
                    variant: 'destructive',
                  })
                  return
                }
                transferStudent.mutate({
                  student_id: enrollmentToTransfer.student_id,
                  from_group_id: groupId,
                  to_group_id: Number(targetGroupId),
                  reason: transferReason || undefined,
                  discount_percentage: pct,
                })
              }}
              disabled={!targetGroupId || transferStudent.isPending}
            >
              {transferStudent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
