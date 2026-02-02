import { useState } from 'react'
import { useStudents, useCreateStudent, useUpdateStudent, useDeleteStudent } from '@/hooks/useStudents'
import { Student } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { StudentForm } from '@/components/students/StudentForm'
import { StudentTable } from '@/components/students/StudentTable'
import { Plus, Search } from 'lucide-react'

export function Students() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null)

  const { data: students = [], isLoading } = useStudents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
  })
  const createStudent = useCreateStudent()
  const updateStudent = useUpdateStudent()
  const deleteStudent = useDeleteStudent()

  function handleCreateOrUpdate(data: Omit<Student, 'id' | 'created_at'>) {
    if (selectedStudent) {
      updateStudent.mutate(
        { id: selectedStudent.id, data },
        { onSuccess: () => handleCloseForm() }
      )
    } else {
      createStudent.mutate(data, { onSuccess: () => handleCloseForm() })
    }
  }

  function handleEdit(student: Student) {
    setSelectedStudent(student)
    setFormOpen(true)
  }

  function handleDelete(student: Student) {
    setStudentToDelete(student)
    setDeleteDialogOpen(true)
  }

  function confirmDelete() {
    if (studentToDelete) {
      deleteStudent.mutate(studentToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false)
          setStudentToDelete(null)
        },
      })
    }
  }

  function handleCloseForm() {
    setFormOpen(false)
    setSelectedStudent(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track all student records
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-navy-950 hover:bg-navy-900">
          <Plus className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-card rounded-xl border border-border/60">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
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
        {(search || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading students...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-card rounded-xl border border-border/60">
          <div className="p-4 rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-medium text-foreground">No students found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by adding your first student'}
            </p>
          </div>
          {!search && statusFilter === 'all' && (
            <Button onClick={() => setFormOpen(true)} className="mt-2">
              <Plus className="mr-2 h-4 w-4" />
              Add Student
            </Button>
          )}
        </div>
      ) : (
        <StudentTable
          students={students}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <StudentForm
        open={formOpen}
        onClose={handleCloseForm}
        onSubmit={handleCreateOrUpdate}
        student={selectedStudent}
        isLoading={createStudent.isPending || updateStudent.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {studentToDelete?.first_name}{' '}
              {studentToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
