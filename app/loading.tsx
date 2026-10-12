// app/loading.tsx
import { Spinner } from '@/components/ui/Spinner'

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <Spinner size="xl" variant="brand" label="Chargement..." />
    </div>
  )
}
