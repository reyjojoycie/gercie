// app/not-found.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Search, Home, ArrowLeft, Headset } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

export default function NotFoundPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      {/* ✅ Remplacement sécurisé du composant Container par une div native équivalente */}
      <div className="w-full max-w-lg mx-auto px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="text-center shadow-strong">
            <CardHeader>
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
                <Search className="h-10 w-10 text-brand-600 dark:text-brand-400" />
              </div>
              <CardTitle className="text-3xl font-bold">Page introuvable</CardTitle>
              <CardDescription className="mt-2">
                Désolé, la page que vous recherchez n&apos;existe pas ou a été déplacée.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Barre de recherche rapide */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  placeholder="Rechercher un produit…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search size={16} />}
                  inputSize="sm"
                  className="flex-1"
                />
                <Button type="submit" size="sm" variant="primary">
                  Chercher
                </Button>
              </form>
            </CardContent>
            
            <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/" passHref>
                <Button variant="primary" leftIcon={<Home size={18} />} className="w-full sm:w-auto">
                  Retour à l&apos;accueil
                </Button>
              </Link>
              <Button
                variant="outline"
                leftIcon={<ArrowLeft size={18} />}
                onClick={() => router.back()}
                className="w-full sm:w-auto"
              >
                Page précédente
              </Button>
              <Link href="/support" passHref>
                <Button variant="ghost" leftIcon={<Headset size={18} />} className="w-full sm:w-auto">
                  Contacter le support
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}