import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { authApi, User, setSessionExpiredHandler, setAccessToken, clearTokens, refreshAccessToken } from '@/lib/api'
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
  const guardRef = useRef(false)

  function activateSessionGuard() {
    setSessionExpiredHandler(() => {
      if (guardRef.current) return
      guardRef.current = true
      setUser(null)
      clearTokens()
      setSessionExpiredHandler(null)
      toast({
        title: 'Session expired',
        description: 'You have been logged out due to inactivity. Please sign in again.',
        variant: 'destructive',
      })
      navigate('/login', { replace: true })
      setTimeout(() => { guardRef.current = false }, 2000)
    })
  }

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      // On page reload, access token is lost (in-memory). Try refresh first.
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        throw new Error('No session')
      }
      const response = await authApi.me()
      setUser(response.user)
      activateSessionGuard()
    } catch {
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
    setAccessToken(response.access_token, response.expires_in)
    setUser(response.user)
    activateSessionGuard()
    navigate('/', { replace: true })
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // Ignore errors on logout
    }
    setUser(null)
    clearTokens()
    setSessionExpiredHandler(null)
    navigate('/login', { replace: true })
  }

  function hasRole(roles: string | string[]) {
    if (!user) return false
    const userRoles = (user.role || 'user').split(',').map((r) => r.trim()).filter(Boolean)
    if (userRoles.length === 0) userRoles.push('user')
    // owner and developer inherit all admin permissions
    if (userRoles.some(r => r === 'owner' || r === 'developer')) {
      userRoles.push('admin')
    }
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
