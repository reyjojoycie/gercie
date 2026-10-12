// components/layout/Footer.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  ShoppingBag,
  Wallet,
  Truck,
  RefreshCw,
  Shield,
  Heart,
  Smartphone,
  Headset,
  FileText,
  Info,
  HelpCircle,
  Gem,
  Facebook,
  MessageCircle,
  Instagram,
  Linkedin,
  Youtube,
  ChevronDown,
  ArrowUp,
  MapPin,
  Phone,
  Mail,
  Clock,
  Store,
  Users,
  Star,
  CreditCard,
  Globe,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronUp,
  Sparkles, // <-- ajouté
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Données enrichies                                                  */
/* ------------------------------------------------------------------ */

// Communauté (enrichi avec lien Recherche IA)
const communityLinks = [
  { href: "/blog", label: "Blog", icon: FileText },
  { href: "/temoignages", label: "Témoignages", icon: Star },
  { href: "/affiliation", label: "Programme d'affiliation", icon: Users },
  { href: "/search?mode=hybrid", label: "Recherche IA", icon: Sparkles }, // <-- nouveau
];

// Liens légaux (inchangés)
const legalLinks = [
  { href: "/confidentialite", label: "Confidentialité", icon: Shield },
  { href: "/conditions", label: "Conditions d'utilisation", icon: FileText },
  { href: "/cookies", label: "Politique de cookies", icon: Info },
  { href: "/mentions-legales", label: "Mentions légales", icon: Info },
];

// Réseaux sociaux (inchangés)
const socialLinks = [
  {
    href: "https://www.facebook.com/share/1HkYMGaSuu/",
    label: "Facebook",
    icon: Facebook,
  },
  {
    href: "https://www.instagram.com/gercie_mp",
    label: "Instagram",
    icon: Instagram,
  },
  {
    href: "https://tiktok.com/@gercie_mp",
    label: "TikTok",
    icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
      </svg>
    ),
  },
  {
    href: "https://x.com/gercie_mp",
    label: "X (Twitter)",
    icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://www.linkedin.com/company/gercie",
    label: "LinkedIn",
    icon: Linkedin,
  },
  {
    href: "https://www.youtube.com/@gercie",
    label: "YouTube",
    icon: Youtube,
  },
  {
    href: "https://wa.me/243973868195",
    label: "WhatsApp",
    icon: MessageCircle,
  },
];

// Moyens de paiement enrichis (inchangés)
const paymentMethods = [
  { name: "Visa", icon: CreditCard, color: "text-blue-400" },
  { name: "Mastercard", icon: CreditCard, color: "text-orange-400" },
  { name: "CinetPay", icon: CreditCard, color: "text-green-400" },
  { name: "Wallet Gercie", icon: Wallet, color: "text-gold-400" },
  { name: "Mobile Money", icon: Smartphone, color: "text-cyan-400" },
];

// Horaires de support
const supportHours = "Lun–Sam : 8h–20h (UTC+1)";

/* ------------------------------------------------------------------ */
/*  Composant FooterAccordion (mobile)                                 */
/* ------------------------------------------------------------------ */
const FooterAccordion = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-midnight-700/60 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left text-gold-400 font-semibold text-sm uppercase tracking-wider"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          size={16}
          className={`transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 mt-3" : "max-h-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */
export default function Footer() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [contactStatus, setContactStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [currentYear] = useState(new Date().getFullYear());

  // Détection du scroll pour le bouton "retour en haut"
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Gestion formulaire de contact
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.email || !contactForm.message) return;
    setContactStatus("loading");
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setContactStatus("success");
      setContactForm({ name: "", email: "", message: "" });
      setTimeout(() => {
        setContactStatus("idle");
        setShowContactForm(false);
      }, 3000);
    } catch (err) {
      setContactStatus("error");
      setTimeout(() => setContactStatus("idle"), 4000);
    }
  };

  return (
    <footer
      className="relative bg-gradient-to-b from-midnight-900 to-midnight-950 text-white overflow-hidden"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        Pied de page Gercie
      </h2>

      {/* Motif décoratif */}
      <div className="absolute inset-0 pattern-dots opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold-400 to-transparent opacity-30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        {/* ---- Colonnes desktop (4 colonnes) ---- */}
        <div className="hidden md:grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {/* Colonne 1 : Marque + Réseaux */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 flex items-center justify-center shadow-gold">
                <span className="text-midnight-900 font-bold text-lg">G</span>
              </div>
              <h3 className="text-xl font-semibold text-neutral-100 font-serif">
                Gercie<span className="text-gold-400">.</span>
              </h3>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed mb-6">
              Marketplace universelle en RDC. Authenticité, sécurité et élégance
              à portée de main.
            </p>
            {/* Réseaux sociaux */}
            <div className="flex flex-wrap gap-2 mb-6">
              {socialLinks.slice(0, 5).map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                    "border border-neutral-700 text-neutral-400",
                    "hover:text-midnight-900 hover:bg-gold-400 hover:border-gold-400",
                    "hover:shadow-gold hover:-translate-y-0.5"
                  )}
                  title={social.label}
                >
                  {typeof social.icon === "function"
                    ? social.icon()
                    : <social.icon size={16} />}
                </a>
              ))}
            </div>
          </div>

          {/* Colonne 2 : Communauté (inclut Recherche IA) */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gold-400/80 mb-6">
              Communauté
            </h4>
            <ul className="space-y-3">
              {communityLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400 transition-colors"
                  >
                    <link.icon size={14} className="text-neutral-500 group-hover:text-gold-400" />
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 3 : Support & Légal (inchangée) */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gold-400/80 mb-6">
              Support
            </h4>
            <ul className="space-y-3 mb-8">
              <li>
                <Link
                  href="/support"
                  className="group flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400 transition-colors"
                >
                  <Headset size={14} className="text-neutral-500 group-hover:text-gold-400" />
                  <span>Centre d&apos;aide</span>
                </Link>
              </li>
              <li>
                <button
                  onClick={() => setShowContactForm(!showContactForm)}
                  className="group flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400 transition-colors"
                >
                  <MessageCircle size={14} className="text-neutral-500 group-hover:text-gold-400" />
                  <span>Nous contacter</span>
                </button>
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <Clock size={14} className="text-neutral-500" />
                <span>{supportHours}</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <Phone size={14} className="text-neutral-500" />
                <a href="tel:+243973868195" className="hover:text-gold-400">
                  +243 97 38 68 195
                </a>
              </li>
            </ul>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gold-400/80 mb-6">
              Légal
            </h4>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400 transition-colors"
                  >
                    <link.icon size={14} className="text-neutral-500 group-hover:text-gold-400" />
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 4 : Paiements & App (inchangée) */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gold-400/80 mb-6">
              Paiements acceptés
            </h4>
            <div className="flex flex-wrap gap-3 mb-6">
              {paymentMethods.map((method) => (
                <div
                  key={method.name}
                  className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5 text-sm"
                  title={method.name}
                >
                  <method.icon size={16} className={method.color} />
                  <span className="text-neutral-200 text-xs">{method.name}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-neutral-400 mb-6">
              Paiements sécurisés via SSL et cryptage bancaire.
            </div>

            <h4 className="text-xs font-bold uppercase tracking-widest text-gold-400/80 mb-6">
              Application mobile
            </h4>
            <div className="flex flex-col gap-2">
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-2 text-sm"
                aria-label="Télécharger sur l'App Store"
              >
                <Smartphone size={16} />
                Télécharger sur l'App Store
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-2 text-sm"
                aria-label="Télécharger sur Google Play"
              >
                <Smartphone size={16} />
                Télécharger sur Google Play
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-2 text-sm"
                aria-label="Version web progressive"
              >
                <Globe size={16} />
                Accéder via le web
              </a>
            </div>
          </div>
        </div>

        {/* ---- Version mobile : accordéons ---- */}
        <div className="md:hidden space-y-1">
          <FooterAccordion title="Gercie">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-neutral-300">
                Marketplace universelle en RDC. Authenticité, sécurité et élégance à portée de main.
              </p>
              <div className="flex flex-wrap gap-2">
                {socialLinks.slice(0, 5).map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg flex items-center justify-center border border-neutral-700 text-neutral-400 hover:text-midnight-900 hover:bg-gold-400 hover:border-gold-400 transition-all"
                  >
                    {typeof social.icon === "function"
                      ? social.icon()
                      : <social.icon size={16} />}
                  </a>
                ))}
              </div>
            </div>
          </FooterAccordion>

          <FooterAccordion title="Communauté">
            <ul className="space-y-2">
              {communityLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400">
                    <link.icon size={14} />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterAccordion>

          <FooterAccordion title="Support & Légal">
            <ul className="space-y-2">
              <li>
                <Link href="/support" className="flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400">
                  <Headset size={14} /> Centre d&apos;aide
                </Link>
              </li>
              <li>
                <button onClick={() => setShowContactForm(!showContactForm)} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400">
                  <MessageCircle size={14} /> Nous contacter
                </button>
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <Clock size={14} /> {supportHours}
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-400">
                <Phone size={14} /> <a href="tel:+243973868195" className="hover:text-gold-400">+243 97 38 68 195</a>
              </li>
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-gold-400">
                    <link.icon size={14} /> {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterAccordion>

          <FooterAccordion title="Paiements & App">
            <div className="flex flex-wrap gap-2 mb-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.name}
                  className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5 text-sm"
                >
                  <method.icon size={16} className={method.color} />
                  <span className="text-neutral-200 text-xs">{method.name}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-neutral-400 mb-4">
              Paiements sécurisés SSL.
            </div>
            <div className="flex flex-col gap-2">
              <a href="#" className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm text-neutral-200">
                <Smartphone size={16} /> App Store
              </a>
              <a href="#" className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm text-neutral-200">
                <Smartphone size={16} /> Google Play
              </a>
              <a href="#" className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm text-neutral-200">
                <Globe size={16} /> Web
              </a>
            </div>
          </FooterAccordion>
        </div>

        {/* ---- Formulaire de contact rapide ---- */}
        {showContactForm && (
          <div className="mt-10 max-w-2xl mx-auto p-6 rounded-2xl bg-midnight-800/60 backdrop-blur-sm border border-midnight-600 animate-fade-in-up">
            <h3 className="text-lg font-semibold text-gold-400 mb-4">
              Envoyez-nous un message
            </h3>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <Input
                type="text"
                placeholder="Votre nom"
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm({ ...contactForm, name: e.target.value })
                }
                required
                variant="glass"
              />
              <Input
                type="email"
                placeholder="Votre email"
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm({ ...contactForm, email: e.target.value })
                }
                required
                variant="glass"
              />
              <textarea
                className="w-full p-3 rounded-xl bg-white/10 border border-neutral-700 text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
                rows={3}
                placeholder="Votre message..."
                value={contactForm.message}
                onChange={(e) =>
                  setContactForm({ ...contactForm, message: e.target.value })
                }
                required
              />
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="luxe"
                  disabled={contactStatus === "loading"}
                >
                  {contactStatus === "loading" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Envoyer"
                  )}
                </Button>
                {contactStatus === "success" && (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Message envoyé !
                  </span>
                )}
                {contactStatus === "error" && (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertCircle size={14} /> Erreur, réessayez.
                  </span>
                )}
              </div>
            </form>
          </div>
        )}

        {/* ---- Barre inférieure ---- */}
        <div className="mt-12 pt-6 border-t border-midnight-700/40 text-center text-xs text-neutral-500">
          <p>
            &copy; {currentYear} Gercie. Tous droits réservés. L&apos;excellence à portée de main.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-3">
            <Link href="/confidentialite" className="hover:text-gold-400 transition-colors">
              Confidentialité
            </Link>
            <Link href="/conditions" className="hover:text-gold-400 transition-colors">
              Conditions d&apos;utilisation
            </Link>
            <Link href="/cookies" className="hover:text-gold-400 transition-colors">
              Cookies
            </Link>
            <span className="flex items-center gap-1 text-gold-400/70">
              <Gem size={11} /> Kinshasa, RDC
            </span>
          </div>
        </div>
      </div>

      {/* Bouton retour en haut */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-gold-500 text-midnight-900 shadow-lg hover:bg-gold-400 transition-all transform hover:scale-110"
          aria-label="Retour en haut"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </footer>
  );
}