import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, enrollmentsApi, studentsApi, Group } from '@/lib/api'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Users, DollarSign, User, Plus, Trash2 } from 'lucide-react'
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
  const availableStudents = students.filter(
    (s) => s.status === 'active' && !enrolledStudentIds.has(s.id)
  )

  const enrollStudent = useMutation({
    mutationFn: ({ studentId, groupId }: { studentId: number; groupId: number }) =>
      enrollmentsApi.create(studentId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      toast({ title: 'Student enrolled successfully' })
      setEnrollDialogOpen(false)
      setSelectedStudentId('')
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
                <TableHead>Enrolled Date</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No students enrolled
                  </TableCell>
                </TableRow>
              ) : (
                enrollments.map((enrollment) => (
                  <TableRow key={enrollment.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/students/${enrollment.student_id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        {enrollment.student_name}
                      </button>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll Student</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Select Student</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {availableStudents.map((student) => (
                  <SelectItem key={student.id} value={student.id.toString()}>
                    {student.first_name} {student.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableStudents.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                No available students to enroll
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                enrollStudent.mutate({
                  studentId: Number(selectedStudentId),
                  groupId,
                })
              }
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
