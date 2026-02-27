import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionsApi } from '@/lib/api'
import { FEATURES, EDITABLE_ROLES, BYPASS_ROLES } from '@/contexts/PermissionsContext'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Lock } from 'lucide-react'
import { useTranslation } from '@/contexts/I18nContext'

export function Permissions() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: permissionsApi.getAll,
  })

  // Initialize draft synchronously from cache to avoid flash of unchecked state
  const [draft, setDraft] = useState<Record<string, string[]>>(() => {
    const cached = queryClient.getQueryData<Record<string, string[]>>(['permissions'])
    return cached ? JSON.parse(JSON.stringify(cached)) : {}
  })
  const [isDirty, setIsDirty] = useState(false)

  // Sync draft from server only once on initial load (never overwrite user edits)
  const hasSynced = useRef(false)
  useEffect(() => {
    if (!isLoading && permissions && !hasSynced.current) {
      hasSynced.current = true
      setDraft(JSON.parse(JSON.stringify(permissions)))
    }
  }, [isLoading, permissions])

  const saveMutation = useMutation({
    mutationFn: permissionsApi.update,
    onSuccess: () => {
      hasSynced.current = false // allow re-sync after save
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
      toast({ title: t('permissions.toast_saved', 'Permissions saved successfully') })
      setIsDirty(false)
    },
    onError: (err: Error) => {
      toast({ title: t('permissions.toast_error', 'Failed to save permissions'), description: err.message, variant: 'destructive' })
    },
  })

  function toggle(feature: string, role: string) {
    setDraft(prev => {
      const current = prev[feature] ?? []
      const next = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role]
      return { ...prev, [feature]: next }
    })
    setIsDirty(true)
  }

  function isChecked(feature: string, role: string) {
    return (draft[feature] ?? []).includes(role)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('permissions.title', 'Permissions')}</h1>
          <p className="text-muted-foreground">{t('permissions.description', 'Configure which roles can access which features')}</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending || !isDirty}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('permissions.save', 'Save Permissions')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">{t('permissions.feature', 'Feature')}</TableHead>
                {BYPASS_ROLES.map(role => (
                  <TableHead key={role} className="text-center w-[90px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="capitalize">{role}</span>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                ))}
                {EDITABLE_ROLES.map(role => (
                  <TableHead key={role} className="text-center w-[90px] capitalize">{role}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURES.map(feature => (
                <TableRow key={feature.key} className={feature.indent ? 'bg-slate-50/60' : ''}>
                  <TableCell>
                    <div className={feature.indent ? 'pl-5 border-l-2 border-slate-200' : ''}>
                      <p className={`font-medium ${feature.indent ? 'text-xs text-slate-600' : 'text-sm'}`}>{feature.label}</p>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </div>
                  </TableCell>
                  {/* owner / developer — always on, not editable */}
                  {BYPASS_ROLES.map(role => (
                    <TableCell key={role} className="text-center">
                      <Checkbox checked disabled className="opacity-40" />
                    </TableCell>
                  ))}
                  {/* Editable roles */}
                  {EDITABLE_ROLES.map(role => (
                    <TableCell key={role} className="text-center">
                      <Checkbox
                        checked={isChecked(feature.key, role)}
                        onCheckedChange={() => toggle(feature.key, role)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
