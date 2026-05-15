// services/transfer-config-service.ts
import { supabase } from '@/lib/supabase'

export interface TransferConfig {
  alias: string;
  titular: string;
  banco: string;
}

export async function getTransferConfig(): Promise<TransferConfig> {
  const { data } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', 'transferencia')
    .maybeSingle()

  if (data?.value) {
    const v = data.value as Record<string, string>
    return {
      alias: v.alias || "",
      titular: v.titular || "",
      banco: v.banco || "",
    }
  }
  return { alias: "", titular: "", banco: "" }
}

export async function saveTransferConfig(config: TransferConfig): Promise<void> {
  await supabase
    .from('configuracion')
    .upsert({ key: 'transferencia', value: config }, { onConflict: 'key' })
}
