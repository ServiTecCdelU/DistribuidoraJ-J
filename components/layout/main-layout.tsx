'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from './app-sidebar'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
}

export function MainLayout({ children, title, description }: MainLayoutProps) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!loading && user?.role === 'customer') {
      router.push('/')
    }
  }, [loading, user, router])

  if (!loading && !user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="px-4 pb-6 pt-16 sm:px-6 sm:pt-16 lg:p-8">
          {title && (
            <div className="relative flex items-center h-10 mb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                aria-label="Volver"
                className="absolute left-0 lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="w-full text-center text-xl font-semibold text-foreground lg:text-2xl">
                {title}
              </h1>
            </div>
          )}
          {description && (
            <p className="text-sm text-muted-foreground text-center mb-6">
              {description}
            </p>
          )}
          {!title && !description && <div className="mb-2" />}
          {children}
        </div>
      </main>
    </div>
  )
}
