'use client'

import { useEffect, useState } from 'react'
import type { User } from '@/lib/types'
import { onAuthChange, signOut } from '@/services/auth-service'
import { ensureUserProfile } from '@/services/users-service'

const STORAGE_KEY = 'auth_profile'

// Restaurar perfil de sessionStorage para render instantáneo
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

// Caché en memoria + sessionStorage
let cachedProfile: { uid: string; user: User } | null = getStoredProfile()

export const useAuth = () => {
  // Siempre null en el render inicial para que server y client coincidan (evita hydration mismatch).
  // El caché se restaura en el efecto, que corre sólo en el cliente.
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restaurar perfil cacheado inmediatamente (antes de que Firebase responda)
    if (cachedProfile) {
      setUser(cachedProfile.user)
      setLoading(false)
    }

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        cachedProfile = null
        clearStoredProfile()
        setUser(null)
        setLoading(false)
        return
      }

      // Si ya tenemos el perfil cacheado para este uid, usarlo directamente
      if (cachedProfile && cachedProfile.uid === firebaseUser.uid) {
        setUser(cachedProfile.user)
        setLoading(false)
        return
      }

      const profile = await ensureUserProfile({
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
      })
      if (!profile.isActive) {
        cachedProfile = null
        clearStoredProfile()
        await signOut()
        setUser(null)
        setLoading(false)
        return
      }
      cachedProfile = { uid: firebaseUser.uid, user: profile }
      storeProfile(firebaseUser.uid, profile)
      setUser(profile)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  return { user, loading }
}

/** Invalida el caché del perfil (usar tras cambios de rol, etc.) */
export const invalidateAuthCache = () => {
  cachedProfile = null
  clearStoredProfile()
}
