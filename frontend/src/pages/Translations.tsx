import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { translationsApi } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Save, Search, Languages } from 'lucide-react'

interface TranslationRow {
  key: string
  en: string
  uz: string
}

export function Translations() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState<Record<string, { en: string; uz: string }>>({})

  const { data: enTranslations = {}, isLoading: loadingEn } = useQuery({
    queryKey: ['translations', 'en'],
    queryFn: () => translationsApi.getByLang('en'),
  })

  const { data: uzTranslations = {}, isLoading: loadingUz } = useQuery({
    queryKey: ['translations', 'uz'],
    queryFn: () => translationsApi.getByLang('uz'),
  })

  const isLoading = loadingEn || loadingUz

  const rows: TranslationRow[] = useMemo(() => {
    const allKeys = new Set([...Object.keys(enTranslations), ...Object.keys(uzTranslations)])
    return Array.from(allKeys)
      .sort()
      .map((key) => ({
        key,
        en: (edits[key]?.en ?? enTranslations[key]) || '',
        uz: (edits[key]?.uz ?? uzTranslations[key]) || '',
      }))
  }, [enTranslations, uzTranslations, edits])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.en.toLowerCase().includes(q) ||
        r.uz.toLowerCase().includes(q)
    )
  }, [rows, search])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: { lang: string; key: string; value: string }[] = []
      for (const [key, vals] of Object.entries(edits)) {
        if (vals.en !== undefined) payload.push({ lang: 'en', key, value: vals.en })
        if (vals.uz !== undefined) payload.push({ lang: 'uz', key, value: vals.uz })
      }
      return translationsApi.update(payload)
    },
    onSuccess: () => {
      setEdits({})
      queryClient.invalidateQueries({ queryKey: ['translations'] })
      toast({ title: t('translations.saved', 'Translations saved successfully') })
    },
    onError: () => {
      toast({ title: 'Failed to save translations', variant: 'destructive' })
    },
  })

  function handleChange(key: string, lang: 'en' | 'uz', value: string) {
    setEdits((prev) => ({
      ...prev,
      [key]: {
        en: prev[key]?.en ?? enTranslations[key] ?? '',
        uz: prev[key]?.uz ?? uzTranslations[key] ?? '',
        [lang]: value,
      },
    }))
  }

  const hasChanges = Object.keys(edits).length > 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Languages className="h-6 w-6" />
            {t('translations.title', 'Translations')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('translations.description', 'Manage interface translations')}
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className="bg-navy-950 hover:bg-navy-900"
        >
          <Save className="mr-2 h-4 w-4" />
          {t('translations.save_all', 'Save All')}
          {hasChanges && (
            <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
              {Object.keys(edits).length}
            </span>
          )}
        </Button>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium">
              {filteredRows.length} / {rows.length} keys
            </CardTitle>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('translations.search', 'Search keys...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              {t('common.loading', 'Loading...')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[280px] font-semibold">
                      {t('translations.col_key', 'Key')}
                    </TableHead>
                    <TableHead className="font-semibold">
                      {t('translations.col_english', 'English')}
                    </TableHead>
                    <TableHead className="font-semibold">
                      {t('translations.col_uzbek', 'Uzbek')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const changed = !!edits[row.key]
                    return (
                      <TableRow key={row.key} className={changed ? 'bg-amber-50/50' : ''}>
                        <TableCell className="font-mono text-xs text-muted-foreground py-2 align-top pt-3">
                          {row.key}
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            value={row.en}
                            onChange={(e) => handleChange(row.key, 'en', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            value={row.uz}
                            onChange={(e) => handleChange(row.key, 'uz', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                        {t('common.no_data', 'No data found')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
