import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi, Lead } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, MoreHorizontal, Pencil, Trash2, UserPlus, Loader2, Phone, Mail, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const statusColors = {
  new: 'default',
  contacted: 'secondary',
  trial: 'warning',
  enrolled: 'success',
  lost: 'destructive',
} as const

const statusLabels = {
  new: 'New',
  contacted: 'Contacted',
  trial: 'Trial',
  enrolled: 'Enrolled',
  lost: 'Lost',
}

export function Leads() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null)

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: leadsApi.getAll,
  })

  const createLead = useMutation({
    mutationFn: (data: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'converted_student_id'>) =>
      leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast({ title: 'Lead created successfully' })
      setFormOpen(false)
    },
  })

  const updateLead = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Lead> }) =>
      leadsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast({ title: 'Lead updated successfully' })
      setFormOpen(false)
      setSelectedLead(null)
    },
  })

  const deleteLead = useMutation({
    mutationFn: (id: number) => leadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast({ title: 'Lead deleted successfully' })
      setDeleteDialogOpen(false)
      setLeadToDelete(null)
    },
  })

  const convertLead = useMutation({
    mutationFn: (id: number) => leadsApi.convert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: 'Lead converted to student successfully' })
      setConvertDialogOpen(false)
      setLeadToConvert(null)
    },
  })

  const filteredLeads = leads.filter(
    (l) =>
      `${l.first_name} ${l.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.toLowerCase().includes(search.toLowerCase())
  )

  const leadsByStatus = {
    new: filteredLeads.filter((l) => l.status === 'new'),
    contacted: filteredLeads.filter((l) => l.status === 'contacted'),
    trial: filteredLeads.filter((l) => l.status === 'trial'),
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      parent_name: formData.get('parent_name') as string,
      parent_phone: formData.get('parent_phone') as string,
      source: formData.get('source') as string,
      status: (formData.get('status') as Lead['status']) || 'new',
      notes: formData.get('notes') as string,
      follow_up_date: formData.get('follow_up_date') as string || undefined,
    }

    if (selectedLead) {
      updateLead.mutate({ id: selectedLead.id, data })
    } else {
      createLead.mutate(data)
    }
  }

  function LeadCard({ lead }: { lead: Lead }) {
    return (
      <Card className="mb-3">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium">
                {lead.first_name} {lead.last_name}
              </h4>
              {lead.phone && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Phone className="h-3 w-3" />
                  {lead.phone}
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {lead.email}
                </div>
              )}
              {lead.follow_up_date && (
                <div className="flex items-center gap-1 text-sm text-orange-600 mt-1">
                  <Calendar className="h-3 w-3" />
                  Follow-up: {formatDate(lead.follow_up_date)}
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setSelectedLead(lead)
                  setFormOpen(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {lead.status !== 'enrolled' && lead.status !== 'lost' && (
                  <DropdownMenuItem onClick={() => {
                    setLeadToConvert(lead)
                    setConvertDialogOpen(true)
                  }}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Convert to Student
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setLeadToDelete(lead)
                    setDeleteDialogOpen(true)
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {lead.source && (
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                {lead.source}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-muted-foreground">Manage your prospective students</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
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
        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="default">{leadsByStatus.new.length}</Badge>
                  <h3 className="font-medium">New</h3>
                </div>
                {leadsByStatus.new.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="secondary">{leadsByStatus.contacted.length}</Badge>
                  <h3 className="font-medium">Contacted</h3>
                </div>
                {leadsByStatus.contacted.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="warning">{leadsByStatus.trial.length}</Badge>
                  <h3 className="font-medium">Trial</h3>
                </div>
                {leadsByStatus.trial.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <div className="grid gap-4">
              {filteredLeads.map((lead) => (
                <Card key={lead.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <h4 className="font-medium">
                          {lead.first_name} {lead.last_name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {lead.phone || lead.email || 'No contact info'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={statusColors[lead.status]}>
                        {statusLabels[lead.status]}
                      </Badge>
                      {lead.source && (
                        <Badge variant="outline">{lead.source}</Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedLead(lead)
                            setFormOpen(true)
                          }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {lead.status !== 'enrolled' && lead.status !== 'lost' && (
                            <DropdownMenuItem onClick={() => {
                              setLeadToConvert(lead)
                              setConvertDialogOpen(true)
                            }}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Convert to Student
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setLeadToDelete(lead)
                              setDeleteDialogOpen(true)
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open)
        if (!open) setSelectedLead(null)
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    defaultValue={selectedLead?.first_name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    defaultValue={selectedLead?.last_name}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={selectedLead?.phone}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={selectedLead?.email}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_name">Parent Name</Label>
                  <Input
                    id="parent_name"
                    name="parent_name"
                    defaultValue={selectedLead?.parent_name}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_phone">Parent Phone</Label>
                  <Input
                    id="parent_phone"
                    name="parent_phone"
                    defaultValue={selectedLead?.parent_phone}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Select name="source" defaultValue={selectedLead?.source}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="social_media">Social Media</SelectItem>
                      <SelectItem value="walk_in">Walk-in</SelectItem>
                      <SelectItem value="phone">Phone Inquiry</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={selectedLead?.status || 'new'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="follow_up_date">Follow-up Date</Label>
                  <Input
                    id="follow_up_date"
                    name="follow_up_date"
                    type="date"
                    defaultValue={selectedLead?.follow_up_date}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={selectedLead?.notes}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createLead.isPending || updateLead.isPending}>
                {(createLead.isPending || updateLead.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {selectedLead ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {leadToDelete?.first_name}{' '}
              {leadToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leadToDelete && deleteLead.mutate(leadToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Student</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new student record for {leadToConvert?.first_name}{' '}
              {leadToConvert?.last_name} and mark this lead as enrolled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leadToConvert && convertLead.mutate(leadToConvert.id)}
            >
              Convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
