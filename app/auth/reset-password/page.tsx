// app/reset-password/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  LockKeyhole,
  AlertCircle,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
  Send,
  Shield,
  WifiOff,
  Loader2,
  Clock,
  KeyRound,
  Smartphone,
  Link2,
  Copy,
  Check,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes de résilience                                           */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 20000
const MAX_RETRIES = 2
const MAGIC_COOLDOWN_SECONDS = 60
const OTP_COOLDOWN_SECONDS = 60 // Protection brute-force OTP
const STORAGE_KEY = 'reset_password_email'
const REDIRECT_DELAY = 2500

/* ------------------------------------------------------------------ */
/*  Messages localisés                                                 */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible. Réessayez dans quelques instants.',
  not_found: 'Aucun compte trouvé avec cet email.',
  invalid_otp: 'Code invalide ou expiré. Vérifiez et réessayez.',
  token_expired: 'Le lien a expiré. Demandez-en un nouveau.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  unknown: 'Une erreur est survenue. Veuillez réessayer.',
}

/* ------------------------------------------------------------------ */
/*  Schémas de validation                                              */
/* ------------------------------------------------------------------ */
const emailSchema = z.object({
  email: z.string().email('Email invalide').max(255),
})

const otpSchema = z.object({
  otp: z.string().length(6, 'Le code doit contenir exactement 6 chiffres'),
})

const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Minimum 8 caractères')
      .max(128)
      .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
      .regex(/[a-z]/, 'Doit contenir au moins une minuscule')
      .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type Step = 'email' | 'method-selection' | 'otp-verify' | 'new' | 'magic-link-sent'
type AuthMethod = 'magic_link' | 'email_otp' | 'sms_otp'

/* ------------------------------------------------------------------ */
/*  Indicateur de force du mot de passe                                */
/* ------------------------------------------------------------------ */
function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return { label: '', score: 0, color: 'bg-neutral-300' }
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    if (score <= 2) return { label: 'Faible', score: 1, color: 'bg-red-500' }
    if (score <= 4) return { label: 'Moyen', score: 2, color: 'bg-amber-500' }
    if (score <= 5) return { label: 'Fort', score: 3, color: 'bg-green-500' }
    return { label: 'Très fort', score: 4, color: 'bg-emerald-500' }
  }, [password])

  if (!password) return null

  return (
    <div className="mt-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index <= strength.score ? strength.color : 'bg-neutral-200 dark:bg-neutral-700'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
        <Shield size={12} aria-hidden="true" />
        Force : {strength.label}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stepper accessible                                                 */
/* ------------------------------------------------------------------ */
const steps = [
  { id: 'email', label: 'Email' },
  { id: 'otp-verify', label: 'Vérification' },
  { id: 'new', label: 'Mot de passe' },
] as const

function Stepper({ currentStep }: { currentStep: Step }) {
  const visualStep = currentStep === 'method-selection' ? 'email' : currentStep
  const currentIndex = steps.findIndex((s) => s.id === visualStep)

  return (
    <div 
      className="flex items-center justify-center mb-8" 
      role="navigation" 
      aria-label="Étapes de réinitialisation"
    >
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
              index <= currentIndex
                ? 'border-gold-400 bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300'
                : 'border-neutral-200 text-neutral-400 dark:border-neutral-700'
            )}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            {index < currentIndex ? (
              <CheckCircle2 size={16} className="text-green-500" aria-hidden="true" />
            ) : (
              index + 1
            )}
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                'w-8 h-0.5 mx-1',
                index < currentIndex ? 'bg-gold-400' : 'bg-neutral-200 dark:bg-neutral-700'
              )}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helper : Masquer le numéro de téléphone                            */
/* ------------------------------------------------------------------ */
function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 6) return phone || ''
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                     */
/* ------------------------------------------------------------------ */
export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [availableMethods, setAvailableMethods] = useState<AuthMethod[]>([])
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null)
  
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const [magicCooldown, setMagicCooldown] = useState(0)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [copied, setCopied] = useState(false) // NOUVEAU : État pour le bouton copier

  const retryCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const emailForm = useForm({ 
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) || '' : '',
    },
  })
  const otpForm = useForm({ resolver: zodResolver(otpSchema) })
  const passwordForm = useForm({ 
    resolver: zodResolver(passwordSchema),
    mode: 'onChange',
  })

  const newPassword = passwordForm.watch('newPassword')

  // NOUVEAU : Gestion robuste des paramètres d'URL (token magique Supabase)
  useEffect(() => {
    // Supabase peut mettre le token dans la query (?access_token=...) ou dans le hash (#access_token=...)
    const queryToken = searchParams.get('access_token') || searchParams.get('token')
    const emailParam = searchParams.get('email')
    const nextParam = searchParams.get('next') || '/login'
    
    let finalToken = queryToken
    if (!finalToken && typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      finalToken = hashParams.get('access_token') || hashParams.get('token')
    }

    if (finalToken) {
      setEmail(emailParam || '')
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('reset_token', finalToken)
        sessionStorage.setItem('reset_next', nextParam)
      }
      setStep('new')
    }
  }, [searchParams])

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setError(ERROR_MESSAGES.offline)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cooldowns
  useEffect(() => {
    if (magicCooldown <= 0 && otpCooldown <= 0) return
    const timer = setInterval(() => {
      setMagicCooldown((prev) => Math.max(0, prev - 1))
      setOtpCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [magicCooldown, otpCooldown])

  // Cleanup des requêtes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Fetch avec timeout et retry
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000 * (MAX_RETRIES - retries + 1)))
          return fetchWithRetry(url, options, retries - 1)
        }
        return response
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          retryCountRef.current += 1
          await new Promise((r) => setTimeout(r, 1000 * retryCountRef.current))
          return fetchWithRetry(url, options, retries - 1)
        }
        throw err
      }
    },
    []
  )

  const checkEmail = async (data: { email: string }) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }
    setLoading(true)
    setError('')
    setEmail(data.email)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, data.email)
    }
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, step: 'check' }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (res.status === 404) {
          setError(ERROR_MESSAGES.not_found)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      setPhone(result.phone || '')
      setAvailableMethods(result.availableMethods || [])
      
      // Si une seule méthode est disponible, on la sélectionne automatiquement
      if (result.availableMethods?.length === 1) {
        handleMethodSelect(result.availableMethods[0])
      } else {
        setStep('method-selection')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMethodSelect = (method: AuthMethod) => {
    setSelectedMethod(method)
    if (method === 'magic_link') {
      sendMagicLink(email)
    } else if (method === 'email_otp' || method === 'sms_otp') {
      sendOtp(method === 'sms_otp' ? 'sms' : 'email')
    }
  }

  const sendMagicLink = async (emailAddr: string) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }
    if (magicCooldown > 0) {
      setError(`Veuillez patienter ${magicCooldown}s avant de réessayer.`)
      return
    }
    setLoading(true)
    setError('')
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr, type: 'recovery' }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (res.status === 404) {
          setError(ERROR_MESSAGES.not_found)
        } else if (res.status === 429) {
          setError('Trop de tentatives. Réessayez plus tard.')
          setMagicCooldown(MAGIC_COOLDOWN_SECONDS * 2)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      setMessage('Un lien de réinitialisation a été envoyé à votre adresse email.')
      setStep('magic-link-sent')
      setMagicCooldown(MAGIC_COOLDOWN_SECONDS)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }

  const sendOtp = async (channel: 'email' | 'sms') => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }
    if (otpCooldown > 0) {
      setError(`Veuillez patienter ${otpCooldown}s avant de réessayer.`)
      return
    }
    setLoading(true)
    setError('')
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, channel, step: 'send_otp' }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || ERROR_MESSAGES.server)
        return
      }

      // NOUVEAU : Mode développement pour afficher le code OTP si activé côté serveur
      if (process.env.NODE_ENV === 'development' && result.devOtp) {
        console.log('%c[DEV MODE] Code OTP:', 'color: green; font-size: 16px; font-weight: bold;', result.devOtp)
        setMessage(`[DEV] Code: ${result.devOtp} (Vérifiez aussi vos emails)`)
      } else {
        setMessage(`Code envoyé par ${channel === 'sms' ? 'SMS' : 'email'}.`)
      }
      
      setOtpCooldown(OTP_COOLDOWN_SECONDS)
      setStep('otp-verify')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (data: { otp: string }) => {
    if (!isOnline || otpCooldown > 0) {
      if (otpCooldown > 0) setError(`Veuillez patienter ${otpCooldown}s avant de réessayer.`)
      return
    }
    setLoading(true)
    setError('')
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          code: data.otp, 
          channel: selectedMethod === 'sms_otp' ? 'sms' : 'email', 
          step: 'verify_otp' 
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError(ERROR_MESSAGES.invalid_otp)
          setOtpCooldown(OTP_COOLDOWN_SECONDS)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      // Stocker le token pour l'étape finale
      if (typeof window !== 'undefined' && result.resetToken) {
        sessionStorage.setItem('reset_token', result.resetToken)
      }
      setStep('new')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (data: { newPassword: string }) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setLoading(true)
    setError('')
    retryCountRef.current = 0

    // NOUVEAU : Supporte à la fois le lien magique (URL query/hash) et le token interne (OTP)
    const urlToken = searchParams.get('access_token') || searchParams.get('token')
    const internalToken = typeof window !== 'undefined' ? sessionStorage.getItem('reset_token') : null
    const resetToken = urlToken || internalToken

    if (!resetToken) {
      setError('Session expirée. Veuillez recommencer la procédure.')
      setLoading(false)
      return
    }

    try {
      const res = await fetchWithRetry('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          newPassword: data.newPassword, 
          resetToken,
          step: 'reset' 
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (res.status === 410 || res.status === 401) {
          setError(ERROR_MESSAGES.token_expired)
          setTimeout(() => {
            router.push('/reset-password')
          }, 3000)
        } else if (res.status >= 500) {
          setError(ERROR_MESSAGES.server)
        } else {
          setError(result.error || ERROR_MESSAGES.unknown)
        }
        return
      }

      // Nettoyer le storage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY)
        sessionStorage.removeItem('reset_token')
      }

      setMessage('Mot de passe réinitialisé avec succès. Redirection…')
      
      // NOUVEAU : Redirection dynamique vers la page d'origine si spécifiée
      const nextRoute = typeof window !== 'undefined' ? sessionStorage.getItem('reset_next') || '/login' : '/login'
      setTimeout(() => router.push(nextRoute), REDIRECT_DELAY)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }

  // NOUVEAU : Auto-soumission et gestion du collage pour l'OTP
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    otpForm.setValue('otp', value)
    if (value.length === 6) {
      setTimeout(() => otpForm.handleSubmit(verifyOtp)(), 100)
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    otpForm.setValue('otp', pastedData)
    if (pastedData.length === 6) {
      setTimeout(() => otpForm.handleSubmit(verifyOtp)(), 100)
    }
  }

  // NOUVEAU : Fonction pour copier l'email
  const copyEmail = () => {
    if (typeof window !== 'undefined' && email) {
      navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-8 text-sm transition-colors"
          aria-label="Retour à la connexion"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Retour à la connexion
        </Link>

        <div className="animate-fade-in">
          <Card variant="glass" className="border-gold-400/20 shadow-gold">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
                <LockKeyhole size={28} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
              </div>
              <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
                Réinitialisation
              </CardTitle>
              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                {step === 'email' && 'Entrez votre email pour commencer'}
                {step === 'method-selection' && 'Choisissez votre méthode de vérification'}
                {step === 'otp-verify' && `Entrez le code envoyé ${selectedMethod === 'sms_otp' ? 'par SMS' : 'par email'}`}
                {step === 'new' && 'Choisissez un nouveau mot de passe'}
                {step === 'magic-link-sent' && 'Lien envoyé par email'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step !== 'magic-link-sent' && step !== 'method-selection' && <Stepper currentStep={step} />}

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 mb-6 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                >
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{message}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 mb-6 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
                >
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {!isOnline && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 mb-6 rounded-xl text-sm flex items-center gap-2"
                >
                  <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
                  Vous êtes hors ligne.
                </div>
              )}

              {/* Étape 1 : Email */}
              {step === 'email' && (
                <form
                  onSubmit={emailForm.handleSubmit(checkEmail)}
                  className="space-y-5 animate-slide-in"
                  noValidate
                >
                  <div className="relative">
                    <Input
                      variant="glass"
                      label="Email"
                      type="email"
                      {...emailForm.register('email')}
                      error={emailForm.formState.errors.email?.message}
                      placeholder="votre@email.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      enterKeyHint="go"
                      leftIcon={<Mail size={18} className="text-neutral-400" aria-hidden="true" />}
                      aria-describedby={emailForm.formState.errors.email ? 'email-error' : undefined}
                    />
                    {/* NOUVEAU : Bouton pour copier l'email */}
                    {email && (
                      <button
                        type="button"
                        onClick={copyEmail}
                        className="absolute right-3 top-[34px] text-neutral-400 hover:text-gold-500 transition-colors"
                        title="Copier l'email"
                      >
                        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    )}
                  </div>
                  <Button
                    type="submit"
                    variant="luxe"
                    fullWidth
                    size="lg"
                    loading={loading}
                    disabled={loading || !isOnline}
                    className="shadow-gold hover:shadow-glow-gold transition-shadow"
                    aria-busy={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                        Vérification…
                      </span>
                    ) : (
                      'Continuer'
                    )}
                  </Button>
                </form>
              )}

              {/* Étape de sélection de la méthode (3 options) */}
              {step === 'method-selection' && (
                <div className="space-y-3 animate-slide-in">
                  {availableMethods.includes('email_otp') && (
                    <button
                      onClick={() => handleMethodSelect('email_otp')}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-gold-400 dark:hover:border-gold-500 hover:bg-gold-50/50 dark:hover:bg-gold-900/10 transition-all text-left group"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <KeyRound size={20} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Code par Email</p>
                        <p className="text-xs text-neutral-500">Recevez un code à 6 chiffres sur {email}</p>
                      </div>
                    </button>
                  )}
                  {availableMethods.includes('sms_otp') && (
                    <button
                      onClick={() => handleMethodSelect('sms_otp')}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-gold-400 dark:hover:border-gold-500 hover:bg-gold-50/50 dark:hover:bg-gold-900/10 transition-all text-left group"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Smartphone size={20} className="text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Code par SMS</p>
                        <p className="text-xs text-neutral-500">Recevez un code sur {maskPhone(phone)}</p>
                      </div>
                    </button>
                  )}
                  {availableMethods.includes('magic_link') && (
                    <button
                      onClick={() => handleMethodSelect('magic_link')}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-gold-400 dark:hover:border-gold-500 hover:bg-gold-50/50 dark:hover:bg-gold-900/10 transition-all text-left group"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Link2 size={20} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Lien magique</p>
                        <p className="text-xs text-neutral-500">Recevez un lien de connexion directe</p>
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => setStep('email')}
                    className="w-full text-center text-sm text-neutral-500 hover:text-gold-500 mt-4"
                  >
                    <ArrowLeft size={14} className="inline mr-1" /> Changer d'email
                  </button>
                </div>
              )}

              {/* Étape de vérification OTP */}
              {step === 'otp-verify' && (
                <form
                  onSubmit={otpForm.handleSubmit(verifyOtp)}
                  className="space-y-5 animate-slide-in"
                  noValidate
                >
                  <Input
                    variant="glass"
                    label="Code de vérification"
                    {...otpForm.register('otp')}
                    onChange={handleOtpChange}
                    onPaste={handleOtpPaste}
                    error={otpForm.formState.errors.otp?.message}
                    placeholder="• • • • • •"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    autoComplete="one-time-code"
                    className="text-center text-2xl tracking-[1em] font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep('method-selection')}
                      disabled={loading}
                      className="text-neutral-500 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    >
                      <ArrowLeft size={16} className="mr-1" aria-hidden="true" /> Retour
                    </Button>
                    <Button
                      type="submit"
                      variant="luxe"
                      fullWidth
                      size="lg"
                      loading={loading}
                      disabled={loading || !isOnline || otpCooldown > 0}
                      className="shadow-gold hover:shadow-glow-gold transition-shadow"
                      aria-busy={loading}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                          Validation…
                        </span>
                      ) : otpCooldown > 0 ? (
                        <span className="flex items-center gap-2">
                          <Clock size={18} aria-hidden="true" />
                          Patientez {otpCooldown}s
                        </span>
                      ) : (
                        'Valider le code'
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-center text-neutral-500">
                    {otpCooldown > 0 ? (
                      <span className="flex items-center justify-center gap-1">
                        <Clock size={12} aria-hidden="true" /> Renvoyer dans {otpCooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendOtp(selectedMethod === 'sms_otp' ? 'sms' : 'email')}
                        className="text-gold-500 hover:underline focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                      >
                        Renvoyer le code
                      </button>
                    )}
                  </p>
                </form>
              )}

              {/* Étape : Nouveau mot de passe */}
              {step === 'new' && (
                <form
                  onSubmit={passwordForm.handleSubmit(resetPassword)}
                  className="space-y-5 animate-slide-in"
                  noValidate
                >
                  <div className="space-y-2">
                    <Input
                      variant="glass"
                      label="Nouveau mot de passe"
                      type={showPassword ? 'text' : 'password'}
                      {...passwordForm.register('newPassword')}
                      error={passwordForm.formState.errors.newPassword?.message}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      enterKeyHint="next"
                      aria-describedby={passwordForm.formState.errors.newPassword ? 'password-error' : 'password-strength'}
                      rightIcon={
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-neutral-400 hover:text-gold-500 transition-colors"
                          aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                        </button>
                      }
                    />
                    <PasswordStrengthIndicator password={newPassword || ''} />
                  </div>
                  <Input
                    variant="glass"
                    label="Confirmer le mot de passe"
                    type={showPassword ? 'text' : 'password'}
                    {...passwordForm.register('confirmPassword')}
                    error={passwordForm.formState.errors.confirmPassword?.message}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    enterKeyHint="go"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep('method-selection')}
                      disabled={loading}
                      className="text-neutral-500 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    >
                      <ArrowLeft size={16} className="mr-1" aria-hidden="true" /> Précédent
                    </Button>
                    <Button
                      type="submit"
                      variant="luxe"
                      fullWidth
                      size="lg"
                      loading={loading}
                      disabled={loading || !isOnline}
                      className="shadow-gold hover:shadow-glow-gold transition-shadow"
                      aria-busy={loading}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                          Enregistrement…
                        </span>
                      ) : (
                        'Réinitialiser le mot de passe'
                      )}
                    </Button>
                  </div>
                </form>
              )}

              {/* Étape : Magic link envoyé */}
              {step === 'magic-link-sent' && (
                <div className="text-center space-y-4 animate-fade-in">
                  <Send size={48} className="mx-auto text-gold-500" aria-hidden="true" />
                  <p className="text-neutral-600 dark:text-neutral-300">
                    Consultez votre boîte de réception et cliquez sur le lien reçu.
                  </p>
                  <div className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 text-sm text-neutral-700 dark:text-neutral-300 text-left">
                    <p className="mb-2 font-medium">Vous n&apos;avez rien reçu ?</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                      <li>Vérifiez votre dossier spam / courriers indésirables</li>
                      <li>Ajoutez notre adresse à vos contacts</li>
                      <li>La réception peut prendre jusqu&apos;à 2 minutes</li>
                    </ul>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('method-selection')
                      setError('')
                      setMessage('')
                    }}
                    className="w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    Essayer une autre méthode
                  </Button>
                  <p className="text-xs text-neutral-400">
                    Pas reçu ?{' '}
                    <button
                      onClick={() => sendMagicLink(email)}
                      disabled={magicCooldown > 0 || loading || !isOnline}
                      className="text-gold-500 hover:underline disabled:text-neutral-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                    >
                      {magicCooldown > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} aria-hidden="true" />
                          Renvoyer dans {magicCooldown}s
                        </span>
                      ) : (
                        'Renvoyer le lien'
                      )}
                    </button>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down,
          .animate-slide-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}