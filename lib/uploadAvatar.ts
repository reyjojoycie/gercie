// lib/uploadAvatar.ts
import { supabaseBrowser } from './supabaseBrowser'

export async function uploadAvatar(
  userId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const fileExt = file.name.split('.').pop() || 'jpg'
  const fileName = `${userId}/${Date.now()}.${fileExt}`

  const { error } = await supabaseBrowser.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) throw new Error(`Erreur upload : ${error.message}`)

  const { data: publicUrlData } = supabaseBrowser.storage
    .from('avatars')
    .getPublicUrl(fileName)

  return publicUrlData.publicUrl
}