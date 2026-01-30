import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { authApi, User, ApiError } from '@/lib/api'

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
    const allowedRoles = Array.isArray(roles) ? roles : [roles]
    return allowedRoles.includes(user.role)
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
