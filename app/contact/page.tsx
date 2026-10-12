'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Phone, MessageCircle, Send } from 'lucide-react'

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Ici, plus tard, on pourra envoyer un email via une API
    setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="text-amber-600 hover:underline">&larr; Retour à l'accueil</Link>
        </div>
        <h1 className="text-3xl font-serif font-bold text-stone-800 mb-6">Service client</h1>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-md p-6 border border-stone-100 space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Mail size={20} /> Email</h2>
            <p className="text-stone-600"><a href="mailto:support@gercie.com" className="text-amber-600">support@gercie.com</a></p>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Phone size={20} /> Téléphone</h2>
            <p className="text-stone-600"><a href="tel:+243973868195" className="text-amber-600">+243 973 868 195</a></p>
            <h2 className="text-xl font-semibold flex items-center gap-2"><MessageCircle size={20} /> WhatsApp</h2>
            <p className="text-stone-600"><a href="https://wa.me/243973868195" className="text-amber-600" target="_blank">Cliquez pour nous écrire</a></p>
          </div>
          <div className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <h2 className="text-xl font-semibold mb-4">Envoyer un message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" placeholder="Votre nom" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border border-stone-200 rounded-xl p-3" required />
              <input type="email" placeholder="Votre email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border border-stone-200 rounded-xl p-3" required />
              <textarea rows={4} placeholder="Votre message" value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} className="w-full border border-stone-200 rounded-xl p-3" required />
              <button type="submit" className="w-full bg-amber-600 text-white py-2 rounded-xl font-semibold hover:bg-amber-700 transition flex items-center justify-center gap-2"><Send size={18} /> Envoyer</button>
              {sent && <p className="text-green-600 text-sm text-center">Message envoyé ! Nous vous répondrons rapidement.</p>}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
