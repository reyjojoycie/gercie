// postcss.config.cjs
module.exports = {
  plugins: {
    // Support Tailwind CSS v4 via le plugin officiel
    '@tailwindcss/postcss': {},
    // Ajout automatique des préfixes navigateurs pour CSS
    'autoprefixer': {},
    // Optimisations supplémentaires (uniquement en production)
    ...(process.env.NODE_ENV === 'production'
      ? {
          'cssnano': {
            preset: ['default', {
              discardComments: { removeAll: true },
              normalizeWhitespace: false,
            }],
          },
        }
      : {}),
  },
}