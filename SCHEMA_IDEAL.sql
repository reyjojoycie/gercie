--
-- Fichier de schéma SQL idéal pour Supabase (Gercie Marketplace - Mono-vendeur)
-- Intègre toutes les tables et RLS basées sur le code TypeScript fourni et les règles métiers.
--

-- Active l'extension uuid-ossp pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fonction utilitaire pour mettre à jour la colonne 'updated_at' automatiquement
CREATE OR REPLACE FUNCTION public.moddatetime()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------------------------------
-- 1. Tables de gestion des utilisateurs et profils
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.profiles' : Étend la table auth.users de Supabase avec des informations spécifiques
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nom text,
  prenom text,
  email text UNIQUE,
  telephone text UNIQUE,
  avatar_url text, -- Ajouté: pour la photo de profil
  est_actif boolean DEFAULT TRUE,
  email_verified boolean DEFAULT FALSE, -- Ajouté: statut de vérification d'email
  phone_verified boolean DEFAULT FALSE, -- Ajouté: statut de vérification de téléphone
  onboarding_completed boolean DEFAULT FALSE, -- Ajouté: suivi de l'onboarding
  terms_accepted_at timestamp with time zone, -- Ajouté: date d'acceptation des CGU
  question_secrete text, -- Ajouté: question secrète pour récupération ( hashed )
  preferences jsonb DEFAULT '{}'::jsonb, -- Ajouté: préférences utilisateur (ex: thème, notifications)
  is_admin boolean DEFAULT FALSE, -- Indicateur d'administrateur
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  derniere_connexion timestamp with time zone -- Utile pour suivre l'activité
);

-- Index pour la performance
CREATE INDEX profiles_email_idx ON public.profiles (email);
CREATE INDEX profiles_telephone_idx ON public.profiles (telephone);
CREATE INDEX profiles_is_admin_idx ON public.profiles (is_admin);

-- Trigger pour mettre à jour 'updated_at'
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- Fonction pour créer un profil après l'inscription d'un utilisateur Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, derniere_connexion)
  VALUES (NEW.id, NEW.email, NEW.created_at, NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Déclencheur sur la table auth.users pour créer un profil
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS pour la table 'profiles'
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateurs peuvent voir leur propre profil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Utilisateurs peuvent mettre à jour leur propre profil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Les admins peuvent voir tous les profils" ON public.profiles
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Les admins peuvent mettre à jour tous les profils" ON public.profiles
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Les admins peuvent supprimer des profils" ON public.profiles
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Table 'public.user_sessions' : Suivi détaillé des sessions utilisateur
CREATE TABLE public.user_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  ip_address inet NOT NULL,
  user_agent text NOT NULL,
  country text,
  city text,
  is_current boolean DEFAULT FALSE, -- Indique si c'est la session active
  created_at timestamp with time zone DEFAULT now(),
  last_active timestamp with time zone DEFAULT now()
);

CREATE INDEX user_sessions_user_id_idx ON public.user_sessions (user_id);
CREATE INDEX user_sessions_ip_address_idx ON public.user_sessions (ip_address);
CREATE INDEX user_sessions_last_active_idx ON public.user_sessions (last_active);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'user_sessions'
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateur peut voir et gérer ses propres sessions" ON public.user_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent voir toutes les sessions" ON public.user_sessions
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Les admins peuvent supprimer des sessions" ON public.user_sessions
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 2. Tables de gestion des adresses géographiques
-- ----------------------------------------------------------------------------------------------------

-- Les tables de géographie sont souvent gérées en dehors du RLS car elles contiennent des données publiques
CREATE TABLE public.provinces (
  id integer PRIMARY KEY,
  nom text NOT NULL UNIQUE
);

CREATE TABLE public.villes (
  id integer PRIMARY KEY,
  province_id integer REFERENCES public.provinces(id) ON DELETE CASCADE NOT NULL,
  nom text NOT NULL,
  UNIQUE(province_id, nom)
);
CREATE INDEX villes_province_id_idx ON public.villes (province_id);

CREATE TABLE public.communes (
  id integer PRIMARY KEY,
  ville_id integer REFERENCES public.villes(id) ON DELETE CASCADE NOT NULL,
  nom text NOT NULL,
  UNIQUE(ville_id, nom)
);
CREATE INDEX communes_ville_id_idx ON public.communes (ville_id);

-- Table 'public.addresses' : Adresses enregistrées par les utilisateurs
CREATE TABLE public.addresses (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  nom text, -- Nom donné à l'adresse (ex: "Maison", "Bureau")
  destinataire text, -- Nom du destinataire de l'adresse
  telephone text,
  province_id integer REFERENCES public.provinces(id) ON DELETE SET NULL,
  ville_id integer REFERENCES public.villes(id) ON DELETE SET NULL,
  commune_id integer REFERENCES public.communes(id) ON DELETE SET NULL,
  quartier text,
  avenue text,
  numero text,
  reference text,
  is_default boolean DEFAULT FALSE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX addresses_user_id_idx ON public.addresses (user_id);
CREATE INDEX addresses_commune_id_idx ON public.addresses (commune_id);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'addresses'
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateurs peuvent gérer leurs propres adresses" ON public.addresses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent voir toutes les adresses" ON public.addresses
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 3. Tables de gestion des produits
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.categories'
CREATE TABLE public.categories (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE, -- Pour des URL propres
  description text,
  image_url text,
  ordre integer DEFAULT 0, -- Pour l'affichage des catégories sur la page d'accueil par exemple
  est_active boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'categories'
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les catégories actives" ON public.categories
  FOR SELECT USING (est_active = TRUE);
CREATE POLICY "Les admins peuvent gérer les catégories" ON public.categories
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Table 'public.popular_categories_config'
CREATE TABLE public.popular_categories_config (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  display_name text,
  image_url text,
  ordre integer DEFAULT 0,
  actif boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(category_id)
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.popular_categories_config
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'popular_categories_config'
ALTER TABLE public.popular_categories_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les catégories populaires actives" ON public.popular_categories_config
  FOR SELECT USING (actif = TRUE);
CREATE POLICY "Les admins peuvent gérer les catégories populaires" ON public.popular_categories_config
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.produits'
CREATE TABLE public.produits (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  categorie_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  nom text NOT NULL,
  slug text UNIQUE, -- Ajouté: Pour les URL propres
  description text,
  prix numeric(10, 2) NOT NULL CHECK (prix >= 0),
  prix_usd numeric(10, 2) NOT NULL CHECK (prix_usd >= 0), -- Ajouté: Prix en USD
  prix_cdf numeric(10, 2) NOT NULL CHECK (prix_cdf >= 0), -- Ajouté: Prix en CDF
  prix_original_usd numeric(10, 2) CHECK (prix_original_usd >= 0), -- Ajouté: Prix original en USD
  prix_original_cdf numeric(10, 2) CHECK (prix_original_cdf >= 0), -- Ajouté: Prix original en CDF
  remise_percent numeric(5, 2) DEFAULT 0 CHECK (remise_percent >= 0 AND remise_percent <= 100), -- Ajouté: Pourcent de remise
  images text[], -- Tableau d'URLs d'images
  image text, -- Ajouté: Image principale
  video_url text, -- Ajouté: URL de vidéo du produit
  est_actif boolean DEFAULT TRUE,
  stock integer DEFAULT 0 CHECK (stock >= 0),
  sku text UNIQUE, -- Stock Keeping Unit
  barcode text UNIQUE, -- Ajouté: Code-barres
  tags text[], -- Ajouté: Tags du produit
  badges text[], -- Ajouté: Badges du produit
  marque text, -- Ajouté: Marque du produit

  -- Dimensions et poids
  poids_kg numeric(8, 3) CHECK (poids_kg >= 0), -- Ajouté: Poids en KG
  longueur_cm numeric(8, 2) CHECK (longueur_cm >= 0), -- Ajouté: Longueur en CM
  largeur_cm numeric(8, 2) CHECK (largeur_cm >= 0), -- Ajouté: Largeur en CM
  hauteur_cm numeric(8, 2) CHECK (hauteur_cm >= 0), -- Ajouté: Hauteur en CM

  -- Infos de livraison
  delay_livraison text, -- Ajouté: Délai de livraison
  livraison_domicile numeric(10, 2) CHECK (livraison_domicile >= 0), -- Ajouté: Frais livraison domicile
  livraison_point_retrait numeric(10, 2) CHECK (livraison_point_retrait >= 0), -- Ajouté: Frais livraison point retrait
  livraison_express numeric(10, 2) CHECK (livraison_express >= 0), -- Ajouté: Frais livraison express
  express_gratuit boolean DEFAULT FALSE, -- Ajouté: Si livraison express gratuite
  livraison_domicile_active boolean DEFAULT TRUE, -- Ajouté: Activation du mode
  livraison_point_retrait_active boolean DEFAULT TRUE, -- Ajouté: Activation du mode
  livraison_express_active boolean DEFAULT FALSE, -- Ajouté: Activation du mode
  delivery_config jsonb, -- Ajouté: Configuration avancée de livraison

  -- SEO et notes
  meta_title text, -- Ajouté: Titre SEO
  meta_description text, -- Ajouté: Description SEO
  notes_internes text, -- Ajouté: Notes internes

  -- Statistiques produit
  total_ventes integer DEFAULT 0 CHECK (total_ventes >= 0), -- Ajouté: Total des ventes
  note_moyenne numeric(3, 2) DEFAULT 0.00 CHECK (note_moyenne >= 0 AND note_moyenne <= 5), -- Ajouté: Note moyenne

  -- Contenu riche
  rich_content jsonb, -- Ajouté: Pour le contenu riche (sections, hero, etc.)

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX produits_categorie_id_idx ON public.produits (categorie_id);
CREATE INDEX produits_est_actif_idx ON public.produits (est_actif);
CREATE INDEX produits_slug_idx ON public.produits (slug);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'produits'
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les produits actifs" ON public.produits
  FOR SELECT USING (est_actif = TRUE);
CREATE POLICY "Les admins peuvent gérer tous les produits" ON public.produits
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.product_variant_attributes' : Définition des attributs de variantes (ex: "Couleur", "Taille")
CREATE TABLE public.product_variant_attributes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  produit_id uuid REFERENCES public.produits(id) ON DELETE CASCADE NOT NULL,
  key text NOT NULL, -- Clé de l'attribut (ex: "color", "size")
  label text NOT NULL, -- Label affiché (ex: "Couleur", "Taille")
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'size', 'color', 'image', 'swatch', 'model')),
  required boolean DEFAULT FALSE,
  options jsonb DEFAULT '[]'::jsonb, -- Options possibles (ex: [{"value": "red", "label": "Rouge"}])
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(produit_id, key)
);

CREATE INDEX product_variant_attributes_produit_id_idx ON public.product_variant_attributes (produit_id);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.product_variant_attributes
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'product_variant_attributes'
ALTER TABLE public.product_variant_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les attributs de variantes des produits actifs" ON public.product_variant_attributes
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.produits WHERE id = produit_id AND est_actif = TRUE));
CREATE POLICY "Les admins peuvent gérer les attributs de variantes" ON public.product_variant_attributes
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.product_variants' : Variantes spécifiques d'un produit
CREATE TABLE public.product_variants (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  produit_id uuid REFERENCES public.produits(id) ON DELETE CASCADE NOT NULL,
  attributes jsonb NOT NULL, -- Record<string, string> des attributs (ex: {"color": "red", "size": "M"})
  stock integer NOT NULL CHECK (stock >= 0),
  prix_specifique_usd numeric(10, 2) CHECK (prix_specifique_usd >= 0),
  prix_specifique_cdf numeric(10, 2) CHECK (prix_specifique_cdf >= 0),
  prix_original_usd numeric(10, 2) CHECK (prix_original_usd >= 0),
  prix_original_cdf numeric(10, 2) CHECK (prix_original_cdf >= 0),
  sku text UNIQUE,
  barcode text UNIQUE,
  image text,
  images text[],
  color_hex text,
  is_default boolean DEFAULT FALSE,
  is_active boolean DEFAULT TRUE,
  poids_kg numeric(8, 3) CHECK (poids_kg >= 0),
  longueur_cm numeric(8, 2) CHECK (longueur_cm >= 0),
  largeur_cm numeric(8, 2) CHECK (largeur_cm >= 0),
  hauteur_cm numeric(8, 2) CHECK (hauteur_cm >= 0),
  specs jsonb, -- Spécifications additionnelles pour la variante
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(produit_id, attributes) -- Assure l'unicité des combinaisons d'attributs par produit
);

CREATE INDEX product_variants_produit_id_idx ON public.product_variants (produit_id);
CREATE INDEX product_variants_sku_idx ON public.product_variants (sku);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'product_variants'
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les variantes des produits actifs" ON public.product_variants
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.produits WHERE id = produit_id AND est_actif = TRUE));
CREATE POLICY "Les admins peuvent gérer les variantes de produits" ON public.product_variants
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 4. Tables de gestion des commandes et livraisons
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.pickup_points' : Points de retrait pour la livraison
CREATE TABLE public.pickup_points (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom text NOT NULL,
  adresse text NOT NULL,
  telephone text,
  email text,
  whatsapp text,
  commune_id integer REFERENCES public.communes(id) ON DELETE SET NULL,
  province_nom text,
  ville_nom text,
  quartier text,
  horaires text,
  contact_nom text,
  type_etablissement text,
  photo_url text,
  points_de_repere text,
  instructions_retrait text,
  est_partenaire_verifie boolean DEFAULT FALSE,
  note_moyenne numeric(3, 2) DEFAULT 0.00 CHECK (note_moyenne >= 0 AND note_moyenne <= 5),
  capacite integer CHECK (capacite >= 0),
  delai_moyen_heures numeric(5, 2) CHECK (delai_moyen_heures >= 0),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX pickup_points_commune_id_idx ON public.pickup_points (commune_id);
CREATE INDEX pickup_points_est_partenaire_verifie_idx ON public.pickup_points (est_partenaire_verifie);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pickup_points
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'pickup_points'
ALTER TABLE public.pickup_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les points de retrait actifs" ON public.pickup_points
  FOR SELECT USING (TRUE); -- À ajuster si certains points ne sont pas publics
CREATE POLICY "Les admins peuvent gérer les points de retrait" ON public.pickup_points
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.commandes'
CREATE TABLE public.commandes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'payee', 'en_preparation', 'expediee', 'livree', 'annulee', 'remboursee')),
  total_montant numeric(10, 2) NOT NULL CHECK (total_montant >= 0),
  total_articles integer NOT NULL CHECK (total_articles >= 0), -- Ajouté: Nombre total d'articles
  frais_livraison numeric(10, 2) NOT NULL DEFAULT 0.00 CHECK (frais_livraison >= 0), -- Ajouté: Frais de livraison
  type_livraison text NOT NULL CHECK (type_livraison IN ('domicile', 'point_retrait', 'express')), -- Ajouté: Type de livraison

  adresse_livraison text, -- Ajouté: Adresse de livraison formatée
  commune_livraison_id integer REFERENCES public.communes(id) ON DELETE SET NULL, -- Ajouté: ID de la commune de livraison
  point_retrait_id uuid REFERENCES public.pickup_points(id) ON DELETE SET NULL, -- Ajouté: ID du point de retrait

  express boolean DEFAULT FALSE, -- Ajouté: Si livraison express
  message_cadeau text, -- Ajouté: Message cadeau
  delivery_note text, -- Ajouté: Notes de livraison

  code_promo text, -- Ajouté: Code promo utilisé
  reduction numeric(10, 2) DEFAULT 0.00 CHECK (reduction >= 0), -- Ajouté: Montant de la réduction
  remise_percent numeric(5, 2) DEFAULT 0 CHECK (remise_percent >= 0 AND remise_percent <= 100), -- Ajouté: Pourcent de remise du code promo
  remise_montant numeric(10, 2) DEFAULT 0.00 CHECK (remise_montant >= 0), -- Ajouté: Montant de la remise

  currency text NOT NULL CHECK (currency IN ('USD', 'CDF')), -- Ajouté: Devise de la commande
  total_usd numeric(10, 2) NOT NULL CHECK (total_usd >= 0), -- Ajouté: Total en USD
  total_cdf numeric(10, 2) NOT NULL CHECK (total_cdf >= 0), -- Ajouté: Total en CDF

  shipping_usd numeric(10, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_usd >= 0), -- Ajouté: Frais livraison en USD
  shipping_cdf numeric(10, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cdf >= 0), -- Ajouté: Frais livraison en CDF

  shipping_rate_used numeric(10, 4), -- Ajouté: Taux de change utilisé pour la livraison
  exchange_rate numeric(10, 4), -- Ajouté: Taux de change global utilisé pour la commande

  shipping_breakdown jsonb, -- Ajouté: Détail des frais de livraison (JSON)
  shipping_delay_label text, -- Ajouté: Label du délai de livraison

  mode_paiement text,
  transaction_id text, -- ID de transaction du fournisseur de paiement
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX commandes_user_id_idx ON public.commandes (user_id);
CREATE INDEX commandes_statut_idx ON public.commandes (statut);
CREATE INDEX commandes_commune_livraison_id_idx ON public.commandes (commune_livraison_id);
CREATE INDEX commandes_point_retrait_id_idx ON public.commandes (point_retrait_id);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.commandes
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'commandes'
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir leurs propres commandes" ON public.commandes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent créer des commandes" ON public.commandes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent voir et gérer toutes les commandes" ON public.commandes
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.commande_items'
CREATE TABLE public.commande_items (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  commande_id uuid REFERENCES public.commandes(id) ON DELETE CASCADE NOT NULL,
  produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(10, 2) NOT NULL CHECK (prix_unitaire >= 0),
  prix_unitaire_usd numeric(10, 2) NOT NULL CHECK (prix_unitaire_usd >= 0), -- Ajouté: Prix unitaire en USD
  specifications text, -- Ajouté: Spécifications de la variante (label)
  variante text, -- Ajouté: Nom de la variante (label)
  variant_key text, -- Ajouté: Clé canonique de la variante
  variant_attributes jsonb, -- Ajouté: Attributs de la variante (JSON)
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX commande_items_commande_id_idx ON public.commande_items (commande_id);
CREATE INDEX commande_items_produit_id_idx ON public.commande_items (produit_id);

-- RLS pour la table 'commande_items'
ALTER TABLE public.commande_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir les articles de leurs commandes" ON public.commande_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.commandes WHERE id = commande_id AND user_id = auth.uid()));
CREATE POLICY "Les utilisateurs peuvent insérer des articles dans leurs commandes" ON public.commande_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.commandes WHERE id = commande_id AND user_id = auth.uid()));
CREATE POLICY "Les admins peuvent gérer tous les articles de commande" ON public.commande_items
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 5. Tables de communication et support
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.conversations'
CREATE TABLE public.conversations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  commande_id uuid REFERENCES public.commandes(id) ON DELETE CASCADE, -- Optionnel, si la conversation est liée à une commande
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL, -- Expéditeur du message
  destinataire_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- Destinataire du message (si privé)
  message text NOT NULL,
  est_lu boolean DEFAULT FALSE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX conversations_commande_id_idx ON public.conversations (commande_id);
CREATE INDEX conversations_user_id_idx ON public.conversations (user_id);
CREATE INDEX conversations_destinataire_id_idx ON public.conversations (destinataire_id);

-- RLS pour la table 'conversations'
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les participants peuvent voir la conversation" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = destinataire_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
CREATE POLICY "Les participants peuvent insérer des messages" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent gérer toutes les conversations" ON public.conversations
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 6. Tables des témoignages et section "Confiance"
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.testimonial_settings' : Configuration des témoignages
CREATE TABLE public.testimonial_settings (
  id text PRIMARY KEY DEFAULT 'global',
  allow_anonymous_submissions boolean DEFAULT TRUE,
  require_login_to_post boolean DEFAULT FALSE,
  auto_publish_authenticated boolean DEFAULT FALSE,
  default_rating integer DEFAULT 5 CHECK (default_rating >= 1 AND default_rating <= 5),
  max_featured integer DEFAULT 6 CHECK (max_featured >= 0),
  moderation_message text,
  show_product_field boolean DEFAULT TRUE,
  show_avatar_field boolean DEFAULT TRUE,
  show_likes boolean DEFAULT TRUE,
  advanced_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.testimonial_settings
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'testimonial_settings'
ALTER TABLE public.testimonial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les paramètres de témoignages" ON public.testimonial_settings
  FOR SELECT USING (TRUE);
CREATE POLICY "Les admins peuvent gérer les paramètres de témoignages" ON public.testimonial_settings
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.testimonials' : Témoignages clients généraux
CREATE TABLE public.testimonials (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auteur_nom text NOT NULL,
  role text, -- Rôle ou fonction de l'auteur
  avatar_url text, -- URL de l'avatar de l'auteur
  contenu text NOT NULL,
  note integer NOT NULL CHECK (note >= 1 AND note <= 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'archived')), -- Statut du témoignage
  date_soumission timestamp with time zone DEFAULT now(), -- Ajouté: date de soumission
  published_at timestamp with time zone, -- Ajouté: date de publication
  product_id uuid REFERENCES public.produits(id) ON DELETE SET NULL, -- Ajouté: produit associé
  verified boolean DEFAULT FALSE, -- Ajouté: si l'auteur est vérifié
  likes integer DEFAULT 0 CHECK (likes >= 0), -- Ajouté: nombre de likes
  admin_response text, -- Ajouté: réponse de l'admin
  is_featured boolean DEFAULT FALSE, -- Ajouté: si mis en avant
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX testimonials_status_idx ON public.testimonials (status);
CREATE INDEX testimonials_product_id_idx ON public.testimonials (product_id);
CREATE INDEX testimonials_is_featured_idx ON public.testimonials (is_featured);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'testimonials'
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut voir les témoignages publiés" ON public.testimonials
  FOR SELECT USING (status = 'published');
CREATE POLICY "Les utilisateurs authentifiés peuvent soumettre des témoignages" ON public.testimonials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent gérer tous les témoignages" ON public.testimonials
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.trust_settings' : Configuration de la section "Confiance"
CREATE TABLE public.trust_settings (
  id text PRIMARY KEY DEFAULT 'global',
  show_header boolean DEFAULT TRUE,
  section_title text,
  section_subtitle text,
  badge_text text,
  show_stats boolean DEFAULT TRUE,
  show_testimonials boolean DEFAULT TRUE,
  stats_columns integer DEFAULT 8 CHECK (stats_columns >= 1 AND stats_columns <= 12),
  testimonials_display_mode text DEFAULT 'rotate' CHECK (testimonials_display_mode IN ('rotate', 'grid')),
  testimonials_max_display integer DEFAULT 1 CHECK (testimonials_max_display >= 1 AND testimonials_max_display <= 12),
  autoplay_interval_ms integer DEFAULT 6000 CHECK (autoplay_interval_ms >= 0),
  pause_on_hover boolean DEFAULT TRUE,
  animation_enabled boolean DEFAULT TRUE,
  show_rating_stars boolean DEFAULT TRUE,
  show_avatar_initials boolean DEFAULT TRUE,
  accent_color text DEFAULT 'gold',
  advanced_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.trust_settings
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'trust_settings'
ALTER TABLE public.trust_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les paramètres de confiance" ON public.trust_settings
  FOR SELECT USING (TRUE);
CREATE POLICY "Les admins peuvent gérer les paramètres de confiance" ON public.trust_settings
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.trust_stats' : Statistiques de la section "Confiance"
CREATE TABLE public.trust_stats (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  label text NOT NULL,
  value numeric(12, 3) NOT NULL,
  suffix text,
  prefix text,
  decimals integer DEFAULT 0 CHECK (decimals >= 0 AND decimals <= 2),
  icon_name text,
  description text,
  color text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.trust_stats
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'trust_stats'
ALTER TABLE public.trust_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les statistiques de confiance" ON public.trust_stats
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Les admins peuvent gérer les statistiques de confiance" ON public.trust_stats
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.trust_testimonials' : Témoignages pour la section "Confiance"
CREATE TABLE public.trust_testimonials (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  author text NOT NULL,
  role text,
  quote text NOT NULL,
  rating numeric(3, 2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  avatar_url text,
  commune text,
  verified boolean DEFAULT FALSE,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.trust_testimonials
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'trust_testimonials'
ALTER TABLE public.trust_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les témoignages de confiance actifs" ON public.trust_testimonials
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Les admins peuvent gérer les témoignages de confiance" ON public.trust_testimonials
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- ----------------------------------------------------------------------------------------------------
-- 7. Tables des paramètres et interactions IA
-- ----------------------------------------------------------------------------------------------------

-- Table 'public.settings' : Paramètres globaux de l'application
CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value text,
  type text, -- Ex: 'string', 'boolean', 'number', 'json'
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'settings'
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tout le monde peut lire les paramètres" ON public.settings
  FOR SELECT USING (TRUE); -- À ajuster si certains paramètres doivent être cachés
CREATE POLICY "Les admins peuvent gérer les paramètres" ON public.settings
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.user_notification_preferences' : Préférences de notification des utilisateurs
CREATE TABLE public.user_notification_preferences (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  email_notifications boolean DEFAULT TRUE,
  push_notifications boolean DEFAULT TRUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE PROCEDURE public.moddatetime();

-- RLS pour la table 'user_notification_preferences'
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir leurs préférences" ON public.user_notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent mettre à jour leurs préférences" ON public.user_notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent voir toutes les préférences" ON public.user_notification_preferences
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.push_subscriptions' : Abonnements aux notifications push
CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL UNIQUE, -- L'URL unique de l'abonnement
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

-- RLS pour la table 'push_subscriptions'
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent gérer leurs propres abonnements" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent voir tous les abonnements" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));


-- Table 'public.ai_interactions' : Interactions AI (pour le suivi et l'audit)
CREATE TABLE public.ai_interactions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- Peut être NULL pour les interactions non authentifiées
  type text NOT NULL, -- Ex: 'chat', 'description_gen', 'fraud_score', 'price_suggestion'
  prompt text,
  response text,
  ip_address inet,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX ai_interactions_user_id_idx ON public.ai_interactions (user_id);
CREATE INDEX ai_interactions_type_idx ON public.ai_interactions (type);

-- RLS pour la table 'ai_interactions'
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir leurs propres interactions" ON public.ai_interactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les utilisateurs peuvent enregistrer leurs interactions" ON public.ai_interactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les admins peuvent gérer toutes les interactions AI" ON public.ai_interactions
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE));
