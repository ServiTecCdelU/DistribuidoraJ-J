'use client'

import { useEffect, useState } from 'react'
import type { User } from '@/lib/types'
import { onAuthChange, signOut } from '@/services/auth-service'
import { ensureUserProfile } from '@/services/users-service'

const STORAGE_KEY = 'auth_profile'
const UNAUTHORIZED_KEY = 'auth_unauthorized'

function storeProfile(uid: string, user: User) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid, user }))
  } catch {}
}

function clearStoredProfile() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}

/** Marca que el último intento de login fue rechazado (persiste entre re-renders) */
function markUnauthorized() {
  try { sessionStorage.setItem(UNAUTHORIZED_KEY, '1') } catch {}
}

/** Lee y consume el flag de unauthorized */
function consumeUnauthorized(): boolean {
  try {
    const val = sessionStorage.getItem(UNAUTHORIZED_KEY)
    sessionStorage.removeItem(UNAUTHORIZED_KEY)
    return val === '1'
  } catch { return false }
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    // Chequear si venimos de un rechazo anterior
    if (consumeUnauthorized()) {
      setUnauthorized(true)
    }

    let cancelled = false

    const unsubscribe = onAuthChange(async (supabaseUser) => {
      if (!supabaseUser) {
        clearStoredProfile()
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const profile = await ensureUserProfile({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'Usuario',
        })

        if (cancelled) return

        // Usuario no registrado en el sistema
        if (!profile) {
          clearStoredProfile()
          markUnauthorized()
          await signOut()
          return
        }

        if (!profile.isActive) {
          clearStoredProfile()
          await signOut()
          return
        }

        storeProfile(supabaseUser.id, profile)
        setUser(profile)
        setLoading(false)
      } catch {
        if (cancelled) return
        clearStoredProfile()
        await signOut()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { user, loading, unauthorized }
}

/** Invalida el cache del perfil (usar tras cambios de rol, etc.) */
export const invalidateAuthCache = () => {
  clearStoredProfile()
}
