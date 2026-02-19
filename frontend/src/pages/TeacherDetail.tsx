import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { teachersApi, groupsApi, salarySlipsApi } from '@/lib/api'
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
import { ArrowLeft, Mail, Phone, BookOpen, DollarSign, GraduationCap } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export function TeacherDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const teacherId = Number(id)

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const teacher = teachers.find((t) => t.id === teacherId)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const teacherGroups = groups.filter((g) => g.teacher_id === teacherId)

  const { data: salarySlips = [] } = useQuery({
    queryKey: ['salary-slips'],
    queryFn: salarySlipsApi.getAll,
  })

  const teacherSlips = salarySlips.filter((s) => s.teacher_id === teacherId)

  if (!teacher) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Teacher not found</p>
        <Button onClick={() => navigate('/teachers')} className="mt-4">
          Back to Teachers
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/teachers')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {teacher.first_name} {teacher.last_name}
          </h1>
          <p className="text-muted-foreground">Teacher Profile</p>
        </div>
        <Badge variant={teacher.status === 'active' ? 'success' : 'secondary'} className="ml-auto">
          {teacher.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {teacher.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{teacher.phone}</span>
              </div>
            )}
            {teacher.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{teacher.email}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Teaching</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span>{teacher.subjects || 'No subjects assigned'}</span>
            </div>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              <span>{teacherGroups.length} Active Groups</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Salary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-semibold">
                  {teacher.salary_type === 'per_student'
                    ? `${teacher.salary_amount}%`
                    : formatCurrency(teacher.salary_amount)}
                </span>
                <span className="text-muted-foreground ml-1">
                  {teacher.salary_type === 'per_student'
                    ? 'per student'
                    : `(${teacher.salary_type})`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Groups</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Group Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teacherGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No groups assigned
                  </TableCell>
                </TableRow>
              ) : (
                teacherGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/groups/${group.id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        {group.name}
                      </button>
                    </TableCell>
                    <TableCell>{group.subject || '-'}</TableCell>
                    <TableCell>0 / {group.capacity}</TableCell>
                    <TableCell>{formatCurrency(group.price)}</TableCell>
                    <TableCell>
                      <Badge variant={group.status === 'active' ? 'success' : 'secondary'}>
                        {group.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Salary Slips</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Deduction</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teacherSlips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No salary slips
                  </TableCell>
                </TableRow>
              ) : (
                teacherSlips.slice(0, 5).map((slip) => (
                  <TableRow key={slip.id}>
                    <TableCell>
                      {formatDate(slip.period_start)} - {formatDate(slip.period_end)}
                    </TableCell>
                    <TableCell>{formatCurrency(slip.base_amount)}</TableCell>
                    <TableCell className="text-green-600">+{formatCurrency(slip.bonus)}</TableCell>
                    <TableCell className="text-red-600">-{formatCurrency(slip.deduction)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(slip.total)}</TableCell>
                    <TableCell>
                      <Badge variant={slip.status === 'paid' ? 'success' : 'warning'}>
                        {slip.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
