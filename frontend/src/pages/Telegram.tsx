import { useState } from 'react'
import { formatDateTime } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  telegramApi,
  studentsApi,
  teachersApi,
  groupsApi,
  leadsApi,
  TelegramLink,
  TelegramLogEntry,
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
import { Loader2, Send, ArrowUp, ArrowDown, Unlink, Copy, Plus } from 'lucide-react'

export function Telegram() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Telegram</h1>
      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send">Send Message</TabsTrigger>
          <TabsTrigger value="links">Linked Accounts</TabsTrigger>
          <TabsTrigger value="log">Message Log</TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <SendMessageTab toast={toast} />
        </TabsContent>

        <TabsContent value="links">
          <LinkedAccountsTab toast={toast} queryClient={queryClient} />
        </TabsContent>

        <TabsContent value="log">
          <MessageLogTab />
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

// ── Message Log Tab ──────────────────────────────────────────────────────

function MessageLogTab() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-log', page],
    queryFn: () => telegramApi.getLog(page),
  })

  const entries = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / (data?.limit || 50))

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="space-y-4 pt-4">
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
          {entries.length === 0 ? (
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

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
