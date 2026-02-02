import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, teachersApi, User, UserRole } from '@/lib/api'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
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
import { ArrowLeft, Plus, Search, Loader2, Pencil, UserX, UserCheck } from 'lucide-react'

interface UserWithPassword extends User {
  password?: string
}

export function Users() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [toggleUser, setToggleUser] = useState<User | null>(null)
  const ROLES: UserRole[] = ['admin', 'manager', 'teacher', 'accountant', 'user']
  const [formRoles, setFormRoles] = useState<UserRole[]>(['user'])
  const [formTeacherId, setFormTeacherId] = useState<number | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  })

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: teachersApi.getAll,
    enabled: formOpen,
  })

  useEffect(() => {
    if (formOpen) {
      const r = selectedUser?.role ?? 'user'
      const list = r.split(',').map((x) => x.trim()).filter(Boolean) as UserRole[]
      setFormRoles(list.length ? list : ['user'])
      setFormTeacherId(selectedUser?.teacher_id ?? null)
    }
  }, [formOpen, selectedUser])

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const createMutation = useMutation({
    mutationFn: (data: { username: string; password: string; name: string; role: string | UserRole[]; teacher_id?: number | null; email?: string; phone?: string }) =>
      usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'User created' })
      setFormOpen(false)
    },
    onError: (err: Error & { status?: number }) => {
      toast({ title: 'Failed to create user', description: err.message, variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User> & { password?: string } }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'User updated' })
      setFormOpen(false)
      setSelectedUser(null)
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update user', description: err.message, variant: 'destructive' })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: (_, { is_active }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({ title: is_active ? 'User activated' : 'User deactivated' })
      setToggleUser(null)
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' })
      setToggleUser(null)
    },
  })

  function handleToggleActive(user: User) {
    if (user.id === currentUser?.id) {
      toast({ title: 'You cannot deactivate your own account', variant: 'destructive' })
      return
    }
    setToggleUser(user)
  }

  function confirmToggleActive() {
    if (!toggleUser) return
    toggleActiveMutation.mutate({ id: toggleUser.id, is_active: !toggleUser.is_active })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const username = formData.get('username') as string
    const name = (formData.get('name') as string)?.trim() ?? ''
    const email = (formData.get('email') as string) || undefined
    const phone = (formData.get('phone') as string) || undefined
    const role = formRoles.length ? formRoles.join(',') : 'user'
    const password = formData.get('password') as string

    if (!name) {
      toast({ title: 'Full name is required', variant: 'destructive' })
      return
    }

    if (selectedUser) {
      const data: Partial<User> & { password?: string } = { name, email, phone, role }
      if (password) data.password = password
      updateMutation.mutate({ id: selectedUser.id, data })
    } else {
      createMutation.mutate({
        username,
        name,
        password,
        role,
        email,
        phone,
        teacher_id: formRoles.includes('teacher') ? formTeacherId ?? undefined : undefined,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-muted-foreground">Manage system users and permissions</p>
        </div>
        <Button onClick={() => { setSelectedUser(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
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
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(user.role || 'user').split(',').map((r) => r.trim()).filter(Boolean).map((r) => (
                          <Badge key={r} variant="outline" className="capitalize">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'success' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUser(user)
                            setFormOpen(true)
                          }}
                          aria-label="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(user)}
                            aria-label={user.is_active ? 'Deactivate user' : 'Activate user'}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {user.is_active ? (
                              <UserX className="h-4 w-4 text-amber-600" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!toggleUser} onOpenChange={(open) => { if (!open) setToggleUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleUser?.is_active ? 'Deactivate user?' : 'Activate user?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleUser?.is_active
                ? `${toggleUser.name || toggleUser.username} will no longer be able to sign in until activated again.`
                : `${toggleUser?.name || toggleUser?.username} will be able to sign in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleActiveMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmToggleActive}
              disabled={toggleActiveMutation.isPending}
              className={toggleUser?.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {toggleActiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : toggleUser?.is_active ? (
                'Deactivate'
              ) : (
                'Activate'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setSelectedUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedUser ? 'Edit User' : 'Add New User'}</DialogTitle>
          </DialogHeader>
          <form key={selectedUser ? selectedUser.id : 'new'} onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    name="username"
                    defaultValue={selectedUser?.username}
                    required
                    disabled={!!selectedUser}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={selectedUser?.name}
                    required
                  />
                </div>
              </div>
              {!selectedUser && formRoles.includes('teacher') && (
                <div className="space-y-2">
                  <Label>Link to teacher (optional)</Label>
                  <Select
                    value={formTeacherId != null ? String(formTeacherId) : ''}
                    onValueChange={(v) => setFormTeacherId(v ? Number(v) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher record" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.filter((t) => t.status === 'active').map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.first_name} {t.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={selectedUser?.email}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={selectedUser?.phone}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Roles * (select one or more)</Label>
                <div className="flex flex-wrap gap-4">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formRoles.includes(r)}
                        onCheckedChange={(checked) => {
                          if (checked) setFormRoles((prev) => [...prev, r].sort())
                          else {
                            setFormRoles((prev) => prev.filter((x) => x !== r))
                            if (r === 'teacher') setFormTeacherId(null)
                          }
                        }}
                      />
                      <span className="capitalize text-sm">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              {!selectedUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required={!selectedUser}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {selectedUser ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
