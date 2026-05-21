'use client'

import { useEffect, useState } from 'react'
import type { User } from '@/lib/types'
import { onAuthChange, signOut } from '@/services/auth-service'
import { ensureUserProfile } from '@/services/users-service'

const STORAGE_KEY = 'auth_profile'

// Restaurar perfil de sessionStorage para render instantaneo
function getStoredProfile(): { uid: string; user: User } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function storeProfile(uid: string, user: User) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid, user }))
  } catch { /* quota exceeded — no-op */ }
}

function clearStoredProfile() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}

// Cache en memoria + sessionStorage
let cachedProfile: { uid: string; user: User } | null = getStoredProfile()

export const useAuth = () => {
  // Siempre null en el render inicial para que server y client coincidan (evita hydration mismatch).
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    // Restaurar perfil cacheado inmediatamente
    if (cachedProfile) {
      setUser(cachedProfile.user)
      setLoading(false)
    }

    const unsubscribe = onAuthChange(async (supabaseUser) => {
      if (!supabaseUser) {
        cachedProfile = null
        clearStoredProfile()
        setUser(null)
        setUnauthorized(false)
        setLoading(false)
        return
      }

      // Si ya tenemos el perfil cacheado para este uid, usarlo directamente
      if (cachedProfile && cachedProfile.uid === supabaseUser.id) {
        setUser(cachedProfile.user)
        setLoading(false)
        return
      }

      const profile = await ensureUserProfile({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'Usuario',
      })

      // Usuario no registrado en el sistema
      if (!profile) {
        cachedProfile = null
        clearStoredProfile()
        await signOut()
        setUser(null)
        setUnauthorized(true)
        setLoading(false)
        return
      }

      if (!profile.isActive) {
        cachedProfile = null
        clearStoredProfile()
        await signOut()
        setUser(null)
        setLoading(false)
        return
      }
      cachedProfile = { uid: supabaseUser.id, user: profile }
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
  cachedProfile = null
  clearStoredProfile()
}
