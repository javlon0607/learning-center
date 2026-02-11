import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { authApi, User, setSessionExpiredHandler } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasRole: (roles: string | string[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const sessionExpiredRef = useRef(false)

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    setUser(null)
    toast({
      title: 'Session expired',
      description: 'You have been logged out due to inactivity. Please sign in again.',
      variant: 'destructive',
    })
    navigate('/login', { replace: true })
    setTimeout(() => { sessionExpiredRef.current = false }, 2000)
  }, [navigate, toast])

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired)
  }, [handleSessionExpired])

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const response = await authApi.me()
      setUser(response.user)
    } catch (error) {
      setUser(null)
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true })
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password)
    setUser(response.user)
    navigate('/', { replace: true })
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch (error) {
      // Ignore errors on logout
    }
    setUser(null)
    navigate('/login', { replace: true })
  }

  function hasRole(roles: string | string[]) {
    if (!user) return false
    const userRoles = (user.role || 'user').split(',').map((r) => r.trim()).filter(Boolean)
    if (userRoles.length === 0) userRoles.push('user')
    const allowedRoles = Array.isArray(roles) ? roles : [roles]
    return allowedRoles.some((r) => userRoles.includes(r))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
