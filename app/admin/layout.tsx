// app/admin/layout.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  LayoutDashboard, Users, Key, CreditCard, MapPin, ShoppingBag,
  LogOut, AlertCircle, Truck, FileText, ShieldCheck,
  Package, Wallet, Menu, ChevronDown, ChevronRight, Bell,
  Sun, Moon, Home, ChevronLeft, Globe, SquarePlay, Tag, Flag, MessageCircle, LayoutGrid, Landmark, ClipboardCheck,
} from 'lucide-react'

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  badge?: number | string
  children?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  { href: '/admin', icon: LayoutDashboard, label: 'Tableau de bord' },
  { href: '/admin/produits', icon: Package, label: 'Produits', children: [
      { href: '/admin/produits', label: 'Tous les produits' },
      { href: '/admin/produits/ajouter', label: 'Ajouter un produit' },
  ]},
  { href: '/admin/wallet', icon: Wallet, label: 'Wallet central' },
  { href: '/admin/utilisateurs', icon: Users, label: 'Utilisateurs' },
  { href: '/admin/livreurs', icon: Truck, label: 'Livreurs' },
  { href: '/admin/codes', icon: Key, label: "Codes promo" },
  { href: '/admin/retraits', icon: CreditCard, label: 'Demandes de retrait' },
  { href: '/admin/paiements', icon: Landmark, label: 'Paiements' },          // ← nouveau
  { href: '/admin/points-retrait', icon: MapPin, label: 'Points de retrait' },
  { href: '/admin/commandes', icon: ShoppingBag, label: 'Commandes' },
  { href: '/admin/dispatch', icon: ClipboardCheck, label: 'Centre de dispatch' },
  { href: '/admin/litiges', icon: AlertCircle, label: 'Litiges' },
  { href: '/admin/transactions', icon: FileText, label: 'Transactions' },
  { href: '/admin/exchange-rate', icon: CreditCard, label: 'Taux de change' },
  { href: '/admin/livraison', icon: Globe, label: 'Livraison' },
  { href: '/admin/zones', icon: MapPin, label: 'Zones de livraison' },
  { href: '/admin/promotions', icon: Tag, label: 'Promotions' },
  { href: '/admin/home-categories', icon: LayoutGrid, label: 'Catégories populaires' },
  { href: '/admin/promo-banners', icon: Flag, label: 'Bannières promo' },
  { href: '/admin/temoignages', icon: MessageCircle, label: 'Témoignages' },
  { href: '/admin/hero-carousel', icon: SquarePlay, label: 'Gestion du Hero' },
  { href: '/admin/trust', icon: ShieldCheck, label: 'Confiance (stats & avis)' }
]

// Le reste du fichier est inchangé...

const AdminNotifications = () => {
  const [open, setOpen] = useState(false)
  const unread = 3
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-xl hover:bg-gold-400/10 transition-colors">
        <Bell size={20} className="text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card rounded-2xl shadow-strong border border-border overflow-hidden z-50"
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-sm">Notifications</span>
              <button className="text-xs text-gold-500 hover:underline">Tout lire</button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {['Nouvelle commande #542', 'Retrait demandé par Jean', 'Livreur Koffi connecté'].map((msg, i) => (
                <div key={i} className="p-3 rounded-lg hover:bg-gold-400/5 text-sm cursor-pointer transition-colors">
                  <p className="font-medium">{msg}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Il y a {10 * (i + 1)} minutes</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, logout } = useAuth()
  const pathname = usePathname()

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set())
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

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

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    const check = async () => {
      const { data: profile, error } = await supabaseBrowser
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      if (cancelled) return
      setIsAdmin(profile?.is_admin === true)
    }
    check()
    return () => { cancelled = true }
  }, [user])

  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(href))

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Spinner size="xl" variant="premium" label="Vérification des accès..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="text-center space-y-4 p-8 max-w-md">
          <h1 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">Non connecté</h1>
          <p className="text-neutral-600 dark:text-neutral-300">Veuillez vous connecter pour accéder à cette page.</p>
          <Link href={`/login?redirect=/admin`} className="inline-block mt-4 px-4 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition">Se connecter</Link>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="text-center space-y-4 p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Accès refusé</h1>
          <p className="text-neutral-600 dark:text-neutral-300">Vous n’avez pas les droits nécessaires pour accéder à cette page.</p>
          <Link href="/" className="inline-block mt-4 px-4 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition">Retour à l’accueil</Link>
        </div>
      </div>
    )
  }

  const toggleSubmenu = (href: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const sidebarContent = (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-midnight-900 dark:bg-midnight-950 border-r border-gold-400/20">
      {/* En-tête */}
      <div className="flex-shrink-0 p-4 border-b border-gold-400/20 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center shadow-gold">
            <ShieldCheck size={20} className="text-midnight-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gold-400 font-serif">Admin</h1>
            <p className="text-xs text-gold-200/70">Gercie</p>
          </div>
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-neutral-400 hover:text-gold-400 transition-colors">
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Navigation scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <div key={item.href}>
            <Link
              href={item.children ? '#' : item.href}
              onClick={item.children ? (e) => { e.preventDefault(); toggleSubmenu(item.href) } : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group',
                isActive(item.href)
                  ? 'bg-gradient-to-r from-gold-400/20 to-gold-400/10 text-gold-400 border border-gold-400/30 shadow-gold'
                  : 'text-neutral-300 hover:text-gold-400 hover:bg-gold-400/5',
                !sidebarOpen && 'justify-center px-2'
              )}
            >
              <item.icon size={18} className={cn(isActive(item.href) ? 'text-gold-400' : 'text-neutral-400 group-hover:text-gold-400', 'flex-shrink-0')} />
              {sidebarOpen && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && <Badge variant="gold" size="sm">{item.badge}</Badge>}
                  {item.children && <ChevronDown size={14} className={cn('transition-transform', expandedMenus.has(item.href) && 'rotate-180')} />}
                  {isActive(item.href) && !item.children && (
                    <motion.div layoutId="admin-nav-indicator" className="w-1.5 h-5 rounded-full bg-gold-400" transition={{ type: 'spring', stiffness: 300, damping: 25 }} />
                  )}
                </>
              )}
            </Link>

            <AnimatePresence>
              {item.children && expandedMenus.has(item.href) && sidebarOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden ml-6 mt-1 space-y-1 border-l border-gold-400/20 pl-3">
                  {item.children.map((child) => (
                    <Link key={child.href} href={child.href} className={cn('block px-3 py-2 rounded-lg text-sm transition-colors', pathname === child.href ? 'text-gold-400 bg-gold-400/10' : 'text-neutral-400 hover:text-gold-400')}>
                      {child.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gold-400/20 space-y-2">
        {sidebarOpen && (
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 font-bold">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-200 truncate">{user?.email}</p>
              <p className="text-xs text-neutral-400">Administrateur</p>
            </div>
          </div>
        )}
        <button onClick={toggleTheme} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-neutral-400 hover:text-gold-400 hover:bg-gold-400/5 transition-colors w-full">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {sidebarOpen && <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>}
        </button>
        <Link href="/" className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-900 font-bold shadow-gold hover:shadow-glow-gold transition-all duration-300', !sidebarOpen && 'justify-center')}>
          <Home size={16} />
          {sidebarOpen && <span>Retour au site</span>}
        </Link>
        <button onClick={() => logout()} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-colors w-full', !sidebarOpen && 'justify-center')}>
          <LogOut size={16} />
          {sidebarOpen && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex pt-16">
      {/* Sidebar desktop - maintenant en position normale, pas fixed */}
      <aside
        className={cn(
          'hidden lg:block flex-shrink-0 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-[72px]'
        )}
      >
        <div className="sticky top-16">
          {sidebarContent}
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex-1">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 py-3 lg:hidden">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors"><Menu size={20} /></button>
          <div className="flex items-center gap-2"><span className="font-bold text-gold-500 font-serif">Admin Gercie</span></div>
          <Link href="/" className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors"><Home size={20} className="text-muted-foreground" /></Link>
        </header>

        <main className="p-4 md:p-8">
          <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/admin" className="hover:text-gold-500">Admin</Link>
            {pathname.replace('/admin', '').split('/').filter(Boolean).map((segment, idx, arr) => (
              <span key={idx} className="flex items-center gap-2">
                <ChevronRight size={14} />
                <Link href={`/admin/${arr.slice(0, idx + 1).join('/')}`} className="hover:text-gold-500 capitalize">{segment.replace(/-/g, ' ')}</Link>
              </span>
            ))}
          </div>
          {children}
        </main>
      </div>

      {/* Overlay mobile */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
        )}
      </AnimatePresence>

      {/* Sidebar mobile (drawer) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed top-0 left-0 bottom-0 z-50 w-72 lg:hidden shadow-2xl">
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}