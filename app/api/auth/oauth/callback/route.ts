import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  try {
    // Échanger le code contre une session
    const supabase = await createClient(false)
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      console.error('OAuth callback error:', error)
      return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
    }

    const user = data.user

    // Vérifier si le profil existe déjà
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    if (!existingProfile) {
      // Créer le profil (première connexion OAuth)
      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        nom: user.user_metadata?.full_name?.split(' ')[0] || '',
        prenom: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        avatar_url: user.user_metadata?.avatar_url || null,
        email_verified: true, // Google garantit l'email
        onboarding_completed: false,
        preferences: {},
      })

      if (insertError) {
        console.error('Erreur création profil OAuth:', insertError)
        // Ne pas bloquer l'utilisateur, on le laisse passer
      }

      return NextResponse.redirect(new URL('/onboarding', request.url))
    }

    // L'utilisateur existe : rediriger selon son statut
    if (existingProfile.onboarding_completed) {
      return NextResponse.redirect(new URL(next, request.url))
    } else {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  } catch (err: any) {
    console.error('Erreur inattendue OAuth callback:', err)
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }
}