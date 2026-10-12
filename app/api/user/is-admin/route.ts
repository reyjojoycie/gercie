// app/api/user/is-admin/route.ts
import { createClient } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'

// Liste blanche d'urgence pour la production et le développement local
const ADMIN_EMAILS = ['joycekondee@gmail.com', 'admin@gercie.com']

export async function GET() {
  const start = Date.now()
  
  try {
    // 1. Initialisation unique du client Supabase Server
    const supabase = await createClient(true)

    // 2. Récupération sécurisée de l'utilisateur connecté via le même client
    // Utilisation d'une promesse avec Timeout pour éviter que l'API ne charge indéfiniment (Max 800ms)
    const userPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Supabase Timeout')), 800)
    )

    const { data: { user }, error: userError } = await Promise.race([userPromise, timeoutPromise]) as any

    if (userError || !user) {
      logger.info('Vérification is-admin : Aucun utilisateur connecté.')
      return NextResponse.json({ isAdmin: false }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      })
    }

    // 3. Étape de secours ultra-rapide : Si l'email est dans la liste blanche, il est admin d'office
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      logger.info({ userId: user.id, email: user.email }, 'Accès Admin accordé via la liste blanche (Email)')
      return NextResponse.json({ isAdmin: true })
    }

    // 4. Interrogation de la table "profiles" dans la base de données
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle() // Évite de lever une exception si le profil n'existe pas encore

    const duration = Date.now() - start

    if (profileError) {
      logger.error({ error: profileError, duration }, 'Erreur lors de la lecture du profil admin')
      // En cas de problème de connexion à la table mais que l'utilisateur est authentifié, on refuse par sécurité
      return NextResponse.json({ isAdmin: false })
    }

    if (profile) {
      const isAdminStatus = profile.is_admin === true
      logger.info({ userId: user.id, isAdmin: isAdminStatus, duration }, 'Statut admin extrait du profil avec succès')
      return NextResponse.json({ isAdmin: isAdminStatus })
    }

    // Par défaut, si aucun profil n'est trouvé
    return NextResponse.json({ isAdmin: false })

  } catch (error: any) {
    const duration = Date.now() - start
    logger.error({ error: error.message, duration }, 'Crash ou Timeout critique intercepté dans l’API is-admin')
    
    // ⚡ SÉCURITÉ DÉVELOPPEMENT LOCAL : Si Supabase est hors-ligne ou trop lent en local,
    // on empêche le crash de l'application en renvoyant false immédiatement.
    return NextResponse.json({ isAdmin: false }, { status: 200 })
  }
}