import { useState, useEffect, useRef } from 'react'
import { formatDateTime } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  telegramApi,
  telegramSettingsApi,
  leadsApi,
  studentsApi,
  teachersApi,
  groupsApi,
  TelegramLink,
  TelegramLogEntry,
  TelegramUnknownContact,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Send, ArrowUp, ArrowDown, Unlink, Copy, Plus, Trash2, UserX, UserPlus, RefreshCw, Settings, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export function Telegram() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const clearQueueMutation = useMutation({
    mutationFn: () => telegramApi.clearQueue(),
    onSuccess: (data) => {
      toast({ title: 'Queue cleared', description: data.message })
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Telegram</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearQueueMutation.mutate()}
          disabled={clearQueueMutation.isPending}
        >
          {clearQueueMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Trash2 className="mr-2 h-4 w-4" />}
          Clear Queue
        </Button>
      </div>
      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send">Send Message</TabsTrigger>
          <TabsTrigger value="links">Linked Accounts</TabsTrigger>
          <TabsTrigger value="unknown"><UnknownContactsBadge /></TabsTrigger>
          <TabsTrigger value="log">Message Log</TabsTrigger>
          <TabsTrigger value="setup"><Settings className="h-4 w-4 mr-1 inline" />Bot Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <SendMessageTab toast={toast} />
        </TabsContent>

        <TabsContent value="links">
          <LinkedAccountsTab toast={toast} queryClient={queryClient} />
        </TabsContent>

        <TabsContent value="unknown">
          <UnknownContactsTab toast={toast} queryClient={queryClient} />
        </TabsContent>

        <TabsContent value="log">
          <MessageLogTab />
        </TabsContent>

        <TabsContent value="setup">
          <BotSetupTab toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Send Message Tab ─────────────────────────────────────────────────────

function SendMessageTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const [targetType, setTargetType] = useState('')
  const [targetId, setTargetId] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
    enabled: targetType === 'student',
  })
  const { data: teachers } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => teachersApi.getAll(),
    enabled: targetType === 'teacher',
  })
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.getAll(),
    enabled: targetType === 'group',
  })
  const { data: leads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsApi.getAll(),
    enabled: targetType === 'lead',
  })

  const sendMutation = useMutation({
    mutationFn: () => telegramApi.send(targetType, Number(targetId), message),
    onSuccess: (data) => {
      toast({
        title: 'Message sent',
        description: `Sent: ${data.sent}, Failed: ${data.failed}`,
        variant: data.failed > 0 ? 'destructive' : 'default',
      })
      if (data.sent > 0) setMessage('')
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  const getOptions = () => {
    const q = search.toLowerCase()
    if (targetType === 'student') {
      return (students || [])
        .filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(s => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }))
    }
    if (targetType === 'teacher') {
      return (teachers || [])
        .filter(t => `${t.first_name} ${t.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(t => ({ id: t.id, label: `${t.first_name} ${t.last_name}` }))
    }
    if (targetType === 'group') {
      return (groups || [])
        .filter(g => g.name.toLowerCase().includes(q))
        .slice(0, 50)
        .map(g => ({ id: g.id, label: g.name }))
    }
    if (targetType === 'lead') {
      return (leads || [])
        .filter(l => `${l.first_name} ${l.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(l => ({ id: l.id, label: `${l.first_name} ${l.last_name}` }))
    }
    return []
  }

  const options = getOptions()

  return (
    <div className="max-w-lg space-y-4 pt-4">
      <div className="space-y-2">
        <Label>Target Type</Label>
        <Select value={targetType} onValueChange={(v) => { setTargetType(v); setTargetId(''); setSearch('') }}>
          <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="group">Group</SelectItem>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {targetType && (
        <div className="space-y-2">
          <Label>Recipient</Label>
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="Select recipient..." /></SelectTrigger>
            <SelectContent>
              {options.map(o => (
                <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          rows={4}
        />
      </div>

      <Button
        onClick={() => sendMutation.mutate()}
        disabled={!targetType || !targetId || !message.trim() || sendMutation.isPending}
      >
        {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Send
      </Button>
    </div>
  )
}

// ── Linked Accounts Tab ──────────────────────────────────────────────────

function LinkedAccountsTab({
  toast,
  queryClient,
}: {
  toast: ReturnType<typeof useToast>['toast']
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [genSearch, setGenSearch] = useState('')

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['telegram-links'],
    queryFn: () => telegramApi.getLinks(),
  })

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(),
    enabled: entityType === 'student',
  })
  const { data: teachers } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => teachersApi.getAll(),
    enabled: entityType === 'teacher',
  })
  const { data: leads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsApi.getAll(),
    enabled: entityType === 'lead',
  })

  const [generatedLink, setGeneratedLink] = useState('')

  const generateMutation = useMutation({
    mutationFn: () => telegramApi.generateCode(entityType, Number(entityId)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['telegram-links'] })
      if (data.bot_link) {
        setGeneratedLink(data.bot_link)
        toast({ title: 'Link generated!', description: data.bot_link })
      } else {
        toast({ title: 'Link code generated', description: `Code: ${data.code}` })
        setDialogOpen(false)
      }
      setEntityType('')
      setEntityId('')
      setGenSearch('')
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (id: number) => telegramApi.unlink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-links'] })
      toast({ title: 'Unlinked' })
    },
  })

  const getGenOptions = () => {
    const q = genSearch.toLowerCase()
    if (entityType === 'student') {
      return (students || [])
        .filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(s => ({ id: s.id, label: `${s.first_name} ${s.last_name}` }))
    }
    if (entityType === 'teacher') {
      return (teachers || [])
        .filter(t => `${t.first_name} ${t.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(t => ({ id: t.id, label: `${t.first_name} ${t.last_name}` }))
    }
    if (entityType === 'lead') {
      return (leads || [])
        .filter(l => `${l.first_name} ${l.last_name}`.toLowerCase().includes(q))
        .slice(0, 50)
        .map(l => ({ id: l.id, label: `${l.first_name} ${l.last_name}` }))
    }
    return []
  }

  const copyLink = (botLink: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(botLink)
      toast({ title: 'Copied to clipboard' })
    } else {
      // Fallback for HTTP contexts
      const textarea = document.createElement('textarea')
      textarea.value = botLink
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast({ title: 'Copied to clipboard' })
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Generate Link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Telegram Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select value={entityType} onValueChange={(v) => { setEntityType(v); setEntityId(''); setGenSearch('') }}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {entityType && (
                <div className="space-y-2">
                  <Label>Entity</Label>
                  <Input
                    placeholder="Search..."
                    value={genSearch}
                    onChange={(e) => setGenSearch(e.target.value)}
                  />
                  <Select value={entityId} onValueChange={setEntityId}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {getGenOptions().map(o => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                onClick={() => { setGeneratedLink(''); generateMutation.mutate() }}
                disabled={!entityType || !entityId || generateMutation.isPending}
                className="w-full"
              >
                {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Code
              </Button>
              {generatedLink && (
                <div className="space-y-2 rounded-md border p-3 bg-muted">
                  <Label className="text-xs text-muted-foreground">Share this link with the user:</Label>
                  <div className="flex items-center gap-2">
                    <Input value={generatedLink} readOnly className="text-sm" />
                    <Button variant="outline" size="sm" onClick={() => copyLink(generatedLink)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">No linked accounts</TableCell>
            </TableRow>
          ) : (
            links.map((link: TelegramLink) => (
              <TableRow key={link.id}>
                <TableCell className="capitalize">{link.entity_type}</TableCell>
                <TableCell>{link.entity_name || `#${link.entity_id}`}</TableCell>
                <TableCell>
                  {link.linked_at ? (
                    <Badge variant="default" className="bg-green-600">Linked</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {link.bot_link ? (
                    <Button variant="ghost" size="sm" onClick={() => copyLink(link.bot_link)}>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy Link
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unlinkMutation.mutate(link.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Unlink className="mr-1 h-3 w-3" /> Unlink
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Unknown Contacts Tab ─────────────────────────────────────────────────

function UnknownContactsBadge() {
  const { data = [] } = useQuery({
    queryKey: ['telegram-unknown-contacts'],
    queryFn: telegramApi.getUnknownContacts,
    refetchInterval: 60000,
  })
  return (
    <span className="flex items-center gap-1.5">
      <UserX className="h-4 w-4" />
      Unknown
      {data.length > 0 && (
        <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs px-1.5 py-0">{data.length}</Badge>
      )}
    </span>
  )
}

function UnknownContactsTab({
  toast,
  queryClient,
}: {
  toast: ReturnType<typeof useToast>['toast']
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [createLeadFor, setCreateLeadFor] = useState<TelegramUnknownContact | null>(null)
  const [leadName, setLeadName] = useState('')

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['telegram-unknown-contacts'],
    queryFn: telegramApi.getUnknownContacts,
  })

  const deleteMutation = useMutation({
    mutationFn: telegramApi.deleteUnknownContact,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram-unknown-contacts'] }),
  })

  const createLeadMutation = useMutation({
    mutationFn: ({ contact, name }: { contact: TelegramUnknownContact; name: string }) => {
      const parts = name.trim().split(' ')
      return leadsApi.create({
        first_name: parts[0] || 'Unknown',
        last_name: parts.slice(1).join(' ') || '',
        phone: contact.phone,
        source: 'telegram',
        status: 'new',
      })
    },
    onSuccess: (_, { contact }) => {
      toast({ title: 'Lead created' })
      deleteMutation.mutate(contact.id)
      setCreateLeadFor(null)
      setLeadName('')
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        These people shared their phone number with the bot but were not found in the system.
      </p>

      {contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No unknown contacts</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Telegram Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contacts as TelegramUnknownContact[]).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {[c.tg_first_name, c.tg_last_name].filter(Boolean).join(' ') || '—'}
                </TableCell>
                <TableCell className="font-mono">{c.phone}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.tg_username ? `@${c.tg_username}` : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDateTime(c.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => {
                        setCreateLeadFor(c)
                        setLeadName([c.tg_first_name, c.tg_last_name].filter(Boolean).join(' '))
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Lead
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      onClick={() => deleteMutation.mutate(c.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Lead Dialog */}
      <Dialog open={!!createLeadFor} onOpenChange={v => { if (!v) setCreateLeadFor(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Phone</Label>
              <Input value={createLeadFor?.phone ?? ''} disabled className="mt-1 font-mono" />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={leadName} onChange={e => setLeadName(e.target.value)} className="mt-1" placeholder="First Last" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateLeadFor(null)}>Cancel</Button>
            <Button
              onClick={() => createLeadFor && createLeadMutation.mutate({ contact: createLeadFor, name: leadName })}
              disabled={createLeadMutation.isPending || !leadName.trim()}
            >
              {createLeadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Lead'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Bot Setup Tab ────────────────────────────────────────────────────────

function BotSetupTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const queryClient = useQueryClient()
  const [webhookUrl, setWebhookUrl] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const contactInfoInitialized = useRef(false)

  const { data: settings } = useQuery({
    queryKey: ['telegram-settings'],
    queryFn: () => telegramSettingsApi.get(),
    refetchOnWindowFocus: false,
  })

  // Only sync from DB on first load, never override user edits
  useEffect(() => {
    if (!contactInfoInitialized.current && settings !== undefined) {
      contactInfoInitialized.current = true
      setContactInfo(settings.contact_info ?? '')
    }
  }, [settings])

  const saveSettingsMutation = useMutation({
    mutationFn: () => telegramSettingsApi.save({ contact_info: contactInfo }),
    onSuccess: () => {
      toast({ title: 'Contact info saved' })
      queryClient.invalidateQueries({ queryKey: ['telegram-settings'] })
      contactInfoInitialized.current = false // allow re-sync after invalidation
    },
    onError: (err: Error) => toast({ title: 'Failed to save', description: err.message, variant: 'destructive' }),
  })

  const { data: webhookInfo, isLoading: infoLoading, refetch, isFetching } = useQuery({
    queryKey: ['telegram-webhook-info'],
    queryFn: () => telegramApi.getWebhookInfo(),
    retry: false,
  })

  const setWebhookMutation = useMutation({
    mutationFn: () => telegramApi.setWebhook(webhookUrl),
    onSuccess: (data) => {
      toast({ title: 'Webhook set', description: data.description })
      refetch()
      setWebhookUrl('')
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to set webhook', description: err.message, variant: 'destructive' })
    },
  })

  const suggestedUrl = `${window.location.origin.replace(/:\d+$/, '')}/api/telegram-webhook`

  const isRegistered = webhookInfo && webhookInfo.url && webhookInfo.url.length > 0
  const hasError = webhookInfo && webhookInfo.last_error_message

  return (
    <div className="max-w-2xl space-y-6 pt-4">

      {/* Status Card */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Webhook Status</h3>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {infoLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !webhookInfo ? (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">Could not fetch webhook info. Check bot token configuration.</span>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              {isRegistered
                ? <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                : <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />}
              <div>
                <p className="font-medium">{isRegistered ? 'Webhook registered' : 'No webhook registered'}</p>
                {isRegistered && (
                  <p className="text-muted-foreground font-mono break-all mt-0.5">{webhookInfo.url}</p>
                )}
              </div>
            </div>

            {webhookInfo.pending_update_count > 0 && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>{webhookInfo.pending_update_count} pending updates in queue</span>
              </div>
            )}

            {hasError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 space-y-1">
                <p className="font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> Last delivery error
                </p>
                <p className="text-red-600 dark:text-red-300">{webhookInfo.last_error_message}</p>
                {webhookInfo.last_error_date && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(webhookInfo.last_error_date * 1000).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Register Webhook */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-base">Register Webhook</h3>
        <p className="text-sm text-muted-foreground">
          Telegram will POST incoming messages to this URL. Must be <strong>HTTPS</strong>.
        </p>

        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder={suggestedUrl}
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setWebhookUrl(suggestedUrl)}
            >
              Auto-fill
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested: <code className="bg-muted rounded px-1">{suggestedUrl}</code>
          </p>
        </div>

        <Button
          onClick={() => setWebhookMutation.mutate()}
          disabled={setWebhookMutation.isPending || !webhookUrl.trim()}
        >
          {setWebhookMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {isRegistered ? 'Update Webhook' : 'Register Webhook'}
        </Button>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-base">Contact Info for Bot</h3>
        <p className="text-sm text-muted-foreground">
          Shown to users when they tap "Contact us" in the bot. Supports plain text.
        </p>
        <div className="space-y-2">
          <Label>Contact Information</Label>
          <Textarea
            value={contactInfo}
            onChange={e => setContactInfo(e.target.value)}
            rows={5}
            placeholder={"📍 Address: 123 Main St\n📞 Phone: +998 90 123 45 67\n🕐 Hours: Mon–Sat 9:00–18:00\n✉️ Email: info@legacyacademy.uz"}
            className="font-mono text-sm"
          />
        </div>
        <Button
          onClick={() => saveSettingsMutation.mutate()}
          disabled={saveSettingsMutation.isPending}
        >
          {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Contact Info
        </Button>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">How incoming messages work</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Users send a message to your bot in Telegram</li>
          <li>Telegram delivers it via POST to your webhook URL</li>
          <li>The server processes it and responds to the user</li>
          <li>If the webhook URL is missing or wrong, incoming messages won't work</li>
          <li>Telegram requires <strong>HTTPS</strong> — plain HTTP is not accepted</li>
        </ul>
      </div>
    </div>
  )
}

// ── Message Log Tab ──────────────────────────────────────────────────────

function MessageLogTab() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-log', page, limit],
    queryFn: () => telegramApi.getLog(page, limit),
  })

  const entries = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {total > 0 ? `Showing ${from}–${to} of ${total}` : 'No messages yet'}
        </span>
        <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Dir</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">No messages yet</TableCell>
            </TableRow>
          ) : (
            entries.map((entry: TelegramLogEntry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  {entry.direction === 'out' ? (
                    <ArrowUp className="h-4 w-4 text-blue-500" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-green-500" />
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate">{entry.message_text}</TableCell>
                <TableCell>
                  <Badge variant="outline">{entry.trigger_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={entry.status === 'sent' ? 'default' : entry.status === 'failed' ? 'destructive' : 'secondary'}
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatDateTime(entry.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Prev</Button>
        <span className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
      </div>
    </div>
  )
}
