-- Migration initiale pour Gercie
-- Crée les tables essentielles et applique les RLS

-- Active l'extension uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== PROFILS ==========
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  nom TEXT NOT NULL DEFAULT '',
  prenom TEXT NOT NULL DEFAULT '',
  telephone TEXT,
  avatar_url TEXT,
  adresse_boutique TEXT,
  type_user TEXT DEFAULT 'acheteur' CHECK (type_user IN ('acheteur', 'vendeur')),
  is_admin BOOLEAN DEFAULT false,
  points_fidelite INTEGER DEFAULT 0,
  total_depense INTEGER DEFAULT 0,
  question_secrete TEXT,
  reponse_secrete TEXT,
  adresses_livraison JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active RLS sur profils
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les profils sont visibles par tous" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Les utilisateurs peuvent modifier leur propre profil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ========== VENDEURS ==========
CREATE TABLE IF NOT EXISTS public.vendeurs (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  actif BOOLEAN DEFAULT true,
  boutique_nom TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vendeurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès public" ON public.vendeurs FOR SELECT USING (true);

-- ========== LIVREURS ==========
CREATE TABLE IF NOT EXISTS public.livreurs (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  est_actif BOOLEAN DEFAULT true,
  est_disponible BOOLEAN DEFAULT true,
  total_livraisons INTEGER DEFAULT 0,
  distance_parcourue_km FLOAT DEFAULT 0,
  evaluation_moyenne FLOAT DEFAULT 0,
  zone_operation_principale TEXT,
  photo_url TEXT,
  moto_modele TEXT,
  moto_plaque TEXT,
  derniere_activite TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.livreurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès public" ON public.livreurs FOR SELECT USING (true);

-- ========== PRODUITS ==========
CREATE TABLE IF NOT EXISTS public.produits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vendeur_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  prix INTEGER NOT NULL,
  prix_usd NUMERIC,
  images TEXT[] DEFAULT '{}',
  video_url TEXT,
  categorie TEXT,
  stock INTEGER DEFAULT 0,
  negociable BOOLEAN DEFAULT false,
  est_actif BOOLEAN DEFAULT true,
  variantes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Produits visibles par tous" ON public.produits FOR SELECT USING (est_actif = true);
CREATE POLICY "Vendeur peut gérer ses produits" ON public.produits
  FOR ALL USING (auth.uid() = vendeur_id);

-- ========== COMMANDES ==========
CREATE TABLE IF NOT EXISTS public.commandes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  acheteur_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  numero_commande TEXT UNIQUE NOT NULL,
  statut TEXT DEFAULT 'en_attente',
  total_articles INTEGER DEFAULT 0,
  frais_livraison INTEGER DEFAULT 0,
  total_global INTEGER DEFAULT 0,
  type_livraison TEXT,
  adresse_livraison TEXT,
  commune_livraison_id INTEGER,
  point_retrait_id INTEGER,
  code_livraison TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acheteur voit ses commandes" ON public.commandes
  FOR SELECT USING (auth.uid() = acheteur_id);
CREATE POLICY "Acheteur peut créer une commande" ON public.commandes
  FOR INSERT WITH CHECK (auth.uid() = acheteur_id);

-- ========== ARTICLES DE COMMANDE ==========
CREATE TABLE IF NOT EXISTS public.commande_articles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  commande_id UUID REFERENCES public.commandes(id) ON DELETE CASCADE,
  produit_id UUID REFERENCES public.produits(id),
  quantite INTEGER DEFAULT 1,
  prix_unitaire INTEGER NOT NULL,
  specifications TEXT,
  variante JSONB,
  code_vendeur TEXT,
  code_acheteur TEXT,
  statut_collecte TEXT DEFAULT 'en_attente',
  motif_refus TEXT,
  photo_preuve TEXT,
  collecte_validee_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== PORTEFEUILLES ==========
CREATE TABLE IF NOT EXISTS public.portefeuilles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  solde_achat INTEGER DEFAULT 0,
  solde_vente INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.portefeuilles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Un utilisateur voit son portefeuille" ON public.portefeuilles
  FOR SELECT USING (auth.uid() = id);

-- ========== TRANSACTIONS ==========
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  montant INTEGER NOT NULL,
  description TEXT,
  commande_id UUID REFERENCES public.commandes(id),
  portefeuille_type TEXT,
  status TEXT DEFAULT 'approved',
  method TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== NOTIFICATIONS ==========
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Voir ses notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);