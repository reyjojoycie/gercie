// app/profile/security/password/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2, Mail, Smartphone } from 'lucide-react'
import { AuthAlert, AuthShell } from '@/components/auth/AuthShell'
import { CodeStep } from '@/components/auth/CodeStep'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/lib/auth/clientFetch'
import { MIN_PASSWORD_LENGTH } from '@/lib/validators/auth'

type Channel = 'email' | 'sms'
interface ChannelOption {
  channel: Channel
  masked: string
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [step, setStep] = useState<'form' | 'code' | 'done'>('form')
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [channel, setChannel] = useState<Channel>('email')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [maskedTarget, setMaskedTarget] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)
  const lockRef = useRef(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?redirect=/profile/security/password')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    apiRequest('/api/user/change-password', 'GET').then((r) => {
      if (cancelled) return
      const list: ChannelOption[] = r.data?.channels ?? []
      setChannels(list)
      if (list.length) setChannel(list[0].channel)
      setLoadingChannels(false)
    })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const sendCode = async () => {
    setError('')

    if (!currentPassword) return setError('Saisissez votre mot de passe actuel.')
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return setError(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
    if (newPassword !== confirmPassword) return setError('Les mots de passe ne correspondent pas.')
    if (newPassword === currentPassword) return setError('Le nouveau mot de passe doit être différent.')

    setSending(true)
    const r = await apiRequest('/api/user/change-password', 'POST', {
      step: 'send',
      currentPassword,
      newPassword,
      confirmPassword,
      channel,
    })
    setSending(false)

    if (!r.ok) {
      setError(r.data?.error || 'Une erreur est survenue.')
      if (r.status === 429 && r.data?.retry_after) setResendAt(Date.now() + r.data.retry_after * 1000)
      return
    }

    setStep('code')
    setCode('')
    setMaskedTarget(r.data.masked_target)
    setExpiresAt(Date.now() + r.data.expires_in * 1000)
    setResendAt(Date.now() + 60_000)
    setDevCode(r.data.devCode ?? null)
  }

  const confirm = async (value: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setSubmitting(true)
    setError('')

    const r = await apiRequest('/api/user/change-password', 'POST', {
      step: 'confirm',
      code: value,
      currentPassword,
      newPassword,
    })

    setSubmitting(false)
    lockRef.current = false

    if (!r.ok) {
      setError(r.data?.error || 'Code incorrect.')
      setCode('')
      return
    }

    setStep('done')
    setTimeout(() => router.push('/profile/security'), 2000)
  }

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) confirm(digits)
  }

  if (authLoading || !user || loadingChannels) {
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
      icon={<KeyRound size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />}
      title="Changer le mot de passe"
      description={
        step === 'form'
          ? 'Pour votre sécurité, un code à 6 chiffres vous sera envoyé.'
          : undefined
      }
    >
      {error && <AuthAlert type="error">{error}</AuthAlert>}

      {step === 'form' && channels.length === 0 && (
        <AuthAlert type="info">
          Aucun canal vérifié. Vérifiez d&apos;abord votre{' '}
          <Link href="/auth/verify-email" className="underline">
            email
          </Link>{' '}
          ou votre{' '}
          <Link href="/auth/verify-phone" className="underline">
            téléphone
          </Link>
          .
        </AuthAlert>
      )}

      {step === 'form' && channels.length > 0 && (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            sendCode()
          }}
        >
          <Input
            id="currentPassword"
            variant="glass"
            label="Mot de passe actuel"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            id="newPassword"
            variant="glass"
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            id="confirmPassword"
            variant="glass"
            label="Confirmer le nouveau mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {channels.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Recevoir le code par
              </p>
              <div className="grid grid-cols-2 gap-3">
                {channels.map((c) => (
                  <button
                    key={c.channel}
                    type="button"
                    onClick={() => setChannel(c.channel)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-colors ${
                      channel === c.channel
                        ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20'
                        : 'border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    {c.channel === 'email' ? (
                      <Mail size={18} aria-hidden="true" />
                    ) : (
                      <Smartphone size={18} aria-hidden="true" />
                    )}
                    {c.channel === 'email' ? 'Email' : 'SMS'}
                    <span className="text-xs text-neutral-500">{c.masked}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" variant="luxe" fullWidth size="lg" loading={sending} disabled={sending}>
            Recevoir le code
          </Button>
        </form>
      )}

      {step === 'code' && (
        <CodeStep
          viaSms={channel === 'sms'}
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
            setStep('form')
            setError('')
          }}
          backLabel="Modifier"
        />
      )}

      {step === 'done' && (
        <div className="text-center space-y-3" role="status">
          <CheckCircle2 size={40} className="mx-auto text-green-500" aria-hidden="true" />
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Mot de passe modifié avec succès.
          </p>
        </div>
      )}
    </AuthShell>
  )
}