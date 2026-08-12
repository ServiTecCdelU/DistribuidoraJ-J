'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from './app-sidebar'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

const SIDEBAR_HIDDEN_KEY = 'sidebarHidden'

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
  allowedRoles?: UserRole[]
}

function getRoleHome(user: { role: string; employeeType?: string }): string {
  if (user.role === 'seller') {
    if (user.employeeType === 'transportista') return '/pedidos'
    return '/comisiones'
  }
  if (user.role === 'admin') return '/caja'
  return '/login'
}

export function MainLayout({ children, title, description, allowedRoles }: MainLayoutProps) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [sidebarHidden, setSidebarHidden] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1') {
      setSidebarHidden(true)
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarHidden((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') window.localStorage.setItem(SIDEBAR_HIDDEN_KEY, next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!loading && user && allowedRoles && !allowedRoles.includes(user.role)) {
      router.push(getRoleHome(user))
    }
  }, [loading, user, allowedRoles, router])

  if (!loading && !user) {
    return null
  }

  if (!loading && user && allowedRoles && !allowedRoles.includes(user.role)) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar hidden={sidebarHidden} onToggle={toggleSidebar} />
      <main className={cn("min-h-screen transition-[margin] duration-300", sidebarHidden ? "lg:ml-0" : "lg:ml-[14.4rem]")}>
        <div className="px-4 pb-6 pt-3 sm:px-6 sm:pt-4 lg:p-8">
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
