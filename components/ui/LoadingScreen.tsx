// components/ui/LoadingScreen.tsx
export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-brand-200 dark:border-brand-900 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-brand-600 rounded-full animate-spin" />
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Chargement...
        </p>
      </div>
    </div>
  )
}