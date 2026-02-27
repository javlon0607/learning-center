import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { translationsApi } from '@/lib/api'

export type Lang = 'en' | 'uz'

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, fallback?: string) => string
  isLoading: boolean
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'en'
  })

  const setLang = useCallback((newLang: Lang) => {
    localStorage.setItem('lang', newLang)
    setLangState(newLang)
  }, [])

  const { data: translations = {}, isLoading } = useQuery({
    queryKey: ['translations', lang],
    queryFn: () => translationsApi.getByLang(lang),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  })

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return (translations as Record<string, string>)[key] ?? fallback ?? key
    },
    [translations]
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isLoading }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useTranslation must be used within I18nProvider')
  return context
}
