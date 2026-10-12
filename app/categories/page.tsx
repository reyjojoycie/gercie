// app/categories/page.tsx
import { categoryTree } from '@/lib/categories'
import Link from 'next/link'
import { Container } from '@/components/layout/Container'

export default function CategoriesPage() {
  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold mb-8 text-neutral-900 dark:text-neutral-100 font-serif">
        Toutes les catégories
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {categoryTree.map(cat => (
          <Link
            key={cat.id}
            href={`/categories/${cat.id}`}
            className="p-6 bg-white/50 dark:bg-midnight-800/50 backdrop-blur rounded-xl border border-gold-400/20 hover:shadow-gold transition-all"
          >
            <span className="text-lg font-medium text-neutral-800 dark:text-neutral-200">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </Container>
  )
}