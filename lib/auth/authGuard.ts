// lib/auth/authGuard.ts
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })
  }
  return { user }
}