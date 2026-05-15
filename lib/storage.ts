// lib/storage.ts
import { supabase } from '@/lib/supabase'

export const storageService = {
  /**
   * Sube un archivo PDF a Supabase Storage
   */
  async uploadPDF(
    fileBuffer: Buffer,
    path: string,
    filename: string
  ): Promise<string> {
    const filePath = `${path}/${filename}`
    const { error } = await supabase.storage
      .from('facturas')
      .upload(filePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('facturas')
      .getPublicUrl(filePath)

    return publicUrl
  },

  /**
   * Elimina un archivo de Storage
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await supabase.storage.from('facturas').remove([path])
    } catch (error) {
      console.error('Error eliminando archivo:', error)
    }
  },

  /**
   * Genera nombre unico para el archivo
   */
  generateFilename(saleId: string, type: 'boleta' | 'remito'): string {
    const timestamp = Date.now()
    return `${type}-${saleId}-${timestamp}.pdf`
  },
}
