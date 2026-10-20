/**
 * Instrumentation pour Gercie.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const start = Date.now();

  try {
    const [Sentry, { default: logger }, { validateEnv, REQUIRED_ENV_VARS }] = await Promise.all([
      import('@sentry/nextjs'),
      import('@/lib/logger'),
      import('@/lib/env')
    ]);

    // 2. Validation Env
    try {
      validateEnv(REQUIRED_ENV_VARS);
    } catch (error) {
      logger.error('❌ Configuration critique incorrecte', error);
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(error, { level: 'fatal' });
      } else {
        safeExit(1);
      }
    }

    // 3. Initialisation Sentry (reste inchangé)
    // ...

    // 4. Gestion erreurs fatales (Isolée pour le compilateur Edge)
    if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
      process.on('uncaughtException', (error) => {
        logger.error('CRITICAL: Uncaught Exception', error);
        Sentry.captureException(error, { level: 'fatal' });
        setTimeout(() => safeExit(1), 2000);
      });

      const gracefulShutdown = (signal: string) => {
        logger.info(`♻️ Signal ${signal} reçu`);
        setTimeout(() => safeExit(0), 500);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    // 5. Initialisations asynchrones (reste inchangé)
    // ...
    
  } catch (bootstrapError) {
    console.error('❌ Échec chargement instrumentation:', bootstrapError);
  }
}

/**
 * Quitte le processus de manière sécurisée en vérifiant le runtime
 */
function safeExit(code: number) {
  // L'ajout de la vérification NEXT_RUNTIME ici empêche Turbopack Edge de lever une alerte sur process.exit
  if (
    typeof process !== 'undefined' && 
    process.env.NEXT_RUNTIME === 'nodejs' && 
    typeof process.exit === 'function'
  ) {
    process.exit(code);
  }
}