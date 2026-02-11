import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teachersApi, usersApi, Teacher } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Badge } from '@/components/ui/badge'
import { TeachersTableSkeleton } from '@/components/skeletons'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export function Teachers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [salaryType, setSalaryType] = useState<Teacher['salary_type']>('fixed')
  const [addSalaryType, setAddSalaryType] = useState<Teacher['salary_type']>('fixed')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [formPhone, setFormPhone] = useState('')

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
    enabled: formOpen && !selectedTeacher,
  })

  const usersWithTeacherRole = users.filter((u) => {
    const roles = (u.role || '').split(',').map((r) => r.trim())
    return roles.includes('teacher') && (u.teacher_id == null || u.teacher_id === 0)
  })

  const createTeacher = useMutation({
    mutationFn: (data: { user_id: number; subjects?: string; salary_type?: Teacher['salary_type']; salary_amount?: number; status?: Teacher['status'] }) =>
      teachersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'Teacher created successfully' })
      setFormOpen(false)
      setSelectedUserId(null)
    },
  })

  const updateTeacher = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Teacher> }) =>
      teachersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      toast({ title: 'Teacher updated successfully' })
      setFormOpen(false)
      setSelectedTeacher(null)
    },
  })

  const deleteTeacher = useMutation({
    mutationFn: (id: number) => teachersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      toast({ title: 'Teacher deleted successfully' })
      setDeleteDialogOpen(false)
      setTeacherToDelete(null)
    },
    onError: (error: Error) => {
      toast({ title: 'Cannot delete teacher', description: error.message, variant: 'destructive' })
    },
  })

  const filteredTeachers = teachers.filter(
    (t) =>
      `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      t.subjects?.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (formOpen) {
      setSalaryType(selectedTeacher?.salary_type || 'fixed')
      setFormPhone(selectedTeacher?.phone || '')
      if (!selectedTeacher) setSelectedUserId(null)
    }
  }, [formOpen, selectedTeacher])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (selectedTeacher) {
      const data = {
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        phone: formPhone,
        email: formData.get('email') as string,
        subjects: formData.get('subjects') as string,
        salary_type: (formData.get('salary_type') as Teacher['salary_type']) || 'fixed',
        salary_amount: Number(formData.get('salary_amount')) || 0,
        status: (formData.get('status') as Teacher['status']) || 'active',
      }
      updateTeacher.mutate({ id: selectedTeacher.id, data })
      return
    }
    if (!selectedUserId) {
      toast({ title: 'Select a user with teacher role', variant: 'destructive' })
      return
    }
    createTeacher.mutate({
      user_id: selectedUserId,
      subjects: (formData.get('subjects') as string) || '',
      salary_type: (formData.get('salary_type') as Teacher['salary_type']) || 'fixed',
      salary_amount: Number(formData.get('salary_amount')) || 0,
      status: (formData.get('status') as Teacher['status']) || 'active',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
          <p className="text-muted-foreground">Manage your teaching staff</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Teacher
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search teachers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <TeachersTableSkeleton />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Subjects</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No teachers found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/teachers/${teacher.id}`)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {teacher.first_name} {teacher.last_name}
                      </button>
                    </TableCell>
                    <TableCell>{teacher.phone || '-'}</TableCell>
                    <TableCell>{teacher.email || '-'}</TableCell>
                    <TableCell>{teacher.subjects || '-'}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">
                          {teacher.salary_type === 'per_student'
                            ? `${teacher.salary_amount}%`
                            : formatCurrency(teacher.salary_amount)}
                        </span>
                        <span className="text-muted-foreground text-sm ml-1">
                          {teacher.salary_type === 'per_student'
                            ? 'per student'
                            : `(${teacher.salary_type})`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={teacher.status === 'active' ? 'success' : 'secondary'}>
                        {teacher.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/teachers/${teacher.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedTeacher(teacher)
                            setFormOpen(true)
                          }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setTeacherToDelete(teacher)
                              setDeleteDialogOpen(true)
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open)
        if (!open) setSelectedTeacher(null)
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTeacher ? 'Edit Teacher' : 'Add New Teacher'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {!selectedTeacher ? (
                <>
                  <div className="space-y-2">
                    <Label>Select user (teacher role, not yet a teacher) *</Label>
                    <Select
                      value={selectedUserId != null ? String(selectedUserId) : ''}
                      onValueChange={(v) => setSelectedUserId(v ? Number(v) : null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {usersWithTeacherRole.map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.name || u.username} ({u.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {usersWithTeacherRole.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No users with teacher role that are not yet linked to a teacher. Add a user with teacher role in Settings → Users.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subjects">Subjects</Label>
                    <Input
                      id="subjects"
                      name="subjects"
                      placeholder="e.g., Math, English, Science"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Salary Type</Label>
                      <Select
                        name="salary_type"
                        value={addSalaryType}
                        onValueChange={(v) => setAddSalaryType(v as Teacher['salary_type'])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed</SelectItem>
                          <SelectItem value="per_student">Per Student</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary_amount">
                        {addSalaryType === 'per_student'
                          ? 'Percentage per student (%)'
                          : 'Salary Amount'}
                      </Label>
                      <Input
                        id="salary_amount"
                        name="salary_amount"
                        type="number"
                        step={addSalaryType === 'per_student' ? '0.1' : '0.01'}
                        min="0"
                        max={addSalaryType === 'per_student' ? '100' : undefined}
                        defaultValue="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select name="status" defaultValue="active">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name *</Label>
                      <Input
                        id="first_name"
                        name="first_name"
                        defaultValue={selectedTeacher?.first_name}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name *</Label>
                      <Input
                        id="last_name"
                        name="last_name"
                        defaultValue={selectedTeacher?.last_name}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <PhoneInput
                        id="phone"
                        value={formPhone}
                        onChange={setFormPhone}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={selectedTeacher?.email}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subjects">Subjects</Label>
                    <Input
                      id="subjects"
                      name="subjects"
                      placeholder="e.g., Math, English, Science"
                      defaultValue={selectedTeacher?.subjects}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="salary_type">Salary Type</Label>
                      <Select
                        name="salary_type"
                        value={salaryType}
                        onValueChange={(value) =>
                          setSalaryType(value as Teacher['salary_type'])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed</SelectItem>
                          <SelectItem value="per_student">Per Student</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary_amount">
                        {salaryType === 'per_student'
                          ? 'Percentage per student (%)'
                          : 'Salary Amount'}
                      </Label>
                      <Input
                        id="salary_amount"
                        name="salary_amount"
                        type="number"
                        step={salaryType === 'per_student' ? '0.1' : '0.01'}
                        min="0"
                        max={salaryType === 'per_student' ? '100' : undefined}
                        defaultValue={selectedTeacher?.salary_amount || 0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select name="status" defaultValue={selectedTeacher?.status || 'active'}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createTeacher.isPending ||
                  updateTeacher.isPending ||
                  (!selectedTeacher && !selectedUserId)
                }
              >
                {(createTeacher.isPending || updateTeacher.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {selectedTeacher ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Teacher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {teacherToDelete?.first_name}{' '}
              {teacherToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => teacherToDelete && deleteTeacher.mutate(teacherToDelete.id)}
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
