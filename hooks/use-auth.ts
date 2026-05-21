'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from '@/lib/types'
import { onAuthChange, signOut } from '@/services/auth-service'
import { ensureUserProfile } from '@/services/users-service'

const STORAGE_KEY = 'auth_profile'

function storeProfile(uid: string, user: User) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid, user }))
  } catch { /* quota exceeded — no-op */ }
}

function clearStoredProfile() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  // Flag para que el signOut intencional no resetee unauthorized
  const intentionalSignOut = useRef(false)

  useEffect(() => {
    const unsubscribe = onAuthChange(async (supabaseUser) => {
      if (!supabaseUser) {
        clearStoredProfile()
        setUser(null)
        setLoading(false)
        // Solo resetear unauthorized si NO fue un signOut intencional
        if (!intentionalSignOut.current) {
          setUnauthorized(false)
        }
        intentionalSignOut.current = false
        return
      }

      const profile = await ensureUserProfile({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'Usuario',
      })

      // Usuario no registrado en el sistema
      if (!profile) {
        clearStoredProfile()
        intentionalSignOut.current = true
        await signOut()
        setUser(null)
        setUnauthorized(true)
        setLoading(false)
        return
      }

      if (!profile.isActive) {
        clearStoredProfile()
        intentionalSignOut.current = true
        await signOut()
        setUser(null)
        setLoading(false)
        return
      }

      storeProfile(supabaseUser.id, profile)
      setUser(profile)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  return { user, loading, unauthorized }
}

/** Invalida el cache del perfil (usar tras cambios de rol, etc.) */
export const invalidateAuthCache = () => {
  clearStoredProfile()
}
