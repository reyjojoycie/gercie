// lib/swagger.ts
/**
 * Configuration Swagger / OpenAPI pour l'API Gercie.
 * Utilise la spécification OpenAPI 3.0.
 * Cette configuration peut être servie via une route API dédiée.
 */

export interface SwaggerInfo {
  title: string
  version: string
  description: string
  termsOfService?: string
  contact?: { email: string; name?: string; url?: string }
  license?: { name: string; url?: string }
}

export interface SwaggerServer {
  url: string
  description?: string
}

export interface SwaggerConfig {
  openapi: string
  info: SwaggerInfo
  servers: SwaggerServer[]
  paths: Record<string, any>
  components?: Record<string, any>
  tags?: Array<{ name: string; description?: string }>
  security?: Array<Record<string, string[]>>
}

/**
 * Génère la configuration Swagger de base pour Gercie.
 */
export function createSwaggerConfig(): SwaggerConfig {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Gercie API',
      version: '1.0.0',
      description:
        'API de la marketplace Gercie. Permet de gérer les produits, commandes, utilisateurs, vendeurs, livreurs, etc.',
      contact: {
        email: 'support@gercie.com',
        name: 'Gercie Support',
      },
      license: {
        name: 'Propriétaire',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        description: 'Serveur principal',
      },
    ],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Utiliser le token JWT Supabase',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentification' },
      { name: 'Users', description: 'Gestion des utilisateurs' },
      { name: 'Products', description: 'Produits' },
      { name: 'Orders', description: 'Commandes' },
      { name: 'Vendors', description: 'Vendeurs' },
      { name: 'Drivers', description: 'Livreurs' },
      { name: 'Admin', description: 'Administration' },
    ],
    security: [{ bearerAuth: [] }],
  }
}

/**
 * Helper pour définir une route dans la config Swagger.
 * @param config - La configuration Swagger mutée.
 * @param method - Méthode HTTP (get, post, put, delete).
 * @param path - Chemin de la route (ex: '/api/produits').
 * @param definition - Définition OpenAPI de l'opération.
 */
export function defineRoute(
  config: SwaggerConfig,
  method: 'get' | 'post' | 'put' | 'delete' | 'patch',
  path: string,
  definition: any
) {
  if (!config.paths[path]) {
    config.paths[path] = {}
  }
  config.paths[path][method] = definition
}

/**
 * Instance exportable pré-configurée.
 * On peut l'initialiser au démarrage du serveur.
 */
let swaggerConfig: SwaggerConfig | null = null

export function getSwaggerConfig(): SwaggerConfig {
  if (!swaggerConfig) {
    swaggerConfig = createSwaggerConfig()
  }
  return swaggerConfig
}

export function resetSwaggerConfig() {
  swaggerConfig = createSwaggerConfig()
}

// On peut immédiatement définir quelques routes pour l'exemple.
// Dans une vraie application, on enregistrerait chaque route dans son propre fichier.
const initialConfig = getSwaggerConfig()

// Exemple : GET /api/produits
defineRoute(initialConfig, 'get', '/api/produits', {
  tags: ['Products'],
  summary: 'Liste des produits',
  description: 'Retourne une liste paginée de produits avec filtres optionnels.',
  parameters: [
    { name: 'search', in: 'query', schema: { type: 'string' } },
    { name: 'categorie', in: 'query', schema: { type: 'string' } },
    { name: 'min_price', in: 'query', schema: { type: 'number' } },
    { name: 'max_price', in: 'query', schema: { type: 'number' } },
    { name: 'sort_by', in: 'query', schema: { type: 'string', enum: ['created_at', 'prix'] } },
    { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
  ],
  responses: {
    '200': { description: 'Liste de produits' },
    '500': { description: 'Erreur serveur' },
  },
})

// POST /api/produits
defineRoute(initialConfig, 'post', '/api/produits', {
  tags: ['Products'],
  summary: 'Créer un produit',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/CreateProduct' },
      },
    },
  },
  responses: {
    '201': { description: 'Produit créé' },
    '400': { description: 'Données invalides' },
    '401': { description: 'Non authentifié' },
    '403': { description: 'Non autorisé' },
  },
})

// Auth Login
defineRoute(initialConfig, 'post', '/api/auth/login', {
  tags: ['Auth'],
  summary: 'Connexion',
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
          required: ['email', 'password'],
        },
      },
    },
  },
  responses: {
    '200': { description: 'Connexion réussie' },
    '401': { description: 'Identifiants invalides' },
  },
})
