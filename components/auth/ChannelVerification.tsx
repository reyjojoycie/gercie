// components/auth/ChannelVerification.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Mail, Smartphone } from 'lucide-react'
import { AuthAlert, AuthShell } from '@/components/auth/AuthShell'
import { CodeStep } from '@/components/auth/CodeStep'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/lib/auth/clientFetch'
import { isValidPhone, maskEmail } from '@/lib/validators/auth'

export function ChannelVerification({ channel }: { channel: 'email' | 'sms' }) {
  const router = useRouter()
  const { user, loading: authLoading, isOnboarded, refreshRoles } = useAuth()

  const isEmail = channel === 'email'
  const endpoint = isEmail ? '/api/auth/verify-email' : '/api/auth/verify-phone'
  const pagePath = isEmail ? '/auth/verify-email' : '/auth/verify-phone'

  const [step, setStep] = useState<'start' | 'code' | 'done'>('start')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [code, setCode] = useState('')
  const [maskedTarget, setMaskedTarget] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)
  const lockRef = useRef(false)

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?redirect=${pagePath}`)
  }, [authLoading, user, router, pagePath])

  // Pré-remplir le téléphone depuis le profil
  useEffect(() => {
    if (isEmail || !user?.id) return
    let cancelled = false

    apiRequest('/api/user/profile', 'GET').then((r) => {
      if (cancelled) return
      const value = r.data?.telephone || r.data?.data?.telephone || ''
      if (value) setPhone(value)
    })

    return () => {
      cancelled = true
    }
  }, [isEmail, user?.id])

  const goNext = () => {
    setTimeout(() => router.push(isOnboarded ? '/profile/security' : '/onboarding'), 1500)
  }

  const sendCode = async () => {
    setError('')
    setInfo('')

    if (!isEmail && !isValidPhone(phone)) {
      setError('Numéro invalide (ex : 0812345678 ou +243812345678).')
      return
    }

    setSending(true)
    const r = await apiRequest(endpoint, 'POST', isEmail ? {} : { telephone: phone })
    setSending(false)

    if (!r.ok) {
      setError(r.data?.error || 'Une erreur est survenue.')
      if (r.status === 429 && r.data?.retry_after) setResendAt(Date.now() + r.data.retry_after * 1000)
      return
    }

    if (r.data?.already_verified) {
      await refreshRoles()
      setInfo(r.data.message || 'Déjà vérifié.')
      setStep('done')
      goNext()
      return
    }

    setStep('code')
    setCode('')
    setMaskedTarget(r.data.masked_target || (isEmail ? maskEmail(user?.email || '') : phone))
    setExpiresAt(Date.now() + (r.data.expires_in ?? 600) * 1000)
    setResendAt(Date.now() + 60_000)
    setDevCode(r.data.devCode ?? null)
  }

  const confirm = async (value: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setSubmitting(true)
    setError('')

    const r = await apiRequest(`${endpoint}/confirm`, 'POST', { code: value })

    setSubmitting(false)
    lockRef.current = false

    if (!r.ok) {
      setError(r.data?.error || 'Code incorrect.')
      setCode('')
      return
    }

    await refreshRoles()
    setInfo(r.data?.message || 'Vérifié avec succès !')
    setStep('done')
    goNext()
  }

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) confirm(digits)
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Loader2 className="animate-spin text-gold-500" size={32} aria-hidden="true" />
      </div>
    )
  }

  return (
    <AuthShell
      backHref="/profile/security"
      backLabel="Retour à la sécurité"
      icon={
        isEmail ? (
          <Mail size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
        ) : (
          <Smartphone size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
        )
      }
      title={isEmail ? "Vérification de l'email" : 'Vérification du téléphone'}
      description={
        step === 'start'
          ? isEmail
            ? 'Nous allons envoyer un code à 6 chiffres à votre adresse email.'
            : 'Saisissez votre numéro, nous vous enverrons un code par SMS.'
          : undefined
      }
    >
      {error && <AuthAlert type="error">{error}</AuthAlert>}

      {step === 'start' && (
        <div className="space-y-5">
          {isEmail ? (
            <p className="text-center text-sm font-mono text-neutral-700 dark:text-neutral-200">
              {maskEmail(user.email || '')}
            </p>
          ) : (
            <>
              <Input
                id="phone"
                variant="glass"
                label="Numéro de téléphone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812345678"
                autoComplete="tel"
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                L&apos;envoi d&apos;un SMS peut entraîner des frais selon votre opérateur.
              </p>
            </>
          )}

          <Button variant="luxe" fullWidth size="lg" loading={sending} disabled={sending} onClick={sendCode}>
            Envoyer le code
          </Button>
        </div>
      )}

      {step === 'code' && (
        <CodeStep
          viaSms={!isEmail}
          maskedTarget={maskedTarget}
          value={code}
          onChange={onCodeChange}
          busy={submitting}
          hasError={!!error}
          expiresAt={expiresAt}
          resendAt={resendAt}
          onResend={sendCode}
          resending={sending}
          devCode={devCode}
          onBack={() => {
            setStep('start')
            setError('')
          }}
          backLabel={isEmail ? 'Retour' : 'Modifier le numéro'}
        />
      )}

      {step === 'done' && (
        <div className="text-center space-y-3" role="status">
          <CheckCircle2 size={40} className="mx-auto text-green-500" aria-hidden="true" />
          <p className="text-sm text-neutral-700 dark:text-neutral-200">{info}</p>
          <p className="text-xs text-neutral-400">Redirection…</p>
        </div>
      )}

      {step !== 'done' && (
        <p className="text-xs text-center text-neutral-400">
          Vous pouvez aussi{' '}
          <Link
            href={isEmail ? '/auth/verify-phone' : '/auth/verify-email'}
            className="text-gold-500 hover:underline"
          >
            {isEmail ? 'vérifier votre téléphone' : 'vérifier votre email'}
          </Link>
          .
        </p>
      )}
    </AuthShell>
  )
}