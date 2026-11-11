import { useQuery } from '@tanstack/react-query'

/* ========================================================================== */
/*  TYPES & INTERFACES                                                        */
/* ========================================================================== */

/**
 * Représente un nœud de catégorie.
 *
 * `name` est un alias de `nom` pour compatibilité avec les anciens composants UI.
 */
export interface CategoryNode {
  id: string
  nom: string
  name: string
  slug: string
  parent_id: string | null
  image_url: string | null
  icone: string | null
  description: string | null
  chemin_complet: string
  ordre: number
  actif: boolean
  afficher_accueil: boolean
  ordre_accueil: number
  children?: CategoryNode[]
}

/* ========================================================================== */
/*  FONCTIONS UTILITAIRES DE CONSTRUCTION D'ARBRE                             */
/* ========================================================================== */

/**
 * Transforme une liste plate de catégories en arbre hiérarchique.
 */
export function buildCategoryTree(flatCategories: CategoryNode[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  const roots: CategoryNode[] = []

  // 1. Créer une map de tous les nœuds
  flatCategories.forEach((cat) => {
    map.set(cat.id, { ...cat, name: cat.nom, children: [] })
  })

  // 2. Relier les enfants à leurs parents
  flatCategories.forEach((cat) => {
    const node = map.get(cat.id)!

    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })

  // 3. Trier récursivement
  const sortChildren = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))

    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortChildren(node.children)
      }
    })
  }

  sortChildren(roots)

  return roots
}

/**
 * Transforme un arbre en liste plate avec profondeur.
 */
export function flattenTree(
  tree: CategoryNode[],
  depth = 0
): (CategoryNode & { depth: number })[] {
  const result: (CategoryNode & { depth: number })[] = []

  const walk = (nodes: CategoryNode[], currentDepth: number) => {
    nodes.forEach((node) => {
      result.push({ ...node, depth: currentDepth })

      if (node.children && node.children.length > 0) {
        walk(node.children, currentDepth + 1)
      }
    })
  }

  walk(tree, depth)

  return result
}

/* ========================================================================== */
/*  FONCTIONS UTILITAIRES DE RECHERCHE                                        */
/* ========================================================================== */

/**
 * Trouve une catégorie par ID dans un arbre.
 */
export function findCategoryById(
  tree: CategoryNode[],
  id: string
): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node

    if (node.children) {
      const found = findCategoryById(node.children, id)
      if (found) return found
    }
  }

  return null
}

/**
 * Trouve une catégorie par slug dans un arbre.
 */
export function findCategoryBySlug(
  tree: CategoryNode[],
  slug: string
): CategoryNode | null {
  for (const node of tree) {
    if (node.slug === slug) return node

    if (node.children) {
      const found = findCategoryBySlug(node.children, slug)
      if (found) return found
    }
  }

  return null
}

/**
 * Retourne le chemin complet sous forme de tableau.
 */
export function getCategoryPath(tree: CategoryNode[], id: string): string[] {
  const path: string[] = []

  function search(nodes: CategoryNode[]): boolean {
    for (const node of nodes) {
      path.push(node.nom)

      if (node.id === id) return true

      if (node.children && search(node.children)) return true

      path.pop()
    }

    return false
  }

  search(tree)

  return path
}

/**
 * Retourne le chemin complet sous forme de chaîne.
 * Exemple : "Électronique > Smartphones"
 */
export function getCategoryFullPath(tree: CategoryNode[], id: string): string {
  return getCategoryPath(tree, id).join(' > ')
}

/**
 * Retourne les enfants directs d’un parent.
 */
export function getSubCategories(
  tree: CategoryNode[],
  parentId: string | null
): CategoryNode[] {
  if (!parentId) return tree.filter((c) => !c.parent_id)

  const parent = findCategoryById(tree, parentId)
  return parent?.children || []
}

/* ========================================================================== */
/*  HOOKS REACT QUERY                                                         */
/* ========================================================================== */

/**
 * Hook pour récupérer toutes les catégories actives publiques.
 * Utilisé pour navbar, pages catégories, recherche, etc.
 */
export function useCategories() {
  return useQuery<CategoryNode[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', {
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Erreur API catégories : ${res.status} ${text}`)
      }

      const data = await res.json()
      return buildCategoryTree(data)
    },
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Hook pour récupérer les catégories de la page d'accueil.
 *
 * Important :
 * - pas de cache React Query long ;
 * - fetch no-store ;
 * - refetch au montage ;
 * - renvoie uniquement les catégories actives + afficher_accueil = true.
 */
export function useHomeCategories() {
  return useQuery<CategoryNode[]>({
    queryKey: ['home-categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories?accueil=true', {
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Erreur API catégories accueil : ${res.status} ${text}`)
      }

      const data = await res.json()

      return data.map((c: any) => ({
        ...c,
        name: c.nom,
      }))
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

/**
 * Hook pour l’administration.
 * Récupère toutes les catégories, actives ou inactives.
 */
export function useAdminCategories() {
  return useQuery<CategoryNode[]>({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const res = await fetch('/api/admin/categories', {
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Erreur API admin catégories : ${res.status} ${text}`)
      }

      const data = await res.json()
      return buildCategoryTree(data)
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}