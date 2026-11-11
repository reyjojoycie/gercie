// components/layout/Footer.tsx
'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'

import Link from 'next/link'

import { cn } from '@/lib/utils'

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Headset,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface FooterLink {
  href: string
  label: string
  icon: ReactNode
  external?: boolean
}

interface SocialLink {
  href: string
  label: string
  icon: ReactNode
}

interface PaymentMethod {
  name: string
  icon: ReactNode
}

type ContactStatus = 'idle' | 'loading' | 'success' | 'error'

/* ═══════════════════════════════════════════════════════════════ */
/*  SOCIAL ICONS — INLINE SVG SAFES                                */
/* ═══════════════════════════════════════════════════════════════ */

function FacebookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return <MessageCircle size={16} aria-hidden="true" />
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DONNÉES                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const communityLinks: FooterLink[] = [
  {
    href: '/blog',
    label: 'Blog',
    icon: <FileText size={14} aria-hidden="true" />,
  },
  {
    href: '/temoignages',
    label: 'Témoignages',
    icon: <Star size={14} aria-hidden="true" />,
  },
  {
    href: '/affiliation',
    label: "Programme d'affiliation",
    icon: <Users size={14} aria-hidden="true" />,
  },
  {
    href: '/search?mode=hybrid',
    label: 'Recherche IA',
    icon: <Sparkles size={14} aria-hidden="true" />,
  },
]

const legalLinks: FooterLink[] = [
  {
    href: '/confidentialite',
    label: 'Confidentialité',
    icon: <Shield size={14} aria-hidden="true" />,
  },
  {
    href: '/conditions',
    label: "Conditions d'utilisation",
    icon: <FileText size={14} aria-hidden="true" />,
  },
  {
    href: '/cookies',
    label: 'Politique de cookies',
    icon: <Info size={14} aria-hidden="true" />,
  },
  {
    href: '/mentions-legales',
    label: 'Mentions légales',
    icon: <Info size={14} aria-hidden="true" />,
  },
]

const socialLinks: SocialLink[] = [
  {
    href: 'https://www.facebook.com/share/1HkYMGaSuu/',
    label: 'Facebook',
    icon: <FacebookIcon />,
  },
  {
    href: 'https://www.instagram.com/gercie_mp',
    label: 'Instagram',
    icon: <InstagramIcon />,
  },
  {
    href: 'https://tiktok.com/@gercie_mp',
    label: 'TikTok',
    icon: <TikTokIcon />,
  },
  {
    href: 'https://x.com/gercie_mp',
    label: 'X (Twitter)',
    icon: <XIcon />,
  },
  {
    href: 'https://www.linkedin.com/company/gercie',
    label: 'LinkedIn',
    icon: <LinkedInIcon />,
  },
  {
    href: 'https://www.youtube.com/@gercie',
    label: 'YouTube',
    icon: <YouTubeIcon />,
  },
  {
    href: 'https://wa.me/243973868195',
    label: 'WhatsApp',
    icon: <WhatsAppIcon />,
  },
]

const paymentMethods: PaymentMethod[] = [
  {
    name: 'Visa',
    icon: <CreditCard size={14} aria-hidden="true" />,
  },
  {
    name: 'Mastercard',
    icon: <CreditCard size={14} aria-hidden="true" />,
  },
  {
    name: 'CinetPay',
    icon: <CreditCard size={14} aria-hidden="true" />,
  },
  {
    name: 'Mobile Money',
    icon: <Smartphone size={14} aria-hidden="true" />,
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

const linkClasses =
  'group inline-flex items-center gap-2 rounded-md py-0.5 text-sm text-fg-muted transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const socialButtonClasses =
  'inline-flex h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface text-fg-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

function FooterSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-fg-subtle">
      {children}
    </h3>
  )
}

function FooterLinkItem({
  link,
  onNavigate,
}: {
  link: FooterLink
  onNavigate?: () => void
}) {
  const content = (
    <>
      <span
        className="text-fg-subtle transition-colors duration-200 group-hover:text-accent"
        aria-hidden="true"
      >
        {link.icon}
      </span>
      <span>{link.label}</span>
    </>
  )

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={linkClasses}
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={link.href} onClick={onNavigate} className={linkClasses}>
      {content}
    </Link>
  )
}

function FooterAccordion({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rawId = useId()
  const id = rawId.replace(/:/g, '')

  return (
    <div className="border-b border-line/70">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls={`footer-accordion-${id}`}
        className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-semibold uppercase tracking-[0.14em] text-fg transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>{title}</span>

        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-fg-subtle transition-transform duration-300',
            open && 'rotate-180 text-accent'
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={`footer-accordion-${id}`}
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function FooterBrand({
  showLogo = true,
  className,
}: {
  showLogo?: boolean
  className?: string
}) {
  return (
    <div className={cn('space-y-5', className)}>
      {showLogo && (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-hover text-accent-contrast shadow-card">
            <span className="text-base font-bold leading-none">G</span>
          </div>

          <p className="text-lg font-semibold tracking-tight text-fg">
            Gercie<span className="text-accent">.</span>
          </p>
        </div>
      )}

      <p className="max-w-sm text-sm leading-relaxed text-fg-muted">
        Marketplace universelle en RDC. Authenticité, sécurité et élégance à
        portée de main.
      </p>

      <div className="flex flex-wrap gap-2">
        {socialLinks.map((social) => (
          <a
            key={social.label}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            title={social.label}
            aria-label={social.label}
            className={socialButtonClasses}
          >
            {social.icon}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-fg-subtle">
        <MapPin size={14} className="text-accent/70" aria-hidden="true" />
        <span>Kinshasa, RDC</span>
      </div>
    </div>
  )
}

function PaymentMethods({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {paymentMethods.map((method) => (
        <div
          key={method.name}
          title={method.name}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted"
        >
          <span className="text-fg-subtle" aria-hidden="true">
            {method.icon}
          </span>
          <span>{method.name}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN FOOTER                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export default function Footer() {
  const rawContactId = useId()
  const contactId = `footer-contact-${rawContactId.replace(/:/g, '')}`

  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: '',
  })
  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle')

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const clearSuccessTimer = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }

  const updateContactField =
    (field: 'name' | 'email' | 'message') =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setContactForm((previous) => ({
        ...previous,
        [field]: event.target.value,
      }))
    }

  const toggleContactForm = () => {
    clearSuccessTimer()
    setShowContactForm((previous) => !previous)
    setContactStatus('idle')
  }

  const closeContactForm = () => {
    clearSuccessTimer()
    setShowContactForm(false)
    setContactStatus('idle')
  }

  const handleContactSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()
    clearSuccessTimer()

    if (!contactForm.email.trim() || !contactForm.message.trim()) {
      setContactStatus('error')
      return
    }

    setContactStatus('loading')

    try {
      // ---------------------------------------------------------------------
      // Simulation locale volontaire.
      // Remplacez ce bloc par un vrai appel API quand /api/contact est prêt :
      //
      // const response = await fetch('/api/contact', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(contactForm),
      // })
      //
      // if (!response.ok) throw new Error('Contact failed')
      // ---------------------------------------------------------------------
      await new Promise((resolve) => setTimeout(resolve, 900))

      setContactStatus('success')
      setContactForm({ name: '', email: '', message: '' })

      successTimerRef.current = setTimeout(() => {
        setContactStatus('idle')
        setShowContactForm(false)
        successTimerRef.current = null
      }, 2800)
    } catch {
      setContactStatus('error')

      successTimerRef.current = setTimeout(() => {
        setContactStatus('idle')
        successTimerRef.current = null
      }, 4000)
    }
  }

  return (
    <footer
      className="relative isolate overflow-hidden bg-raised text-fg"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        Pied de page Gercie
      </h2>

      {/* Motif décoratif discret */}
      <div
        className="pointer-events-none absolute inset-0 pattern-dots opacity-[0.025]"
        aria-hidden="true"
      />

      {/* Ligne premium supérieure */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {/* ================================================================ */}
        {/*  DESKTOP                                                         */}
        {/* ================================================================ */}

        <div className="hidden gap-10 md:grid md:grid-cols-12">
          <div className="md:col-span-4 lg:col-span-4">
            <FooterBrand />
          </div>

          <div className="md:col-span-2 lg:col-span-2">
            <FooterSectionTitle>Communauté</FooterSectionTitle>

            <nav aria-label="Liens communauté">
              <ul className="space-y-2.5">
                {communityLinks.map((link) => (
                  <li key={link.href}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="md:col-span-3 lg:col-span-3">
            <FooterSectionTitle>Support</FooterSectionTitle>

            <nav aria-label="Liens support" className="space-y-2.5">
              <FooterLinkItem
                link={{
                  href: '/support',
                  label: "Centre d'aide",
                  icon: <Headset size={14} aria-hidden="true" />,
                }}
              />

              <button
                type="button"
                onClick={toggleContactForm}
                aria-expanded={showContactForm}
                aria-controls={showContactForm ? contactId : undefined}
                className={cn(
                  linkClasses,
                  'w-full justify-start'
                )}
              >
                <span
                  className="text-fg-subtle transition-colors duration-200 group-hover:text-accent"
                  aria-hidden="true"
                >
                  <MessageCircle size={14} />
                </span>

                <span>Nous contacter</span>
              </button>
            </nav>
          </div>

          <div className="md:col-span-3 lg:col-span-3">
            <FooterSectionTitle>Légal</FooterSectionTitle>

            <nav aria-label="Liens légaux">
              <ul className="space-y-2.5">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* ================================================================ */}
        {/*  MOBILE                                                          */}
        {/* ================================================================ */}

        <div className="space-y-1 md:hidden">
          <FooterAccordion title="Gercie">
            <FooterBrand showLogo={false} />
          </FooterAccordion>

          <FooterAccordion title="Communauté">
            <nav aria-label="Liens communauté mobile">
              <ul className="space-y-2.5">
                {communityLinks.map((link) => (
                  <li key={link.href}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          </FooterAccordion>

          <FooterAccordion title="Support">
            <nav
              aria-label="Liens support mobile"
              className="space-y-2.5"
            >
              <FooterLinkItem
                link={{
                  href: '/support',
                  label: "Centre d'aide",
                  icon: <Headset size={14} aria-hidden="true" />,
                }}
              />

              <button
                type="button"
                onClick={toggleContactForm}
                aria-expanded={showContactForm}
                aria-controls={showContactForm ? contactId : undefined}
                className={cn(
                  linkClasses,
                  'w-full justify-start'
                )}
              >
                <span
                  className="text-fg-subtle transition-colors duration-200 group-hover:text-accent"
                  aria-hidden="true"
                >
                  <MessageCircle size={14} />
                </span>

                <span>Nous contacter</span>
              </button>
            </nav>
          </FooterAccordion>

          <FooterAccordion title="Légal & Paiements">
            <nav aria-label="Liens légaux mobiles" className="mb-5">
              <ul className="space-y-2.5">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>

            <PaymentMethods />
          </FooterAccordion>
        </div>

        {/* ================================================================ */}
        {/*  PAIEMENTS DESKTOP                                               */}
        {/* ================================================================ */}

        <div className="mt-10 hidden border-t border-line pt-8 md:block">
          <FooterSectionTitle>Paiements acceptés</FooterSectionTitle>
          <PaymentMethods />
        </div>

        {/* ================================================================ */}
        {/*  FORMULAIRE DE CONTACT                                           */}
        {/* ================================================================ */}

        {showContactForm && (
          <section
            id={contactId}
            className="animate-fade-in-up mt-10 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
            aria-label="Formulaire de contact"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-fg">
                  Envoyez-nous un message
                </h3>
                <p className="mt-1 text-xs text-fg-muted">
                  Notre équipe vous répond rapidement.
                </p>
              </div>

              <button
                type="button"
                onClick={closeContactForm}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-canvas text-fg-muted transition-colors duration-200 hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="Fermer le formulaire de contact"
              >
                <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fg-muted">
                    Votre nom
                  </span>

                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={contactForm.name}
                    onChange={updateContactField('name')}
                    placeholder="Ex : Amina K."
                    className="w-full rounded-control border border-line bg-canvas px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fg-muted">
                    Votre email <span className="text-danger">*</span>
                  </span>

                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={contactForm.email}
                    onChange={updateContactField('email')}
                    placeholder="vous@exemple.com"
                    className="w-full rounded-control border border-line bg-canvas px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">
                  Votre message <span className="text-danger">*</span>
                </span>

                <textarea
                  name="message"
                  required
                  rows={4}
                  value={contactForm.message}
                  onChange={updateContactField('message')}
                  placeholder="Décrivez votre demande…"
                  className="w-full resize-none rounded-control border border-line bg-canvas px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={contactStatus === 'loading'}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-accent px-4 text-sm font-semibold text-accent-contrast shadow-card transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60"
                >
                  {contactStatus === 'loading' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Envoi…
                    </>
                  ) : (
                    <>
                      <Send size={16} aria-hidden="true" />
                      Envoyer
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={closeContactForm}
                  className="inline-flex h-10 items-center justify-center rounded-pill border border-line bg-transparent px-4 text-sm font-semibold text-fg-muted transition-colors duration-200 hover:border-line-strong hover:bg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Annuler
                </button>

                <div
                  className="min-h-5"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {contactStatus === 'success' && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Message envoyé.
                    </span>
                  )}

                  {contactStatus === 'error' && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
                      <AlertCircle size={14} aria-hidden="true" />
                      Une erreur est survenue.
                    </span>
                  )}
                </div>
              </div>
            </form>
          </section>
        )}

        {/* ================================================================ */}
        {/*  BAS DE PAGE                                                     */}
        {/* ================================================================ */}

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {currentYear} Gercie. Tous droits réservés.</p>

          <p className="inline-flex items-center gap-1.5">
            <MapPin size={12} className="text-accent/60" aria-hidden="true" />
            Conçu avec soin à Kinshasa, RDC
          </p>
        </div>
      </div>
    </footer>
  )
}