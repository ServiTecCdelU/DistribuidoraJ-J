// services/audit-service.ts
import { supabase } from '@/lib/supabase'
import type { AuditAction, AuditEntry } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const logAudit = async (entry: {
  action: AuditAction;
  userId: string;
  userName: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}) => {
  try {
    const docId = await generateReadableId('auditoria', 'auditoria', entry.userName)
    await supabase.from('auditoria').insert({
      id: docId,
      action: entry.action,
      user_id: entry.userId,
      user_email: entry.userName,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.metadata ?? null,
    })
  } catch (error) {
    console.error("[Audit] Error logging:", error)
  }
}

export const getAuditLog = async (maxEntries = 100): Promise<AuditEntry[]> => {
  const { data } = await supabase
    .from('auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxEntries)

  return (data ?? []).map((d) => ({
    id: d.id,
    action: d.action as AuditAction,
    userId: d.user_id ?? '',
    userName: d.user_email ?? '',
    description: d.details?.description ?? d.action,
    entityType: d.entity_type,
    entityId: d.entity_id,
    metadata: d.details,
    createdAt: new Date(d.created_at),
  }))
}

export const getAuditByEntity = async (
  entityType: string,
  entityId: string,
): Promise<AuditEntry[]> => {
  const { data } = await supabase
    .from('auditoria')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  return (data ?? []).map((d) => ({
    id: d.id,
    action: d.action as AuditAction,
    userId: d.user_id ?? '',
    userName: d.user_email ?? '',
    description: d.details?.description ?? d.action,
    entityType: d.entity_type,
    entityId: d.entity_id,
    metadata: d.details,
    createdAt: new Date(d.created_at),
  }))
}
