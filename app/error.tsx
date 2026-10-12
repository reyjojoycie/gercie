// app/error.tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import Link from 'next/link'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log local sécurisé
    console.error('Erreur capturée par le Error Boundary :', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      {/* ✅ Remplacement du composant <Container> par une div équivalente.
        Cela conserve exactement les mêmes dimensions ('small' / 'max-w-lg') 
        tout en contournant le bug de résolution de Turbopack.
      */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 max-w-lg relative">
        <Card className="text-center shadow-strong">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl">Quelque chose s&apos;est mal passé</CardTitle>
            <CardDescription className="mt-2">
              Une erreur inattendue est survenue. Veuillez réessayer ou revenir à l&apos;accueil.
            </CardDescription>
          </CardHeader>

          {/* Optionnel : afficher les détails en dev uniquement */}
          {process.env.NODE_ENV === 'development' && (
            <CardContent>
              <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 p-4 text-left">
                <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
                  {error.message || 'Erreur inconnue'}
                </p>
                {error.digest && (
                  <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-2">
                    Digest: {error.digest}
                  </p>
                )}
              </div>
            </CardContent>
          )}

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset} variant="primary" leftIcon={<RefreshCcw size={18} />}>
              Réessayer
            </Button>
            <Link href="/" passHref>
              <Button variant="outline" leftIcon={<Home size={18} />}>
                Retour à l&apos;accueil
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}