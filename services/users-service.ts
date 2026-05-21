import { supabase } from '@/lib/supabase'
import type { User, UserRole, EmployeeType } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const getUserProfile = async (userId: string): Promise<User | null> => {
  // Primero buscar por doc ID directo (usuarios legacy con Auth UID como id)
  const { data: direct } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (direct) {
    return {
      id: direct.id,
      email: direct.email,
      name: direct.name,
      role: direct.role as UserRole,
      sellerId: direct.seller_id,
      employeeType: direct.employee_type as EmployeeType | undefined,
      isActive: direct.is_active ?? true,
      createdAt: new Date(direct.created_at),
    }
  }

  // Buscar por auth_uid (usuarios nuevos con ID legible)
  const { data: byAuth } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_uid', userId)
    .maybeSingle()

  if (!byAuth) return null

  return {
    id: byAuth.id,
    email: byAuth.email,
    name: byAuth.name,
    role: byAuth.role as UserRole,
    employeeType: byAuth.employee_type as EmployeeType | undefined,
    sellerId: byAuth.seller_id,
    isActive: byAuth.is_active ?? true,
    createdAt: new Date(byAuth.created_at),
  }
}

export const ensureUserProfile = async (data: {
  id: string
  email: string
  name: string
  role?: UserRole
}): Promise<User | null> => {
  // Siempre chequear si el email coincide con un vendedor registrado
  const { data: sellerRows } = await supabase
    .from('vendedores')
    .select('id, employee_type')
    .eq('email', data.email)
    .limit(1)

  const matchingSeller = sellerRows?.[0]?.id
  const matchingEmployeeType = sellerRows?.[0]?.employee_type as EmployeeType | undefined

  let existing = await getUserProfile(data.id)

  // Si no se encontró por ID/auth_uid, buscar por email (migración Firebase → Supabase)
  if (!existing) {
    const { data: emailRows } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', data.email)
      .order('created_at', { ascending: true })
      .limit(1)

    const byEmail = emailRows?.[0]
    if (byEmail) {
      await supabase
        .from('usuarios')
        .update({ auth_uid: data.id })
        .eq('id', byEmail.id)

      existing = {
        id: byEmail.id,
        email: byEmail.email,
        name: byEmail.name,
        role: byEmail.role as UserRole,
        sellerId: byEmail.seller_id,
        employeeType: byEmail.employee_type as EmployeeType | undefined,
        isActive: byEmail.is_active ?? true,
        createdAt: new Date(byEmail.created_at),
      }
    }
  }

  // Si el perfil encontrado es customer, verificar si hay otro registro con el mismo email
  // que tenga un rol real (admin/seller) — puede pasar por duplicados de migración
  if (existing && existing.role === 'customer') {
    const { data: betterRows } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', data.email)
      .in('role', ['admin', 'seller'])
      .limit(1)

    const better = betterRows?.[0]
    if (better) {
      // Mover el auth_uid al perfil correcto y eliminar el duplicado customer
      await supabase
        .from('usuarios')
        .update({ auth_uid: data.id })
        .eq('id', better.id)
      await supabase
        .from('usuarios')
        .delete()
        .eq('id', existing.id)
        .neq('id', better.id)

      existing = {
        id: better.id,
        email: better.email,
        name: better.name,
        role: better.role as UserRole,
        sellerId: better.seller_id,
        employeeType: better.employee_type as EmployeeType | undefined,
        isActive: better.is_active ?? true,
        createdAt: new Date(better.created_at),
      }
    }
  }

  if (existing) {
    // Si existe un perfil pero el rol no es seller/admin y ahora hay un vendedor vinculado
    if (matchingSeller && existing.role !== 'seller' && existing.role !== 'admin') {
      await supabase
        .from('usuarios')
        .update({
          role: 'seller',
          seller_id: matchingSeller,
          employee_type: matchingEmployeeType ?? null,
        })
        .eq('id', existing.id)
      return {
        ...existing,
        role: 'seller',
        sellerId: matchingSeller,
        employeeType: matchingEmployeeType,
      }
    }
    // Si ya es seller pero le falta el sellerId o cambio, sincronizar
    if (matchingSeller && existing.role === 'seller' && existing.sellerId !== matchingSeller) {
      await supabase
        .from('usuarios')
        .update({
          seller_id: matchingSeller,
          employee_type: matchingEmployeeType ?? existing.employeeType ?? null,
        })
        .eq('id', existing.id)
      return {
        ...existing,
        sellerId: matchingSeller,
        employeeType: matchingEmployeeType ?? existing.employeeType,
      }
    }
    return existing
  }

  // Si no hay vendedor vinculado, verificar si es el primer admin
  if (!matchingSeller) {
    const { count } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (count === 0) {
      // Primer usuario → admin
      const docId = await generateReadableId('usuarios', 'usuario', data.name)
      const profile: User = {
        id: docId,
        email: data.email,
        name: data.name,
        role: 'admin',
        sellerId: undefined,
        employeeType: undefined,
        isActive: true,
        createdAt: new Date(),
      }
      await supabase.from('usuarios').insert({
        id: docId,
        auth_uid: data.id,
        email: profile.email,
        name: profile.name,
        role: 'admin',
        seller_id: null,
        employee_type: null,
        is_active: true,
      })
      return profile
    }

    // Usuario no registrado previamente → rechazar
    return null
  }

  // Vendedor vinculado → crear como seller
  const docId = await generateReadableId('usuarios', 'usuario', data.name)
  const profile: User = {
    id: docId,
    email: data.email,
    name: data.name,
    role: 'seller',
    sellerId: matchingSeller,
    employeeType: matchingEmployeeType,
    isActive: true,
    createdAt: new Date(),
  }

  await supabase.from('usuarios').insert({
    id: docId,
    auth_uid: data.id,
    email: profile.email,
    name: profile.name,
    role: 'seller',
    seller_id: profile.sellerId ?? null,
    employee_type: profile.employeeType ?? null,
    is_active: true,
  })

  return profile
}
