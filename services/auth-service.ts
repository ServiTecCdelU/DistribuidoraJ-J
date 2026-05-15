// services/auth-service.ts
import { supabase } from '@/lib/supabase'

export const signInWithGoogle = () => {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/login`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export const signOut = () => supabase.auth.signOut()

export const onAuthChange = (callback: (user: { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } } | null) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}

export const getAuthToken = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  } catch (error) {
    console.error("Error obteniendo token:", error)
    return null
  }
}
