// app/forgot-password/page.tsx
'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Mail, Phone } from 'lucide-react'
import { AuthAlert, AuthShell } from '@/components/auth/AuthShell'
import { CodeStep } from '@/components/auth/CodeStep'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { apiRequest } from '@/lib/auth/clientFetch'
import {
  MIN_PASSWORD_LENGTH,
  detectIdentifierType,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
} from '@/lib/validators/auth'

const ENDPOINT = '/api/auth/reset-password'

export default function ForgotPasswordPage() {
  const router = useRouter()

  const [step, setStep] = useState<'identifier' | 'code' | 'password' | 'done'>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)
  const lockRef = useRef(false)

  const type = detectIdentifierType(identifier.trim())
  const maskedTarget =
    type === 'email'
      ? maskEmail(normalizeEmail(identifier))
      : type === 'phone'
        ? maskPhone(normalizePhone(identifier))
        : ''

  const sendCode = async (isResend = false) => {
    setError('')

    if (type === 'unknown') {
      setError('Saisissez un email valide ou un numéro (ex : 0812345678).')
      return
    }

    setLoading(true)
    const r = await apiRequest(ENDPOINT, 'POST', { step: 'send', identifier: identifier.trim() })
    setLoading(false)

    if (!r.ok) {
      setError(r.data?.error || 'Une erreur est survenue.')
      if (r.status === 429 && r.data?.retry_after) setResendAt(Date.now() + r.data.retry_after * 1000)
      return
    }

    setStep('code')
    if (!isResend) setCode('')
    setExpiresAt(Date.now() + (r.data.expires_in ?? 600) * 1000)
    setResendAt(Date.now() + 60_000)
    setDevCode(r.data.devCode ?? null)
  }

  const verifyCode = async (value: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setLoading(true)
    setError('')

    const r = await apiRequest(ENDPOINT, 'POST', {
      step: 'verify',
      identifier: identifier.trim(),
      code: value,
    })

    setLoading(false)
    lockRef.current = false

    if (!r.ok) {
      setError(r.data?.error || 'Code incorrect.')
      setCode('')
      return
    }

    setResetToken(r.data.resetToken)
    setStep('password')
  }

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) verifyCode(digits)
  }

  const submitPassword = async () => {
    setError('')

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const r = await apiRequest(ENDPOINT, 'POST', {
      step: 'reset',
      resetToken,
      newPassword,
      confirmPassword,
    })
    setLoading(false)

    if (!r.ok) {
      setError(r.data?.error || 'Une erreur est survenue.')
      if (r.status === 401) {
        setStep('identifier')
        setCode('')
      }
      return
    }

    setStep('done')
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <AuthShell
      backHref="/login"
      backLabel="Retour à la connexion"
      icon={<KeyRound size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />}
      title="Mot de passe oublié"
      description={
        step === 'identifier'
          ? 'Saisissez votre email ou votre numéro, nous vous enverrons un code à 6 chiffres.'
          : step === 'password'
            ? 'Choisissez un nouveau mot de passe'
            : undefined
      }
    >
      {error && <AuthAlert type="error">{error}</AuthAlert>}

      {step === 'identifier' && (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            sendCode()
          }}
        >
          <Input
            id="identifier"
            variant="glass"
            label="Email ou numéro de téléphone"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="exemple@email.com ou 0812345678"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            leftIcon={
              type === 'phone' ? (
                <Phone size={16} className="text-neutral-400" aria-hidden="true" />
              ) : (
                <Mail size={16} className="text-neutral-400" aria-hidden="true" />
              )
            }
          />

          {type === 'phone' && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              L&apos;envoi d&apos;un SMS peut entraîner des frais selon votre opérateur.
            </p>
          )}

          <Button type="submit" variant="luxe" fullWidth size="lg" loading={loading} disabled={loading}>
            Recevoir le code
          </Button>

          <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
            Seuls les emails et numéros déjà vérifiés peuvent recevoir un code.
          </p>
        </form>
      )}

      {step === 'code' && (
        <CodeStep
          viaSms={type === 'phone'}
          maskedTarget={maskedTarget}
          value={code}
          onChange={onCodeChange}
          busy={loading}
          hasError={!!error}
          expiresAt={expiresAt}
          resendAt={resendAt}
          onResend={() => sendCode(true)}
          resending={loading}
          devCode={devCode}
          onBack={() => {
            setStep('identifier')
            setError('')
            setCode('')
          }}
          backLabel="Changer d'identifiant"
        />
      )}

      {step === 'password' && (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submitPassword()
          }}
        >
          <Input
            id="newPassword"
            variant="glass"
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <Input
            id="confirmPassword"
            variant="glass"
            label="Confirmer le mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <Button type="submit" variant="luxe" fullWidth size="lg" loading={loading} disabled={loading}>
            Réinitialiser le mot de passe
          </Button>
        </form>
      )}

      {step === 'done' && (
        <div className="text-center space-y-3" role="status">
          <CheckCircle2 size={40} className="mx-auto text-green-500" aria-hidden="true" />
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Mot de passe réinitialisé. Redirection vers la connexion…
          </p>
          <Link href="/login" className="text-sm text-gold-600 hover:underline">
            Se connecter maintenant
          </Link>
        </div>
      )}
    </AuthShell>
  )
}