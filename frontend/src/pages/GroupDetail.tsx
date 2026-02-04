import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, enrollmentsApi, studentsApi } from '@/lib/api'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Users, DollarSign, User, Plus, Trash2, Percent, Search } from 'lucide-react'
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
        <CardHeader className="flex flex-row items-center justify-between">
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
        <CardContent className="p-0">
          <Table>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => unenrollStudent.mutate(enrollment.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
    </div>
  )
}
