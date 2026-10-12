'use client'

import Link from 'next/link'
import { Smartphone, Download, QrCode } from 'lucide-react'

export default function MobilePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="text-amber-600 hover:underline">&larr; Retour à l'accueil</Link>
        </div>
        <h1 className="text-3xl font-serif font-bold text-stone-800 mb-6">Application Gercie Mobile</h1>
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 border border-stone-100 space-y-6 text-center">
          <Smartphone className="mx-auto text-amber-600" size={64} />
          <p className="text-stone-600">Notre application mobile arrive bientôt !</p>
          <p className="text-stone-500 text-sm">Restez connectés pour découvrir une expérience d’achat encore plus fluide.</p>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <div className="flex items-center gap-2 text-stone-500">
              <Download size={18} /> Bientôt sur iOS
            </div>
            <div className="flex items-center gap-2 text-stone-500">
              <Download size={18} /> Bientôt sur Android
            </div>
            <div className="flex items-center gap-2 text-stone-500">
              <QrCode size={18} /> Scan pour être notifié
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
