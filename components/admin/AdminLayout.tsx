// components/admin/AdminLayout.tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import {
  Menu,
  ChevronRight,
  Home,
  LogOut,
  Sun,
  Moon,
  Bell,
  Search,
  Settings,
  User,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface AdminLayoutProps {
  children: React.ReactNode
  /** Titre de la page (affiché dans le header) */
  title?: string
  /** Sous-titre / description */
  description?: string
  /** Actions supplémentaires dans le header (boutons, etc.) */
  actions?: React.ReactNode
  /** Afficher le fil d'ariane automatique */
  showBreadcrumb?: boolean
  /** Classes additionnelles pour le contenu principal */
  className?: string
  /** Désactiver la vérification admin (pour les pages accessibles à tous) */
  requireAdmin?: boolean
  /** Composant de fallback pendant le chargement de l'authentification */
  loadingFallback?: React.ReactNode
  /** Composant affiché si l'utilisateur n'est pas admin */
  unauthorizedFallback?: React.ReactNode
}

/* ========================================================================== */
/*  Contexte du layout admin                                                   */
/* ========================================================================== */

interface AdminLayoutContextValue {
  collapsed: boolean
  toggleCollapse: () => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | undefined>(undefined)

export const useAdminLayout = () => {
  const context = useContext(AdminLayoutContext)
  if (!context) throw new Error('useAdminLayout must be used within AdminLayout')
  return context
}

/* ========================================================================== */
/*  Composant AdminLayout                                                     */
/* ========================================================================== */

export function AdminLayout({
  children,
  title,
  description,
  actions,
  showBreadcrumb = true,
  className,
  requireAdmin = true,
  loadingFallback,
  unauthorizedFallback,
}: AdminLayoutProps) {
  const { user, loading: authLoading, isAdmin: contextIsAdmin, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // États
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Détection thème
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    localStorage.setItem('gercie-theme', newTheme)
  }

  // Vérification admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
        return
      }
      if (requireAdmin) {
        if (contextIsAdmin !== undefined) {
          setIsAdmin(contextIsAdmin)
          setChecking(false)
          if (!contextIsAdmin) router.push('/')
        } else {
          // Fallback API
          fetch('/api/user/is-admin')
            .then(res => res.json())
            .then(data => {
              setIsAdmin(data.isAdmin)
              setChecking(false)
              if (!data.isAdmin) router.push('/')
            })
            .catch(() => {
              router.push('/')
              setChecking(false)
            })
        }
      } else {
        setIsAdmin(true)
        setChecking(false)
      }
    }
  }, [authLoading, user, contextIsAdmin, requireAdmin, router, pathname])

  const toggleCollapse = useCallback(() => setCollapsed(prev => !prev), [])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  // Construction automatique du breadcrumb
  const breadcrumbSegments = useMemo(() => {
    if (!showBreadcrumb) return []
    const segments = pathname
      .replace('/admin', '')
      .split('/')
      .filter(Boolean)
      .map((seg, idx, arr) => ({
        label: seg
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase()),
        href: `/admin/${arr.slice(0, idx + 1).join('/')}`,
      }))
    return [{ label: 'Admin', href: '/admin' }, ...segments]
  }, [pathname, showBreadcrumb])

  // Composant de chargement
  if (authLoading || checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        {loadingFallback || (
          <div className="text-center">
            <Spinner size="xl" variant="premium" label="Vérification des accès..." />
          </div>
        )}
      </div>
    )
  }

  // Non admin
  if (requireAdmin && isAdmin === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        {unauthorizedFallback || (
          <div className="text-center space-y-4">
            <ShieldCheck size={48} className="mx-auto text-red-500" />
            <h2 className="text-2xl font-bold text-foreground">Accès réservé</h2>
            <p className="text-muted-foreground">Vous ne disposez pas des droits nécessaires pour accéder à cette page.</p>
            <Link href="/">
              <Button variant="luxe">Retour à l'accueil</Button>
            </Link>
          </div>
        )}
      </div>
    )
  }

  // Contexte du layout
  const layoutContextValue: AdminLayoutContextValue = {
    collapsed,
    toggleCollapse,
    mobileMenuOpen,
    setMobileMenuOpen,
  }

  return (
    <AdminLayoutContext.Provider value={layoutContextValue}>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar (fixe desktop, tiroir mobile) */}
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          isMobile={false} // géré par composant séparé en mobile
          variant="default"
        />

        {/* Version mobile : bouton menu + tiroir */}
        <div className="lg:hidden">
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed top-0 left-0 bottom-0 z-50 w-72 shadow-2xl lg:hidden"
              >
                <AdminSidebar isMobile onMobileClose={() => setMobileMenuOpen(false)} variant="default" />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* Contenu principal */}
        <div
          className={cn(
            'flex-1 transition-all duration-300',
            collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
          )}
        >
          {/* Header */}
          <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 py-3 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-gold-400/10 transition-colors"
              >
                <Menu size={20} />
              </button>
              {!collapsed && (
                <button
                  onClick={toggleCollapse}
                  className="hidden lg:flex p-2 rounded-xl hover:bg-gold-400/10 transition-colors text-muted-foreground"
                >
                  <Menu size={20} />
                </button>
              )}
              <div>
                {title && <h1 className="text-xl font-bold text-foreground font-serif">{title}</h1>}
                {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {actions}
              <Tooltip content={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors text-muted-foreground"
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </Tooltip>
              <Tooltip content="Retour au site">
                <Link
                  href="/"
                  className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors text-muted-foreground"
                >
                  <Home size={18} />
                </Link>
              </Tooltip>
              <Tooltip content="Déconnexion">
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl hover:bg-red-400/10 transition-colors text-muted-foreground hover:text-red-500"
                >
                  <LogOut size={18} />
                </button>
              </Tooltip>
            </div>
          </header>

          {/* Breadcrumb */}
          {showBreadcrumb && (
            <div className="px-4 md:px-8 py-3 border-b border-border bg-muted/30">
              <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                {breadcrumbSegments.map((seg, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight size={14} />}
                    {idx === breadcrumbSegments.length - 1 ? (
                      <span className="font-medium text-foreground">{seg.label}</span>
                    ) : (
                      <Link href={seg.href} className="hover:text-gold-500 transition-colors">
                        {seg.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            </div>
          )}

          {/* Contenu principal */}
          <main className={cn('p-4 md:p-8', className)}>
            {children}
          </main>
        </div>
      </div>
    </AdminLayoutContext.Provider>
  )
}