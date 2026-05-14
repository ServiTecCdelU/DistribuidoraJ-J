'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { Skeleton } from '@/components/ui/skeleton'

export default function HomePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/login')
      return
    }
    // Redirigir según rol
    if (user.role === 'admin') {
      router.push('/dashboard')
    } else if (user.role === 'seller') {
      if (user.employeeType === 'transportista') {
        router.push('/pedidos')
      } else {
        router.push('/vendedor')
      }
    } else {
      router.push('/login')
    }
  }, [loading, user, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="space-y-4 w-full max-w-md p-6">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
