// app/categories/page.tsx

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Container } from '@/components/layout/Container'
import { useCategories } from '@/hooks/useCategories'
import { Skeleton } from '@/components/ui/Skeleton'
import { Package, ArrowRight, Layers } from 'lucide-react'
import { motion } from 'framer-motion'

export default function CategoriesPage() {
  // Récupération dynamique de l'arbre des catégories (racines uniquement)
  const { data: categories, isLoading } = useCategories()

  // État de chargement avec Skeletons
  if (isLoading) {
    return (
      <Container className="py-12">
        <h1 className="text-3xl font-bold mb-8 text-neutral-900 dark:text-neutral-100 font-serif">
          Toutes les catégories
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </Container>
    )
  }

  return (
    <Container className="py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        {/* En-tête de la page */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-3">
              <Layers className="text-gold-500" size={28} />
              Toutes les catégories
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Explorez notre catalogue complet et trouvez exactement ce que vous cherchez.
            </p>
          </div>
          <p className="text-sm font-medium text-gold-600 dark:text-gold-400 bg-gold-400/10 px-4 py-2 rounded-full self-start sm:self-auto">
            {categories?.length || 0} catégorie{categories?.length !== 1 ? 's' : ''} principale{categories?.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Grille des catégories */}
        {categories && categories.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {categories.map((cat, index) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Link
                  href={`/categories/${cat.slug}`}
                  className="group relative flex flex-col h-full p-6 bg-white/50 dark:bg-midnight-800/50 backdrop-blur rounded-xl border border-gold-400/20 hover:border-gold-400/50 hover:shadow-gold transition-all duration-300"
                >
                  {/* Image ou Icône de fallback */}
                  <div className="mb-4 w-16 h-16 rounded-2xl bg-gold-400/10 flex items-center justify-center group-hover:bg-gold-400/20 transition-colors overflow-hidden flex-shrink-0">
                    {cat.image_url ? (
                      <Image
                        src={cat.image_url}
                        alt={cat.nom}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-gold-500" />
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-gold-600 dark:group-hover:text-gold-400 transition-colors mb-2">
                      {cat.nom}
                    </h3>
                    
                    {cat.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {cat.description}
                      </p>
                    )}
                    
                    {cat.children && cat.children.length > 0 && (
                      <p className="text-xs text-gold-500/80 font-medium flex items-center gap-1">
                        <Layers size={12} />
                        {cat.children.length} sous-catégorie{cat.children.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Indicateur d'action au survol */}
                  <div className="mt-4 flex items-center text-sm font-medium text-gold-600 dark:text-gold-400 opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all duration-300">
                    Explorer
                    <ArrowRight size={16} className="ml-1" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          // État vide
          <div className="text-center py-20 bg-card rounded-xl border border-border">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Aucune catégorie trouvée</h3>
            <p className="text-muted-foreground">Les catégories seront bientôt disponibles.</p>
          </div>
        )}
      </motion.div>
    </Container>
  )
}