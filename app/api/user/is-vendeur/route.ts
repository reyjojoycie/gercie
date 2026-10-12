import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createClient()

    // Vérifier si l'utilisateur a un profil vendeur
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || !data) {
      // Si pas de profil, on considère qu'il n'est pas vendeur
      return NextResponse.json({ isVendeur: false })
    }

    const isVendeur = data.role === 'vendor' || data.role === 'admin'
    return NextResponse.json({ isVendeur })
  } catch (err) {
    console.error('Erreur is-vendeur:', err)
    return NextResponse.json({ isVendeur: false })
  }
}