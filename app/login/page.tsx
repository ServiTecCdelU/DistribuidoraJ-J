'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Store, Loader2, ShieldAlert, ShieldCheck, ClipboardList, Truck, ChevronRight } from 'lucide-react'
import { signInWithGoogle } from '@/services/auth-service'
import { useAuth } from '@/hooks/use-auth'
import type { User } from '@/lib/types'

function getHomeRoute(user: User): string {
  if (user.role === 'seller') {
    if (user.employeeType === 'transportista') return '/pedidos'
    return '/comisiones'
  }
  return '/caja'
}

const roles = [
  {
    title: 'Administrador',
    description: 'Caja, productos, clientes, reportes',
    icon: ShieldCheck,
    color: 'bg-teal-100 text-teal-700',
  },
  {
    title: 'Vendedor / Distribuidor',
    description: 'Toma pedidos, cobra, mira comisiones',
    icon: ClipboardList,
    color: 'bg-sky-100 text-sky-700',
  },
  {
    title: 'Transportista',
    description: 'Ruta del día, entregas, cobranza',
    icon: Truck,
    color: 'bg-emerald-100 text-emerald-700',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: authLoading, unauthorized } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showUnauthorized, setShowUnauthorized] = useState(unauthorized)

  useEffect(() => {
    if (!authLoading && user) {
      router.push(getHomeRoute(user))
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (unauthorized) {
      setShowUnauthorized(true)
      setLoading(false)
    }
  }, [unauthorized])

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)

    try {
      await signInWithGoogle()
    } catch (error) {
      setError('No se pudo iniciar sesión con Google')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Panel izquierdo — branding */}
      <div className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-600 p-6 md:p-12 flex flex-col items-start justify-center min-h-[140px] md:min-h-screen overflow-hidden">
          {/* Círculos decorativos */}
          <div className="absolute -right-16 top-1/4 w-56 h-56 rounded-full bg-white/10" />
          <div className="absolute -right-8 top-1/2 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute left-1/2 -bottom-12 w-48 h-48 rounded-full bg-white/5" />

          <div className="relative z-10">
            <p className="text-white/60 text-xs uppercase tracking-wider mb-4">Sistema de Gestión de Distribuidora</p>
            <h1 className="text-white text-2xl md:text-3xl font-bold leading-snug">
              Gestión de toda la distribuidora, desde el celular o el mostrador.
            </h1>
          </div>
      </div>

      {/* Panel derecho — login */}
      <div className="flex flex-col justify-center p-6 md:p-16 bg-white">
          <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground/60 mb-5">
            Inicia sesión como
          </p>

          {/* Role cards */}
          <div className="space-y-2 md:space-y-3 mb-5 md:mb-8">
            {roles.map((role) => (
              <div
                key={role.title}
                className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border border-border/60 hover:border-border hover:bg-accent/30 transition-colors"
              >
                <div className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${role.color}`}>
                  <role.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{role.title}</p>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </div>
            ))}
          </div>

          {/* Google sign in */}
          {error && (
            <p className="text-sm text-destructive mb-3">{error}</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-sm font-medium rounded-xl"
            onClick={handleGoogleSignIn}
            disabled={loading || authLoading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Continuar con Google
          </Button>

          <p className="text-xs text-muted-foreground/50 text-center mt-4">
            Tu rol se detecta automáticamente al iniciar sesión.
          </p>

          <p className="text-[10px] text-muted-foreground/40 text-center mt-8">
            Desarrollado por <span className="font-semibold text-muted-foreground/60">ServiTec</span>
          </p>
        </div>

      {/* Modal no autorizado */}
      <Dialog open={showUnauthorized} onOpenChange={setShowUnauthorized}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-center">Acceso no autorizado</DialogTitle>
            <DialogDescription className="text-center">
              Tu cuenta no está registrada en el sistema. Contacta al administrador para solicitar acceso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setShowUnauthorized(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
