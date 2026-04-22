import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { api, User } from '../lib/api'

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
  refreshUser: () => Promise<void>
  hasRole: (...roles: string[]) => boolean
  isProviderVerified: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    api.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login: (token: string, userData: User) => {
        localStorage.setItem('token', token)
        setUser(userData)
      },
      logout: () => {
        localStorage.removeItem('token')
        setUser(null)
      },
      refreshUser: async () => {
        const currentUser = await api.me()
        setUser(currentUser)
      },
      hasRole: (...roles: string[]) => (user ? roles.includes(user.role) : false),
      isProviderVerified: user?.role === 'provider' && user.provider_verification_status === 'approved',
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
