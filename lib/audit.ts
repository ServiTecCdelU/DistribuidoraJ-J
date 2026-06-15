// lib/audit.ts
// Helper client-side para registrar acciones en la auditoría sin repetir el armado
// del payload en cada página. Fire-and-forget: nunca interrumpe el flujo de la UI.

import { auditApi } from '@/lib/api'
import type { AuditAction, User } from '@/lib/types'

type Actor = Pick<User, 'id' | 'name'> | null | undefined

export function recordAudit(
  actor: Actor,
  action: AuditAction,
  description: string,
  entity?: { type?: string; id?: string; metadata?: Record<string, unknown> },
): void {
  // No await: el registro de auditoría no debe demorar ni romper la acción del usuario.
  void Promise.resolve(
    auditApi.log({
      action,
      userId: actor?.id ?? 'desconocido',
      userName: actor?.name ?? 'Sistema',
      description,
      entityType: entity?.type,
      entityId: entity?.id,
      metadata: entity?.metadata as Record<string, any> | undefined,
    }),
  ).catch(() => {
    /* logAudit ya loguea su propio error; acá solo evitamos unhandled rejection */
  })
}
