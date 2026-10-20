// lib/utils/relativeTime.ts
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  if (diffHours < 24) return `il y a ${diffHours} h`
  if (diffDays < 30) return `il y a ${diffDays} j`
  return then.toLocaleDateString('fr-FR')
}

export function formatAbsoluteDate(date: string | Date): string {
  return new Date(date).toLocaleString('fr-FR')
}