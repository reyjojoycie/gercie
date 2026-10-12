# 🇨🇩 Gercie – Marketplace de prestige en République Démocratique du Congo

![Gercie Banner](https://via.placeholder.com/1200x400/0f1b5c/c9a962?text=Gercie+Marketplace)

## 🚀 Vue d’ensemble
**Gercie** est une plateforme e‑commerce haut de gamme, entièrement personnalisable, développée avec **Next.js 16 (App Router)** et **Supabase**.  
Elle intègre :

- 🔐 Paiement sécurisé avec séquestre (escrow)
- 📦 Livraison express avec codes de sécurité dédiés
- 🧑‍🤝‍🧑 Trois rôles : **Acheteur**, **Vendeur**, **Livreur**
- 🛡️ Administration complète (supervision des commandes, litiges, retraits)
- 🤖 Intelligence artificielle (recommandations, chatbot)
- 📱 Progressive Web App (installation mobile, notifications push)
- 🌐 Internationalisation (français, anglais, arabe)

## 🏗️ Architecture technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Next.js 16 (App Router), Tailwind CSS v4, Framer Motion |
| Backend | API Routes Next.js, Zod validation, Services métier |
| Base de données | PostgreSQL via Supabase, Realtime, Row Level Security |
| Authentification | Supabase Auth + cookies httpOnly |
| Emails & SMS | Resend, Twilio |
| Cartographie | Mapbox |
| IA | OpenAI API (chatbot, recommandations) |
| Paiement | Portefeuille virtuel Gercie (double devise CDF/USD), Mobile Money (Orange, Airtel, M‑Pesa) |
| Notifications push | Firebase Cloud Messaging |

## 📥 Installation

### Prérequis
- Node.js 20+
- Compte Supabase (gratuit)
- Clés API pour Resend, Twilio, Mapbox, OpenAI (optionnelles)

### Étapes
1. Cloner le dépôt :
   ```bash
   git clone https://github.com/votre-nom/gercie.git
   cd gercie