import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Student, referrersApi, sourceOptions, Referrer } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

const studentSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  dob: z.string().min(1, 'Date of birth is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  parent_name: z.string().optional(),
  parent_phone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'graduated', 'suspended']),
  notes: z.string().optional(),
  source: z.string().min(1, 'Source is required'),
})

type StudentFormData = z.infer<typeof studentSchema> & {
  referred_by_type?: 'student' | 'teacher' | 'user'
  referred_by_id?: number
}

interface StudentFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: StudentFormData) => void
  student?: Student | null
  isLoading?: boolean
}

export function StudentForm({
  open,
  onClose,
  onSubmit,
  student,
  isLoading,
}: StudentFormProps) {
  const isEditing = !!student
  const [referrerType, setReferrerType] = useState<'student' | 'teacher' | 'user'>(student?.referred_by_type || 'student')
  const [referrerId, setReferrerId] = useState<number | undefined>(student?.referred_by_id ?? undefined)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
    defaultValues: student ? {
      first_name: student.first_name,
      last_name: student.last_name,
      dob: student.dob || '',
      phone: student.phone || '',
      email: student.email || '',
      parent_name: student.parent_name || '',
      parent_phone: student.parent_phone || '',
      status: student.status,
      notes: student.notes || '',
      source: student.source || 'walk_in',
    } : {
      first_name: '',
      last_name: '',
      dob: '',
      phone: '',
      email: '',
      parent_name: '',
      parent_phone: '',
      status: 'active',
      notes: '',
      source: '',
    },
  })

  // Reset form with correct values when dialog opens or student changes
  useEffect(() => {
    if (open) {
      reset(student ? {
        first_name: student.first_name,
        last_name: student.last_name,
        dob: student.dob || '',
        phone: student.phone || '',
        email: student.email || '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        status: student.status,
        notes: student.notes || '',
        source: student.source || 'walk_in',
      } : {
        first_name: '',
        last_name: '',
        dob: '',
        phone: '',
        email: '',
        parent_name: '',
        parent_phone: '',
        status: 'active',
        notes: '',
        source: '',
      })
      setReferrerType(student?.referred_by_type || 'student')
      setReferrerId(student?.referred_by_id ?? undefined)
    }
  }, [open, student, reset])

  const status = watch('status')
  const source = watch('source')

  // Fetch referrers when source is referral
  const { data: referrers = [] } = useQuery({
    queryKey: ['referrers', referrerType],
    queryFn: () => referrersApi.getByType(referrerType),
    enabled: source === 'referral',
  })

  function handleFormSubmit(data: StudentFormData) {
    const submitData: StudentFormData = { ...data }
    if (data.source === 'referral' && referrerId) {
      submitData.referred_by_type = referrerType
      submitData.referred_by_id = referrerId
    }
    onSubmit(submitData)
  }

  function handleClose() {
    reset()
    setReferrerType('student')
    setReferrerId(undefined)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {student ? 'Edit Student' : 'Add New Student'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  {...register('first_name')}
                  placeholder="Enter first name"
                />
                {errors.first_name && (
                  <p className="text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  {...register('last_name')}
                  placeholder="Enter last name"
                />
                {errors.last_name && (
                  <p className="text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth *</Label>
                <Controller
                  name="dob"
                  control={control}
                  render={({ field }) => (
                    <DateInput
                      id="dob"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.dob && (
                  <p className="text-sm text-red-600">{errors.dob.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setValue('status', value as StudentFormData['status'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="graduated">Graduated</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <PhoneInput
                      id="phone"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="Enter email address"
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="parent_name">Parent/Guardian Name</Label>
                <Input
                  id="parent_name"
                  {...register('parent_name')}
                  placeholder="Enter parent name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent_phone">Parent/Guardian Phone</Label>
                <Controller
                  name="parent_phone"
                  control={control}
                  render={({ field }) => (
                    <PhoneInput
                      id="parent_phone"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            {/* Source - only show when creating */}
            {!isEditing && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source">Source *</Label>
                  <Select
                    value={source}
                    onValueChange={(value) => setValue('source', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.source && (
                    <p className="text-sm text-red-600">{errors.source.message}</p>
                  )}
                </div>

                {/* Referral picker */}
                {source === 'referral' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Referrer Type</Label>
                      <Select
                        value={referrerType}
                        onValueChange={(value) => {
                          setReferrerType(value as 'student' | 'teacher' | 'user')
                          setReferrerId(undefined)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="teacher">Teacher</SelectItem>
                          <SelectItem value="user">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Referred By</Label>
                      <Select
                        value={referrerId?.toString() || ''}
                        onValueChange={(value) => setReferrerId(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select person" />
                        </SelectTrigger>
                        <SelectContent>
                          {referrers.map((r: Referrer) => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Any additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {student ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
