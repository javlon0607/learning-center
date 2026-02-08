import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi, groupsApi, referrersApi, Lead, LeadInteraction, sourceOptions, Referrer } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  DropdownMenuSeparator,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, UserPlus, Loader2,
  Phone, Mail, Calendar, Clock, MessageSquare, Flame, ThermometerSun,
  Snowflake, ArrowRight, CheckCircle2, XCircle, AlertTriangle,
  Users, Target, TrendingUp, CalendarCheck, MessageCircle
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Status configuration for learning center pipeline
const statusConfig = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Plus },
  contacted: { label: 'Contacted', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Phone },
  interested: { label: 'Interested', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Target },
  trial_scheduled: { label: 'Trial Scheduled', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: CalendarCheck },
  trial_completed: { label: 'Trial Done', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: CheckCircle2 },
  negotiating: { label: 'Negotiating', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: MessageSquare },
  enrolled: { label: 'Enrolled', color: 'bg-green-100 text-green-800 border-green-200', icon: UserPlus },
  lost: { label: 'Lost', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
  postponed: { label: 'Postponed', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: Clock },
} as const

const priorityConfig = {
  hot: { label: 'Hot', color: 'bg-red-500 text-white', icon: Flame },
  warm: { label: 'Warm', color: 'bg-orange-500 text-white', icon: ThermometerSun },
  cold: { label: 'Cold', color: 'bg-blue-500 text-white', icon: Snowflake },
} as const

const interactionTypes = [
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp/Telegram', icon: MessageCircle },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'trial', label: 'Trial Class', icon: CalendarCheck },
  { value: 'note', label: 'Note', icon: MessageSquare },
]

// Pipeline stages for kanban (active leads only)
const pipelineStages = ['new', 'contacted', 'interested', 'trial_scheduled', 'trial_completed', 'negotiating'] as const

export function Leads() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // State
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterSource, setFilterSource] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null)
  const [interactionDialogOpen, setInteractionDialogOpen] = useState(false)
  const [interactionLead, setInteractionLead] = useState<Lead | null>(null)

  // Form state
  const [formPhone, setFormPhone] = useState('')
  const [formParentPhone, setFormParentPhone] = useState('')
  const [formFollowUpDate, setFormFollowUpDate] = useState('')
  const [formTrialDate, setFormTrialDate] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formReferrerType, setFormReferrerType] = useState<'student' | 'teacher' | 'user'>('student')
  const [formReferrerId, setFormReferrerId] = useState<number | undefined>()

  // Queries
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: leadsApi.getAll,
  })

  const { data: stats } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: leadsApi.getStats,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.getAll,
  })

  const { data: referrers = [] } = useQuery({
    queryKey: ['referrers', formReferrerType],
    queryFn: () => referrersApi.getByType(formReferrerType),
    enabled: formSource === 'referral',
  })

  const { data: interactions = [] } = useQuery({
    queryKey: ['lead-interactions', detailLead?.id],
    queryFn: () => detailLead ? leadsApi.getInteractions(detailLead.id) : Promise.resolve([]),
    enabled: !!detailLead,
  })

  // Mutations
  const createLead = useMutation({
    mutationFn: (data: Parameters<typeof leadsApi.create>[0]) => leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
      toast({ title: 'Lead created successfully' })
      closeForm()
    },
  })

  const updateLead = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Lead> }) => leadsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
      toast({ title: 'Lead updated successfully' })
      closeForm()
    },
  })

  const deleteLead = useMutation({
    mutationFn: (id: number) => leadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
      toast({ title: 'Lead deleted successfully' })
      setDeleteDialogOpen(false)
      setLeadToDelete(null)
    },
  })

  const convertLead = useMutation({
    mutationFn: (id: number) => leadsApi.convert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      toast({ title: 'Lead converted to student!' })
      setConvertDialogOpen(false)
      setLeadToConvert(null)
      setDetailLead(null)
    },
  })

  const addInteraction = useMutation({
    mutationFn: ({ leadId, data }: { leadId: number; data: Parameters<typeof leadsApi.addInteraction>[1] }) =>
      leadsApi.addInteraction(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-interactions', interactionLead?.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast({ title: 'Interaction added' })
      setInteractionDialogOpen(false)
      setInteractionLead(null)
    },
  })

  // Filtering
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch = !search ||
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        l.phone?.toLowerCase().includes(search.toLowerCase()) ||
        l.parent_phone?.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = filterStatus === 'all' || l.status === filterStatus
      const matchesPriority = filterPriority === 'all' || l.priority === filterPriority
      const matchesSource = filterSource === 'all' || l.source === filterSource
      return matchesSearch && matchesStatus && matchesPriority && matchesSource
    })
  }, [leads, search, filterStatus, filterPriority, filterSource])

  const leadsByStage = useMemo(() => {
    const result: Record<string, Lead[]> = {}
    pipelineStages.forEach(stage => {
      result[stage] = filteredLeads.filter(l => l.status === stage)
    })
    return result
  }, [filteredLeads])

  const closedLeads = useMemo(() =>
    filteredLeads.filter(l => ['enrolled', 'lost', 'postponed'].includes(l.status)),
    [filteredLeads]
  )

  // Helpers
  function closeForm() {
    setFormOpen(false)
    setSelectedLead(null)
    setFormPhone('')
    setFormParentPhone('')
    setFormFollowUpDate('')
    setFormTrialDate('')
    setFormSource('')
    setFormReferrerType('student')
    setFormReferrerId(undefined)
  }

  function openEditForm(lead: Lead) {
    setSelectedLead(lead)
    setFormPhone(lead.phone || '')
    setFormParentPhone(lead.parent_phone || '')
    setFormFollowUpDate(lead.follow_up_date || '')
    setFormTrialDate(lead.trial_date || '')
    setFormSource(lead.source || 'walk_in')
    setFormReferrerType(lead.referred_by_type || 'student')
    setFormReferrerId(lead.referred_by_id)
    setFormOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data: Record<string, unknown> = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      phone: formPhone,
      email: formData.get('email') as string,
      parent_name: formData.get('parent_name') as string,
      parent_phone: formParentPhone,
      source: formSource,
      status: (formData.get('status') as Lead['status']) || 'new',
      priority: (formData.get('priority') as Lead['priority']) || 'warm',
      notes: formData.get('notes') as string,
      follow_up_date: formFollowUpDate || undefined,
      interested_courses: formData.get('interested_courses') as string,
      trial_date: formTrialDate || undefined,
      trial_group_id: formData.get('trial_group_id') ? Number(formData.get('trial_group_id')) : undefined,
      birth_year: formData.get('birth_year') ? Number(formData.get('birth_year')) : undefined,
      preferred_schedule: formData.get('preferred_schedule') as string,
      budget: formData.get('budget') as string,
      referred_by_type: formSource === 'referral' ? formReferrerType : undefined,
      referred_by_id: formSource === 'referral' ? formReferrerId : undefined,
    }

    if (selectedLead) {
      updateLead.mutate({ id: selectedLead.id, data })
    } else {
      createLead.mutate(data as Parameters<typeof leadsApi.create>[0])
    }
  }

  function handleQuickStatusChange(lead: Lead, newStatus: Lead['status']) {
    updateLead.mutate({ id: lead.id, data: { status: newStatus } })
  }

  function handleInteractionSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!interactionLead) return
    const formData = new FormData(e.currentTarget)
    addInteraction.mutate({
      leadId: interactionLead.id,
      data: {
        type: formData.get('type') as LeadInteraction['type'],
        notes: formData.get('notes') as string,
        completed_at: new Date().toISOString(),
      }
    })
  }

  function isOverdue(date?: string) {
    if (!date) return false
    return new Date(date) < new Date(new Date().toDateString())
  }

  function isToday(date?: string) {
    if (!date) return false
    return new Date(date).toDateString() === new Date().toDateString()
  }

  function clearLeadFilters() {
    setSearch('')
    setFilterStatus('all')
    setFilterPriority('all')
    setFilterSource('all')
  }

  // Stat Cards Component
  function StatCards() {
    const activeLeads = leads.filter(l => !['enrolled', 'lost', 'postponed'].includes(l.status)).length
    const noFilter = filterStatus === 'all' && filterPriority === 'all' && filterSource === 'all' && !search
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", noFilter && "ring-2 ring-blue-500")}
          onClick={clearLeadFilters}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeLeads}</p>
                <p className="text-xs text-muted-foreground">Active Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", filterPriority === 'hot' && "ring-2 ring-red-500")}
          onClick={() => { clearLeadFilters(); setFilterPriority('hot'); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Flame className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.hot_leads || 0}</p>
                <p className="text-xs text-muted-foreground">Hot Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", (stats?.follow_ups_overdue || 0) > 0 ? "bg-red-100" : "bg-amber-100")}>
                <AlertTriangle className={cn("h-5 w-5", (stats?.follow_ups_overdue || 0) > 0 ? "text-red-600" : "text-amber-600")} />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats?.follow_ups_today || 0) + (stats?.follow_ups_overdue || 0)}</p>
                <p className="text-xs text-muted-foreground">Follow-ups Due</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", filterStatus === 'trial_scheduled' && "ring-2 ring-purple-500")}
          onClick={() => { clearLeadFilters(); setFilterStatus('trial_scheduled'); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CalendarCheck className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.trials_scheduled || 0}</p>
                <p className="text-xs text-muted-foreground">Trials Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", filterStatus === 'enrolled' && "ring-2 ring-green-500")}
          onClick={() => { clearLeadFilters(); setFilterStatus('enrolled'); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.conversions_this_month || 0}</p>
                <p className="text-xs text-muted-foreground">Enrolled (Month)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn("cursor-pointer transition-shadow hover:shadow-md", filterStatus === 'lost' && "ring-2 ring-gray-500")}
          onClick={() => { clearLeadFilters(); setFilterStatus('lost'); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Target className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.by_status?.lost || 0}</p>
                <p className="text-xs text-muted-foreground">Lost (Total)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Lead Card Component
  function LeadCard({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
    const priority = lead.priority || 'warm'
    const PriorityIcon = priorityConfig[priority]?.icon || ThermometerSun
    const followUpOverdue = isOverdue(lead.follow_up_date)
    const followUpToday = isToday(lead.follow_up_date)
    const trialToday = isToday(lead.trial_date)

    return (
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-shadow",
          followUpOverdue && "border-red-300 bg-red-50/50",
          followUpToday && !followUpOverdue && "border-amber-300 bg-amber-50/50",
          trialToday && "border-purple-300 bg-purple-50/50"
        )}
        onClick={() => setDetailLead(lead)}
      >
        <CardContent className={cn("p-3", compact && "p-2")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium truncate">
                  {lead.first_name} {lead.last_name}
                </h4>
                <Badge className={cn("h-5 px-1.5 text-xs", priorityConfig[priority].color)}>
                  <PriorityIcon className="h-3 w-3" />
                </Badge>
              </div>
              {lead.phone && (
                <p className="text-sm text-muted-foreground truncate">{lead.phone}</p>
              )}
              {lead.interested_courses && (
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {lead.interested_courses}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => openEditForm(lead)}>
                  <Pencil className="mr-2 h-4 w-4" />Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setInteractionLead(lead); setInteractionDialogOpen(true); }}>
                  <MessageSquare className="mr-2 h-4 w-4" />Add Note
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {lead.status !== 'enrolled' && (
                  <DropdownMenuItem onClick={() => { setLeadToConvert(lead); setConvertDialogOpen(true); }}>
                    <UserPlus className="mr-2 h-4 w-4" />Convert to Student
                  </DropdownMenuItem>
                )}
                {!['enrolled', 'lost'].includes(lead.status) && (
                  <DropdownMenuItem onClick={() => handleQuickStatusChange(lead, 'lost')} className="text-red-600">
                    <XCircle className="mr-2 h-4 w-4" />Mark as Lost
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setLeadToDelete(lead); setDeleteDialogOpen(true); }} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {lead.source && (
              <Badge variant="outline" className="text-xs h-5">
                {sourceOptions.find(s => s.value === lead.source)?.label || lead.source}
              </Badge>
            )}
            {lead.follow_up_date && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs h-5",
                  followUpOverdue && "bg-red-100 text-red-700 border-red-200",
                  followUpToday && !followUpOverdue && "bg-amber-100 text-amber-700 border-amber-200"
                )}
              >
                <Calendar className="h-3 w-3 mr-1" />
                {formatDate(lead.follow_up_date)}
              </Badge>
            )}
            {lead.trial_date && (
              <Badge
                variant="outline"
                className={cn("text-xs h-5", trialToday && "bg-purple-100 text-purple-700 border-purple-200")}
              >
                <CalendarCheck className="h-3 w-3 mr-1" />
                Trial: {formatDate(lead.trial_date)}
              </Badge>
            )}
            {(lead.interaction_count || 0) > 0 && (
              <Badge variant="outline" className="text-xs h-5">
                <MessageSquare className="h-3 w-3 mr-1" />{lead.interaction_count}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Pipeline Column Component
  function PipelineColumn({ stage, leads: stageLeads }: { stage: typeof pipelineStages[number]; leads: Lead[] }) {
    const config = statusConfig[stage]
    const Icon = config.icon
    return (
      <div className="flex-1 min-w-[280px]">
        <div className={cn("flex items-center gap-2 mb-3 p-2 rounded-lg border", config.color)}>
          <Icon className="h-4 w-4" />
          <span className="font-medium text-sm">{config.label}</span>
          <Badge variant="secondary" className="ml-auto">{stageLeads.length}</Badge>
        </div>
        <div className="space-y-2">
          {stageLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} compact />
          ))}
          {stageLeads.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No leads</p>
          )}
        </div>
      </div>
    )
  }

  // Lead Detail Panel
  function LeadDetailPanel() {
    if (!detailLead) return null
    const config = statusConfig[detailLead.status] || statusConfig.new
    const StatusIcon = config.icon
    const priority = detailLead.priority || 'warm'
    const PriorityIcon = priorityConfig[priority]?.icon || ThermometerSun

    // Get next statuses for quick actions
    const nextStatuses: Lead['status'][] = []
    const statusOrder: Lead['status'][] = ['new', 'contacted', 'interested', 'trial_scheduled', 'trial_completed', 'negotiating', 'enrolled']
    const currentIndex = statusOrder.indexOf(detailLead.status)
    if (currentIndex >= 0 && currentIndex < statusOrder.length - 1) {
      nextStatuses.push(statusOrder[currentIndex + 1])
    }

    return (
      <Sheet open={!!detailLead} onOpenChange={(open) => !open && setDetailLead(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" preventAutoFocus>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {detailLead.first_name} {detailLead.last_name}
              <Badge className={cn("ml-2", priorityConfig[priority].color)}>
                <PriorityIcon className="h-3 w-3 mr-1" />{priorityConfig[priority].label}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Status */}
            <div className={cn("flex items-center gap-2 p-3 rounded-lg border", config.color)}>
              <StatusIcon className="h-5 w-5" />
              <span className="font-medium">{config.label}</span>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.blur()
                    handleQuickStatusChange(detailLead, status)
                    setDetailLead((prev) => prev ? { ...prev, status } : null)
                  }}
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move to {statusConfig[status].label}
                </Button>
              ))}
              {!['enrolled', 'lost'].includes(detailLead.status) && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.blur()
                    setLeadToConvert(detailLead)
                    setConvertDialogOpen(true)
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-1" />Convert
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  e.currentTarget.blur()
                  openEditForm(detailLead)
                }}
              >
                <Pencil className="h-4 w-4 mr-1" />Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  e.currentTarget.blur()
                  setInteractionLead(detailLead)
                  setInteractionDialogOpen(true)
                }}
              >
                <MessageSquare className="h-4 w-4 mr-1" />Add Note
              </Button>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Contact</h4>
              {detailLead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${detailLead.phone}`} className="text-blue-600 hover:underline">{detailLead.phone}</a>
                </div>
              )}
              {detailLead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${detailLead.email}`} className="text-blue-600 hover:underline">{detailLead.email}</a>
                </div>
              )}
              {detailLead.parent_name && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Parent:</span> {detailLead.parent_name}
                  {detailLead.parent_phone && ` (${detailLead.parent_phone})`}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detailLead.source && (
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <p>{sourceOptions.find(s => s.value === detailLead.source)?.label || detailLead.source}</p>
                  </div>
                )}
                {detailLead.interested_courses && (
                  <div>
                    <span className="text-muted-foreground">Interested in:</span>
                    <p>{detailLead.interested_courses}</p>
                  </div>
                )}
                {detailLead.birth_year && (
                  <div>
                    <span className="text-muted-foreground">Birth Year:</span>
                    <p>{detailLead.birth_year} ({new Date().getFullYear() - detailLead.birth_year} years)</p>
                  </div>
                )}
                {detailLead.preferred_schedule && (
                  <div>
                    <span className="text-muted-foreground">Preferred Schedule:</span>
                    <p>{detailLead.preferred_schedule}</p>
                  </div>
                )}
                {detailLead.budget && (
                  <div>
                    <span className="text-muted-foreground">Budget:</span>
                    <p>{detailLead.budget}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Schedule</h4>
              <div className="space-y-2 text-sm">
                {detailLead.follow_up_date && (
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    isOverdue(detailLead.follow_up_date) && "bg-red-100 text-red-800",
                    isToday(detailLead.follow_up_date) && !isOverdue(detailLead.follow_up_date) && "bg-amber-100 text-amber-800"
                  )}>
                    <Calendar className="h-4 w-4" />
                    <span>Follow-up: {formatDate(detailLead.follow_up_date)}</span>
                    {isOverdue(detailLead.follow_up_date) && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                    {isToday(detailLead.follow_up_date) && !isOverdue(detailLead.follow_up_date) && <Badge className="text-xs bg-amber-500">Today</Badge>}
                  </div>
                )}
                {detailLead.trial_date && (
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded",
                    isToday(detailLead.trial_date) && "bg-purple-100 text-purple-800"
                  )}>
                    <CalendarCheck className="h-4 w-4" />
                    <span>Trial: {formatDate(detailLead.trial_date)}</span>
                    {detailLead.trial_group_name && <Badge variant="outline">{detailLead.trial_group_name}</Badge>}
                  </div>
                )}
                {detailLead.last_contact_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last contact: {formatDate(detailLead.last_contact_date)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {detailLead.notes && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Notes</h4>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded">{detailLead.notes}</p>
              </div>
            )}

            {/* Interaction History */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Interaction History</h4>
              {interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No interactions recorded yet.</p>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2 pr-4">
                    {interactions.map((int) => {
                      const typeInfo = interactionTypes.find(t => t.value === int.type)
                      const TypeIcon = typeInfo?.icon || MessageSquare
                      return (
                        <div key={int.id} className="flex gap-3 p-2 rounded bg-muted/30">
                          <div className="shrink-0 mt-0.5">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{typeInfo?.label || int.type}</span>
                              <span>•</span>
                              <span>{formatDateTime(int.created_at)}</span>
                              {int.created_by_name && (
                                <>
                                  <span>•</span>
                                  <span>{int.created_by_name}</span>
                                </>
                              )}
                            </div>
                            {int.notes && <p className="text-sm mt-1">{int.notes}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Meta */}
            <div className="text-xs text-muted-foreground border-t pt-4">
              Created: {formatDateTime(detailLead.created_at)} • Updated: {formatDateTime(detailLead.updated_at)}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lead Management</h1>
          <p className="text-muted-foreground">Track and convert prospective students</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Add Lead
        </Button>
      </div>

      {/* Stats */}
      <StatCards />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourceOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="closed">Closed ({closedLeads.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4">
            <div className="flex gap-4 overflow-x-auto pb-4">
              {pipelineStages.map((stage) => (
                <PipelineColumn key={stage} stage={stage} leads={leadsByStage[stage]} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLeads.filter(l => !['enrolled', 'lost', 'postponed'].includes(l.status)).map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
            {filteredLeads.filter(l => !['enrolled', 'lost', 'postponed'].includes(l.status)).length === 0 && (
              <p className="text-center text-muted-foreground py-12">No active leads found</p>
            )}
          </TabsContent>

          <TabsContent value="closed" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {closedLeads.map((lead) => (
                <Card key={lead.id} className="cursor-pointer hover:shadow-md" onClick={() => setDetailLead(lead)}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{lead.first_name} {lead.last_name}</h4>
                        <p className="text-sm text-muted-foreground">{lead.phone}</p>
                      </div>
                      <Badge className={statusConfig[lead.status]?.color}>
                        {statusConfig[lead.status]?.label}
                      </Badge>
                    </div>
                    {lead.loss_reason && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">Reason: {lead.loss_reason}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {closedLeads.length === 0 && (
              <p className="text-center text-muted-foreground py-12">No closed leads</p>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Lead Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input id="first_name" name="first_name" defaultValue={selectedLead?.first_name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input id="last_name" name="last_name" defaultValue={selectedLead?.last_name} required />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <PhoneInput id="phone" value={formPhone} onChange={setFormPhone} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" defaultValue={selectedLead?.email} />
                </div>
              </div>

              {/* Parent */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_name">Parent Name</Label>
                  <Input id="parent_name" name="parent_name" defaultValue={selectedLead?.parent_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_phone">Parent Phone</Label>
                  <PhoneInput id="parent_phone" value={formParentPhone} onChange={setFormParentPhone} />
                </div>
              </div>

              {/* Status, Priority, Source */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={selectedLead?.status || 'new'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select name="priority" defaultValue={selectedLead?.priority || 'warm'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source *</Label>
                  <Select value={formSource} onValueChange={(v) => { setFormSource(v); if (v !== 'referral') { setFormReferrerId(undefined); } }}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Referral picker */}
              {formSource === 'referral' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Referrer Type</Label>
                    <Select value={formReferrerType} onValueChange={(v) => { setFormReferrerType(v as 'student' | 'teacher' | 'user'); setFormReferrerId(undefined); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="user">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Referred By</Label>
                    <Select value={formReferrerId?.toString() || ''} onValueChange={(v) => setFormReferrerId(Number(v))}>
                      <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                      <SelectContent>
                        {referrers.map((r: Referrer) => (
                          <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Interest */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interested_courses">Interested Courses</Label>
                  <Input id="interested_courses" name="interested_courses" placeholder="e.g. English, Math" defaultValue={selectedLead?.interested_courses} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birth_year">Birth Year</Label>
                  <Input id="birth_year" name="birth_year" type="number" min="2000" max="2025" placeholder="e.g. 2015" defaultValue={selectedLead?.birth_year} />
                </div>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preferred_schedule">Preferred Schedule</Label>
                  <Input id="preferred_schedule" name="preferred_schedule" placeholder="e.g. Evenings, Weekends" defaultValue={selectedLead?.preferred_schedule} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input id="budget" name="budget" placeholder="e.g. 500,000 - 700,000" defaultValue={selectedLead?.budget} />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="follow_up_date">Follow-up Date</Label>
                  <DateInput id="follow_up_date" value={formFollowUpDate} onChange={setFormFollowUpDate} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial_date">Trial Date</Label>
                  <DateInput id="trial_date" value={formTrialDate} onChange={setFormTrialDate} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial_group_id">Trial Group</Label>
                  <Select name="trial_group_id" defaultValue={selectedLead?.trial_group_id?.toString()}>
                    <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                    <SelectContent>
                      {groups.filter(g => g.status === 'active').map((g) => (
                        <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" defaultValue={selectedLead?.notes} rows={3} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={createLead.isPending || updateLead.isPending}>
                {(createLead.isPending || updateLead.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedLead ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Interaction Dialog */}
      <Dialog open={interactionDialogOpen} onOpenChange={setInteractionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Interaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInteractionSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select name="type" defaultValue="note">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {interactionTypes.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="int_notes">Notes</Label>
                <Textarea id="int_notes" name="notes" rows={4} placeholder="What happened during this interaction?" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInteractionDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addInteraction.isPending}>
                {addInteraction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {leadToDelete?.first_name} {leadToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => leadToDelete && deleteLead.mutate(leadToDelete.id)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert Confirmation */}
      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Student</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new student record for {leadToConvert?.first_name} {leadToConvert?.last_name} and mark this lead as enrolled. You can then enroll them in groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => leadToConvert && convertLead.mutate(leadToConvert.id)}>
              Convert to Student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Detail Panel */}
      <LeadDetailPanel />
    </div>
  )
}
