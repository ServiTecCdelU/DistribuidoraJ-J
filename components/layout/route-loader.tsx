'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function RouteLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const showRef = useRef<NodeJS.Timeout | null>(null)
  const hideRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (showRef.current) clearTimeout(showRef.current)
    if (hideRef.current) clearTimeout(hideRef.current)

    // Solo mostrar barra si la navegación tarda más de 150ms
    showRef.current = setTimeout(() => {
      setVisible(true)
    }, 150)

    // Ocultar después de que la página cargó (se dispara el efecto del nuevo pathname)
    hideRef.current = setTimeout(() => {
      setVisible(false)
    }, 100)

    return () => {
      if (showRef.current) clearTimeout(showRef.current)
      if (hideRef.current) clearTimeout(hideRef.current)
      setVisible(false)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5">
      <div className="h-full bg-primary/80 animate-pulse rounded-r-full" style={{ width: '70%' }} />
    </div>
  )
}
