// components/CommandeCard.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Package, ChevronRight, Truck, MapPin, Calendar,
  Eye, EyeOff, Copy, CheckCircle, Key, ShieldCheck,
  BadgeCheck, QrCode
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { getStatutLabel, getStatutVariant, isStatutValidForCode } from '@/lib/statuts'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
export interface CommandeData {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  adresse_livraison?: string
  point_retrait?: { nom: string }
  articles: { nom: string; quantite: number; prix_unitaire: number }[]  // au moins la longueur
  code_client?: string | null
  code_livreur?: string | null
  mode_attribution?: 'LIBRE' | 'ASSIGNE' | null
  livreur?: { nom: string; prenom: string } | null
}

interface CommandeCardProps {
  commande: CommandeData
  context?: 'client' | 'admin' | 'livreur'
  onCopyCode?: (code: string) => void       // callback pour toast externe
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Composant                                                           */
/* ------------------------------------------------------------------ */
export default function CommandeCard({
  commande,
  context = 'client',
  onCopyCode,
  className,
}: CommandeCardProps) {
  const [showClientCode, setShowClientCode] = useState(false)
  const [copiedClient, setCopiedClient] = useState(false)
  const [copiedLivreur, setCopiedLivreur] = useState(false)

  const statutLabel = getStatutLabel(commande.statut)
  const statutVariant = getStatutVariant(commande.statut)
  const showCodeIcon = !!commande.code_client && isStatutValidForCode(commande.statut)

  const handleRevealClientCode = () => {
    setShowClientCode(true)
    setTimeout(() => setShowClientCode(false), 15_000) // masque après 15s
  }

  const copyToClipboard = (text: string, type: 'client' | 'livreur') => {
    navigator.clipboard.writeText(text)
    if (type === 'client') {
      setCopiedClient(true)
      setTimeout(() => setCopiedClient(false), 2000)
    } else {
      setCopiedLivreur(true)
      setTimeout(() => setCopiedLivreur(false), 2000)
    }
    onCopyCode?.(text)
  }

  const nombreArticles = commande.articles?.length || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="overflow-hidden border-border hover:shadow-card-hover backdrop-blur-sm bg-card/70 transition-all duration-300">
        <CardContent className="p-4 sm:p-5">
          {/* En-tête : numéro + statut */}
          <div className="flex justify-between items-start gap-3 mb-3">
            <div>
              <Link
                href={`/commande/confirmation?id=${commande.id}`}
                className="font-bold text-foreground hover:text-gold-500 transition-colors text-base sm:text-lg"
              >
                #{commande.numero}
              </Link>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Calendar size={12} />
                {new Date(commande.date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
            <Badge variant={statutVariant} size="sm" style="solid">
              {statutLabel}
            </Badge>
          </div>

          {/* Ligne livraison + indicateur code */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            {commande.type_livraison === 'domicile' ? (
              <>
                <Truck size={14} className="text-gold-500" />
                <span>Domicile</span>
              </>
            ) : (
              <>
                <MapPin size={14} className="text-gold-500" />
                <span>Point relais</span>
              </>
            )}
            {showCodeIcon && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-gold-600">
                <ShieldCheck size={12} />
                Code dispo.
              </span>
            )}
          </div>

          {/* Codes de sécurité (affichage conditionnel) */}
          <div className="space-y-2 mb-3">
            {/* Code client – visible seulement pour client/admin après révélation */}
            {commande.code_client && isStatutValidForCode(commande.statut) && (
              <div className="flex items-center justify-between bg-gold-50/50 dark:bg-gold-900/10 rounded-lg px-3 py-2 border border-gold-400/20">
                <div className="flex items-center gap-2 text-xs">
                  <Key size={14} className="text-gold-500" />
                  <span className="text-muted-foreground">Code client :</span>
                  {showClientCode || context !== 'client' ? (
                    <span className="font-mono font-bold text-gold-600">
                      {commande.code_client}
                    </span>
                  ) : (
                    <button
                      onClick={handleRevealClientCode}
                      className="text-gold-500 hover:underline text-xs font-medium"
                    >
                      Voir
                    </button>
                  )}
                </div>
                {showClientCode || context !== 'client' ? (
                  <Tooltip content={copiedClient ? 'Copié !' : 'Copier'}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => copyToClipboard(commande.code_client!, 'client')}
                    >
                      {copiedClient ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} className="text-gold-500" />
                      )}
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            )}

            {/* Code livreur – visible seulement pour admin/livreur */}
            {(context === 'admin' || context === 'livreur') && commande.code_livreur && (
              <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-900/10 rounded-lg px-3 py-2 border border-blue-400/20">
                <div className="flex items-center gap-2 text-xs">
                  <Truck size={14} className="text-blue-500" />
                  <span className="text-muted-foreground">Code livreur :</span>
                  <span className="font-mono font-bold text-blue-600">
                    {commande.code_livreur}
                  </span>
                </div>
                <Tooltip content={copiedLivreur ? 'Copié !' : 'Copier'}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(commande.code_livreur!, 'livreur')}
                  >
                    {copiedLivreur ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="text-blue-500" />
                    )}
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>

          {/* Résumé articles et total */}
          <div className="flex justify-between items-center text-sm mb-3">
            <span className="text-muted-foreground">
              {nombreArticles} article{nombreArticles > 1 ? 's' : ''}
            </span>
            <span className="font-bold text-foreground">
              {commande.total.toLocaleString()} CDF
            </span>
          </div>

          {/* Ligne d'attribution (admin) */}
          {context === 'admin' && commande.mode_attribution && (
            <div className="mb-2">
              <Badge variant={commande.mode_attribution === 'ASSIGNE' ? 'gold' : 'neutral'} size="sm">
                {commande.mode_attribution === 'ASSIGNE' ? 'Assigné' : 'Libre'}
              </Badge>
              {commande.livreur && (
                <span className="text-xs text-muted-foreground ml-2">
                  Livreur : {commande.livreur.prenom} {commande.livreur.nom}
                </span>
              )}
            </div>
          )}

          {/* Actions rapides */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Link href={`/commande/confirmation?id=${commande.id}`}>
              <Button variant="ghost" size="sm" className="text-xs">
                Détails
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </Link>
            {/* Possibilité d'ajouter d'autres actions selon le contexte */}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}