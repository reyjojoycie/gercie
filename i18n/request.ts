import { getRequestConfig } from 'next-intl/server';

/**
 * Configuration de chargement des messages pour next-intl.
 * Ce fichier est appelé par Next.js pour injecter les traductions 
 * dans les Server Components et le NextIntlClientProvider.
 */
export default getRequestConfig(async () => {
  // Actuellement, ton layout force la locale 'fr'
  // On s'assure que la configuration suit cette logique
  const locale = 'fr';

  return {
    locale,
    // On importe dynamiquement le fichier correspondant dans le dossier /messages
    // Cela correspond à tes fichiers fr.json, en.json, ar.json
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
