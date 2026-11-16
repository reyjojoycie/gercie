/**
 * Centralisation des routes de l'application (Navigation et API)
 */

export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  PROFILE: '/profile',
  PROFILE_SETTINGS: '/profile/parametres',
  COMMANDE: '/commande',
  MOBILE: '/mobile',
  ADMIN: {
    DASHBOARD: '/admin',
    PRODUITS: '/admin/produits',
    PRODUITS_AJOUTER: '/admin/produits/ajouter',
    PRODUITS_MODIFIER: (id: string) => `/admin/produits/${id}/modifier`,
    TRUST: '/admin/trust',
    UTILISATEURS_DETAIL: (id: string) => `/admin/utilisateurs/${id}`,
  },
} as const

export const API_ROUTES = {
  SETTINGS: '/api/settings',
  AUTH: {
    SIGNUP_SEND: '/api/auth/signup/send',
    VERIFY_EMAIL: '/api/auth/verify-email',
    VERIFY_PHONE: '/api/auth/verify-phone',
  },
  USER: {
    ACTIVITY: '/api/user/activity',
    DEBIT: '/api/user/debit',
    RECHARGE: '/api/user/recharge',
  },
  ADMIN: {
    HOME_CATEGORIES: '/api/admin/home-categories',
    RESET_PASSWORD: '/api/admin/utilisateurs/reset-password',
    COMMANDE_CONVERSATION: (id: string) => `/api/admin/commandes/${id}/conversation`,
  },
  AI: {
    CHAT: '/api/ai/chat',
    PRODUCT_SUMMARY: '/api/ai/product-summary',
    SEARCH: '/api/ai/search',
    TRACK_INTERACTION: '/api/ai/track-interaction',
    ADMIN: {
      FRAUD_SCORE: '/api/ai/admin/fraud-score',
      GENERATE_DESCRIPTION: '/api/ai/admin/generate-description',
      PRICE_SUGGESTION: '/api/ai/admin/price-suggestion',
    },
  },
  NOTIFICATIONS: {
    PUSH_SEND: '/api/notifications/push/send',
  },
} as const
