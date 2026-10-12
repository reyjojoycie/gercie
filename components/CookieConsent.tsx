'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { X, Cookie, Shield } from 'lucide-react'

export default function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (!consent) {
      const timer = setTimeout(() => setShow(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const acceptAll = () => {
    localStorage.setItem('cookieConsent', 'all')
    setShow(false)
    // Déclencher les scripts de tracking ici (Google Analytics, etc.)
  }

  const acceptEssential = () => {
    localStorage.setItem('cookieConsent', 'essential')
    setShow(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[28rem] z-50"
        >
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-strong border border-neutral-200 dark:border-neutral-700 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-100 dark:bg-brand-900/30">
                  <Cookie size={18} className="text-brand-600 dark:text-brand-400" />
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Nous utilisons des cookies
                </h3>
              </div>
              <button 
                onClick={() => setShow(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              Nous utilisons des cookies pour améliorer votre expérience, analyser le trafic et personnaliser le contenu. 
              Vous pouvez choisir d&apos;accepter tous les cookies ou uniquement les essentiels.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={acceptAll} fullWidth>
                Accepter tous les cookies
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={acceptEssential} fullWidth>
                  Essentiels uniquement
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShow(false)} fullWidth>
                  Fermer
                </Button>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-3 text-center">
              Consultez notre{' '}
              <a href="/confidentialite" className="underline hover:text-brand-600 transition-colors">
                politique de confidentialité
              </a>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
