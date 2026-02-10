import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentsApi, Student, enrollmentsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

export function useStudents(params?: { status?: string; search?: string; group_id?: string }) {
  return useQuery({
    queryKey: ['students', params],
    queryFn: () => studentsApi.getAll(params),
  })
}

export function useStudent(id: number) {
  return useQuery({
    queryKey: ['students', id],
    queryFn: () => studentsApi.getById(id),
    enabled: !!id,
  })
}

export function useStudentEnrollments(studentId: number) {
  return useQuery({
    queryKey: ['enrollments', 'student', studentId],
    queryFn: () => enrollmentsApi.getByStudent(studentId),
    enabled: !!studentId,
  })
}

export function useCreateStudent() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: Omit<Student, 'id' | 'created_at'>) =>
      studentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({
        title: 'Student created',
        description: 'The student has been added successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateStudent() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Student> }) =>
      studentsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['students', variables.id] })
      toast({
        title: 'Student updated',
        description: 'The student has been updated successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteStudent() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (id: number) => studentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({
        title: 'Student deleted',
        description: 'The student has been removed successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}
