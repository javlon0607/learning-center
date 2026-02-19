import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { groupsApi, teachersApi, Group } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TimeInput } from '@/components/ui/time-input'
import { GroupsTableSkeleton } from '@/components/skeletons'
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
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/utils'
import { useAmountInput } from '@/hooks/useAmountInput'

const statusColors = {
  active: 'success',
  inactive: 'secondary',
  completed: 'default',
} as const

export function Groups() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null)
  const [formTeacherId, setFormTeacherId] = useState<string>('')
  const [formScheduleDays, setFormScheduleDays] = useState<string[]>([])
  const [formTimeStart, setFormTimeStart] = useState<string>('')
  const [formTimeEnd, setFormTimeEnd] = useState<string>('')
  const [formRoom, setFormRoom] = useState<string>('')
  const price = useAmountInput()

  const DAYS_OF_WEEK = [
    { value: 'Mon', label: 'Mon' },
    { value: 'Tue', label: 'Tue' },
    { value: 'Wed', label: 'Wed' },
    { value: 'Thu', label: 'Thu' },
    { value: 'Fri', label: 'Fri' },
    { value: 'Sat', label: 'Sat' },
    { value: 'Sun', label: 'Sun' },
  ]

  const ROOMS = [
    { value: 'Room 1', label: 'Room 1' },
    { value: 'Room 2', label: 'Room 2' },
    { value: 'Room 3', label: 'Room 3' },
  ]

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
  })

  const createGroup = useMutation({
    mutationFn: (data: Omit<Group, 'id' | 'created_at' | 'teacher_name'>) =>
      groupsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast({ title: 'Group created successfully' })
      setFormOpen(false)
    },
  })

  const updateGroup = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Group> }) =>
      groupsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast({ title: 'Group updated successfully' })
      setFormOpen(false)
      setSelectedGroup(null)
    },
  })

  const deleteGroup = useMutation({
    mutationFn: (id: number) => groupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast({ title: 'Group deleted successfully' })
      setDeleteDialogOpen(false)
      setGroupToDelete(null)
    },
    onError: (error: Error) => {
      toast({ title: 'Cannot delete group', description: error.message, variant: 'destructive' })
    },
  })

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.subject?.toLowerCase().includes(search.toLowerCase())
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!formTeacherId) {
      toast({ title: 'Please select a teacher', variant: 'destructive' })
      return
    }

    // Validate end time is after start time
    if (formTimeStart && formTimeEnd && formTimeEnd <= formTimeStart) {
      toast({ title: 'End time must be after start time', variant: 'destructive' })
      return
    }

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name') as string,
      subject: formData.get('subject') as string,
      teacher_id: Number(formTeacherId),
      capacity: Number(formData.get('capacity')) || 15,
      price: price.numericValue(),
      status: (formData.get('status') as Group['status']) || 'active',
      schedule_days: formScheduleDays.length > 0 ? formScheduleDays.join(',') : undefined,
      schedule_time_start: formTimeStart || undefined,
      schedule_time_end: formTimeEnd || undefined,
      room: formRoom || undefined,
      student_count: 0,
    }

    if (selectedGroup) {
      updateGroup.mutate({ id: selectedGroup.id, data })
    } else {
      createGroup.mutate(data)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Groups</h1>
          <p className="text-muted-foreground">Manage your learning groups</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <GroupsTableSkeleton />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No groups found
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map((group) => {
                  const scheduleText = group.schedule_days
                    ? `${group.schedule_days}${group.schedule_time_start ? ` ${group.schedule_time_start.slice(0, 5)}` : ''}${group.schedule_time_end ? `-${group.schedule_time_end.slice(0, 5)}` : ''}`
                    : '-'
                  return (
                  <TableRow key={group.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/groups/${group.id}`)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {group.name}
                      </button>
                    </TableCell>
                    <TableCell>{group.subject || '-'}</TableCell>
                    <TableCell>{group.teacher_name || '-'}</TableCell>
                    <TableCell className="text-sm">{scheduleText}</TableCell>
                    <TableCell>{group.room || '-'}</TableCell>
                    <TableCell>
                      <span className={group.student_count >= group.capacity ? 'text-red-600 font-medium' : ''}>
                        {group.student_count}/{group.capacity}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(group.price)}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[group.status]}>
                        {group.status}
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
                          <DropdownMenuItem onClick={() => navigate(`/groups/${group.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedGroup(group)
                            setFormTeacherId(group.teacher_id?.toString() || '')
                            setFormScheduleDays(group.schedule_days ? group.schedule_days.split(',') : [])
                            setFormTimeStart(group.schedule_time_start || '')
                            setFormTimeEnd(group.schedule_time_end || '')
                            setFormRoom(group.room || '')
                            price.setFromNumber(group.price || 0)
                            setFormOpen(true)
                          }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setGroupToDelete(group)
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
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open)
        if (!open) {
          setSelectedGroup(null)
          setFormTeacherId('')
          setFormScheduleDays([])
          setFormTimeStart('')
          setFormTimeEnd('')
          setFormRoom('')
          price.reset()
        } else if (!selectedGroup) {
          setFormTeacherId('')
          setFormScheduleDays([])
          setFormTimeStart('')
          setFormTimeEnd('')
          setFormRoom('')
          price.reset()
        }
      }}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedGroup ? 'Edit Group' : 'Add New Group'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="grid gap-4 py-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={selectedGroup?.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    name="subject"
                    defaultValue={selectedGroup?.subject}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher_id">Teacher *</Label>
                <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                  <SelectTrigger className={!formTeacherId ? 'text-muted-foreground' : ''}>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.filter(t => t.status === 'active').map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id.toString()}>
                        {teacher.first_name} {teacher.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teachers.filter(t => t.status === 'active').length === 0 && (
                  <p className="text-xs text-amber-600">No active teachers available. Please add a teacher first.</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    defaultValue={selectedGroup?.capacity || 15}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price</Label>
                  <Input
                    ref={price.ref}
                    id="price"
                    name="price"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={price.value}
                    onChange={price.onChange}
                    onBlur={price.onBlur}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={selectedGroup?.status || 'active'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room">Room</Label>
                  <Select value={formRoom} onValueChange={setFormRoom}>
                    <SelectTrigger className={!formRoom ? 'text-muted-foreground' : ''}>
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOMS.map((room) => (
                        <SelectItem key={room.value} value={room.value}>
                          {room.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Schedule Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <label
                      key={day.value}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                        formScheduleDays.includes(day.value)
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <Checkbox
                        checked={formScheduleDays.includes(day.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormScheduleDays([...formScheduleDays, day.value])
                          } else {
                            setFormScheduleDays(formScheduleDays.filter((d) => d !== day.value))
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="time_start">Start Time</Label>
                  <TimeInput
                    id="time_start"
                    value={formTimeStart}
                    onChange={setFormTimeStart}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time_end">End Time</Label>
                  <TimeInput
                    id="time_end"
                    value={formTimeEnd}
                    onChange={setFormTimeEnd}
                    className={formTimeStart && formTimeEnd && formTimeEnd <= formTimeStart ? 'border-red-500 focus-within:ring-red-500' : ''}
                  />
                  {formTimeStart && formTimeEnd && formTimeEnd <= formTimeStart && (
                    <p className="text-xs text-red-500">End time must be after start time</p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createGroup.isPending || updateGroup.isPending}>
                {(createGroup.isPending || updateGroup.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {selectedGroup ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{groupToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => groupToDelete && deleteGroup.mutate(groupToDelete.id)}
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
