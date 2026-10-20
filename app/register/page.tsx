// app/register/page.tsx
'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Mail, Smartphone, UserPlus } from 'lucide-react'
import { AuthAlert, AuthShell } from '@/components/auth/AuthShell'
import { CodeStep } from '@/components/auth/CodeStep'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { apiRequest } from '@/lib/auth/clientFetch'
import { EMAIL_REGEX, MIN_PASSWORD_LENGTH, isValidPhone } from '@/lib/validators/auth'

type Channel = 'email' | 'sms'
type Field = 'nom' | 'prenom' | 'email' | 'telephone' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<Field, string>>

const EMPTY_FORM: Record<Field, string> = {
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  password: '',
  confirmPassword: '',
}

export default function RegisterPage() {
  const router = useRouter()

  const [step, setStep] = useState<'form' | 'code' | 'done'>('form')
  const [form, setForm] = useState(EMPTY_FORM)
  const [channel, setChannel] = useState<Channel>('email')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [maskedTarget, setMaskedTarget] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)
  const lockRef = useRef(false)

  const setField = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const errors: FieldErrors = {}

    if (form.nom.trim().length < 2) errors.nom = 'Minimum 2 caractères'
    if (form.prenom.trim().length < 2) errors.prenom = 'Minimum 2 caractères'
    if (!EMAIL_REGEX.test(form.email.trim())) errors.email = 'Email invalide'
    if (!isValidPhone(form.telephone)) errors.telephone = 'Numéro invalide (ex : 0812345678)'
    if (form.password.length < MIN_PASSWORD_LENGTH)
      errors.password = `Minimum ${MIN_PASSWORD_LENGTH} caractères`
    if (form.password !== form.confirmPassword)
      errors.confirmPassword = 'Les mots de passe ne correspondent pas'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const sendCode = async (isResend = false) => {
    setError('')
    if (!isResend && !validate()) return

    setLoading(true)
    const r = await apiRequest('/api/auth/signup/send', 'POST', { ...form, channel })
    setLoading(false)

    if (!r.ok) {
      if (r.data?.errors) setFieldErrors(r.data.errors)
      setError(r.data?.error || 'Une erreur est survenue.')
      if (r.status === 429 && r.data?.retry_after) setResendAt(Date.now() + r.data.retry_after * 1000)
      if (!isResend) setStep('form')
      return
    }

    setStep('code')
    setCode('')
    setMaskedTarget(r.data.masked_target)
    setExpiresAt(Date.now() + r.data.expires_in * 1000)
    setResendAt(Date.now() + 60_000)
    setDevCode(r.data.devCode ?? null)
  }

  const complete = async (value: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setLoading(true)
    setError('')

    const r = await apiRequest('/api/auth/signup/complete', 'POST', { ...form, channel, code: value })

    setLoading(false)
    lockRef.current = false

    if (!r.ok) {
      setError(r.data?.error || 'Une erreur est survenue.')
      setCode('')
      return
    }

    setStep('done')
    setTimeout(() => router.push(r.data?.redirect || '/login?registered=true'), 1800)
  }

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) complete(digits)
  }

  return (
    <AuthShell
      backHref="/"
      backLabel="Retour à l'accueil"
      icon={<UserPlus size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />}
      title="Inscription"
      description={
        step === 'form'
          ? 'Créez votre compte Gercie'
          : step === 'code'
            ? 'Confirmez votre identité'
            : undefined
      }
    >
      {error && <AuthAlert type="error">{error}</AuthAlert>}

      {step === 'form' && (
        <>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              sendCode()
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="nom"
                variant="glass"
                label="Nom"
                value={form.nom}
                onChange={setField('nom')}
                error={fieldErrors.nom}
                placeholder="Votre nom"
                autoComplete="family-name"
              />
              <Input
                id="prenom"
                variant="glass"
                label="Prénom"
                value={form.prenom}
                onChange={setField('prenom')}
                error={fieldErrors.prenom}
                placeholder="Votre prénom"
                autoComplete="given-name"
              />
            </div>

            <Input
              id="email"
              variant="glass"
              label="Email"
              type="email"
              value={form.email}
              onChange={setField('email')}
              error={fieldErrors.email}
              placeholder="votre@email.com"
              autoComplete="email"
              autoCapitalize="none"
            />

            <Input
              id="telephone"
              variant="glass"
              label="Téléphone"
              type="tel"
              value={form.telephone}
              onChange={setField('telephone')}
              error={fieldErrors.telephone}
              placeholder="0812345678"
              autoComplete="tel"
            />

            <Input
              id="password"
              variant="glass"
              label="Mot de passe"
              type="password"
              value={form.password}
              onChange={setField('password')}
              error={fieldErrors.password}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            <Input
              id="confirmPassword"
              variant="glass"
              label="Confirmer le mot de passe"
              type="password"
              value={form.confirmPassword}
              onChange={setField('confirmPassword')}
              error={fieldErrors.confirmPassword}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Recevoir mon code de confirmation par
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['email', 'sms'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    aria-pressed={channel === c}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm transition-colors ${
                      channel === c
                        ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 text-neutral-900 dark:text-neutral-100'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {c === 'email' ? (
                      <Mail size={16} aria-hidden="true" />
                    ) : (
                      <Smartphone size={16} aria-hidden="true" />
                    )}
                    {c === 'email' ? 'Email' : 'SMS'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Un seul canal suffit. L&apos;autre pourra être vérifié depuis votre profil dans les
                6 heures, sinon il sera supprimé et il faudra le ressaisir.
              </p>
            </div>

            <Button
              type="submit"
              variant="luxe"
              fullWidth
              size="lg"
              loading={loading}
              disabled={loading}
              className="shadow-gold hover:shadow-glow-gold transition-shadow"
            >
              Recevoir le code
            </Button>
          </form>

          <div className="space-y-4">
            <div className="relative" role="separator">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-midnight-900 px-2 text-neutral-400 dark:text-neutral-500">
                  Ou continuer avec
                </span>
              </div>
            </div>

            <OAuthButtons providers={['google', 'facebook', 'apple']} disabled={loading} />
          </div>

          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            Déjà un compte ?{' '}
            <Link href="/login" className="text-gold-600 dark:text-gold-400 font-medium hover:underline">
              Se connecter
            </Link>
          </p>
        </>
      )}

      {step === 'code' && (
        <CodeStep
          viaSms={channel === 'sms'}
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
            setStep('form')
            setError('')
            setCode('')
          }}
          backLabel="Modifier mes informations"
        />
      )}

      {step === 'done' && (
        <div className="text-center space-y-3" role="status">
          <CheckCircle2 size={40} className="mx-auto text-green-500" aria-hidden="true" />
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Compte créé avec succès ! Redirection vers la connexion…
          </p>
        </div>
      )}
    </AuthShell>
  )
}