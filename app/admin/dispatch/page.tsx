// app/admin/dispatch/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Search, Truck, ClipboardCheck, QrCode, RefreshCcw, X,
  CheckCircle, AlertTriangle, MapPin, User, Clock, ArrowRight,
  Activity, ChevronDown, ChevronUp, Copy
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { getStatutLabel, getStatutVariant } from '@/lib/statuts'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
interface CommandeDispatch {
  id: string
  numero: string
  statut: string
  type_livraison: string
  adresse_livraison?: string
  point_retrait?: { nom: string }
  articles: { nom: string; quantite: number }[]
  livreur?: { nom: string; prenom: string; telephone?: string } | null
  code_livreur: string
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */
export default function AdminDispatchPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [selectedCommande, setSelectedCommande] = useState<CommandeDispatch | null>(null)

  const { data: commandes = [], isLoading, isError, refetch, isFetching } = useQuery<CommandeDispatch[]>({
    queryKey: ['admin-dispatch'],
    queryFn: async () => {
      // Récupère les commandes en attente de collecte (conditionnement_premium OU collecte)
      const res = await fetch(`/api/admin/commandes?statut=conditionnement_premium&statut=collecte&limit=50`)
      if (!res.ok) throw new Error('Erreur chargement')
      const data = await res.json()
      return data.data || []
    },
    staleTime: 10_000,
  })

  // Mutation validation collecte
  const validateMutation = useMutation({
    mutationFn: async ({ commandeId, code }: { commandeId: string; code: string }) => {
      const res = await fetch(`/api/commandes/${commandeId}/valider-collecte`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_livreur: code }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur')
      }
      return res.json()
    },
    onSuccess: () => {
      toast({ type: 'success', message: 'Collecte validée !' })
      queryClient.invalidateQueries({ queryKey: ['admin-dispatch'] })
      setQrResult(null)
    },
    onError: (err: any) => {
      toast({ type: 'error', message: err.message })
    },
  })

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 30_000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  // QR scanner
  const startQrScanner = useCallback(() => {
    setShowQrScanner(true)
    const scanner = new Html5Qrcode('qr-reader')
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        setQrResult(decodedText)
        setShowQrScanner(false)
        scanner.stop()
      },
      () => {}
    ).catch(err => {
      toast({ type: 'error', message: 'Erreur caméra' })
      setShowQrScanner(false)
    })
  }, [toast])

  const handleManualValidate = (commandeId: string) => {
    const code = prompt('Saisissez le code livreur :')
    if (code) validateMutation.mutate({ commandeId, code })
  }

  const commandesFiltrees = commandes.filter(c =>
    search ? c.numero.includes(search) || c.livreur?.nom?.includes(search) || c.code_livreur.includes(search) : true
  )

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      <Container className="py-8 max-w-6xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
                <ClipboardCheck className="text-gold-500" /> Centre de Dispatch
              </h1>
              <p className="text-muted-foreground mt-1">
                Validez la remise des colis aux livreurs
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline-gold" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
                <Activity size={14} className={cn(autoRefresh && 'text-green-500')} />
                {autoRefresh ? 'Auto ON' : 'Auto OFF'}
              </Button>
              <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
                <RefreshCcw size={14} /> Actualiser
              </Button>
              <Button variant="luxe" size="sm" onClick={startQrScanner}>
                <QrCode size={14} className="mr-1" /> Scanner QR
              </Button>
            </div>
          </div>

          {/* Compteur */}
          <div className="mb-6 p-4 bg-white/50 dark:bg-midnight-800/40 border border-gold-400/20 rounded-xl flex items-center justify-between">
            <span className="text-sm font-medium">
              {commandes.length} commande(s) en attente de collecte
            </span>
            <Input
              placeholder="Rechercher un code ou numéro..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
              allowClear onClear={() => setSearch('')}
            />
          </div>

          {/* Résultat QR scanné */}
          {qrResult && (
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="mb-4 p-3 bg-gold-50 dark:bg-gold-900/20 rounded-xl border border-gold-400/30 flex items-center gap-4">
              <QrCode size={20} className="text-gold-600" />
              <span className="font-mono text-sm">{qrResult}</span>
              <Button variant="luxe" size="sm" onClick={() => {
                // Chercher la commande avec ce code livreur
                const cmd = commandes.find(c => c.code_livreur === qrResult)
                if (cmd) {
                  validateMutation.mutate({ commandeId: cmd.id, code: qrResult })
                } else {
                  toast({ type: 'error', message: 'Aucune commande correspondante' })
                }
              }}>
                Valider ce code
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setQrResult(null)}><X size={14} /></Button>
            </motion.div>
          )}

          {/* Liste des commandes */}
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner variant="premium" size="lg" /></div>
          ) : commandesFiltrees.length === 0 ? (
            <Card variant="glass" className="text-center py-12">
              <CardContent>
                <Package size={48} className="mx-auto text-neutral-400 mb-4" />
                <p>Aucune commande en attente de collecte.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {commandesFiltrees.map(cmd => (
                <motion.div key={cmd.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card variant="glass" className="border-l-4 border-l-gold-400">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold">#{cmd.numero}</span>
                            <Badge variant={getStatutVariant(cmd.statut)} size="sm">
                              {getStatutLabel(cmd.statut)}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-1">
                              <User size={14} /> {cmd.livreur ? `${cmd.livreur.prenom} ${cmd.livreur.nom}` : 'Non assigné'}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin size={14} /> {cmd.type_livraison === 'domicile' ? cmd.adresse_livraison : cmd.point_retrait?.nom}
                            </div>
                            <div className="flex items-center gap-1">
                              <Package size={14} /> {cmd.articles.length} article(s)
                            </div>
                            <div className="font-mono text-xs mt-1">Code livreur : {cmd.code_livreur}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Tooltip content="Valider manuellement">
                            <Button variant="gold" size="sm" onClick={() => handleManualValidate(cmd.id)}>
                              <ClipboardCheck size={14} className="mr-1" /> Valider
                            </Button>
                          </Tooltip>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCommande(cmd)}>
                            Détails
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </Container>

      {/* Modal détails commande */}
      {selectedCommande && (
        <Modal isOpen={!!selectedCommande} onClose={() => setSelectedCommande(null)} title={`Détails #${selectedCommande.numero}`} size="md" accent="gold">
          <div className="space-y-3 text-sm">
            <p><span className="font-medium">Statut :</span> {getStatutLabel(selectedCommande.statut)}</p>
            <p><span className="font-medium">Livreur :</span> {selectedCommande.livreur ? `${selectedCommande.livreur.prenom} ${selectedCommande.livreur.nom}` : 'Non assigné'}</p>
            <p><span className="font-medium">Destination :</span> {selectedCommande.type_livraison === 'domicile' ? selectedCommande.adresse_livraison : selectedCommande.point_retrait?.nom}</p>
            <div>
              <span className="font-medium">Articles :</span>
              <ul className="list-disc list-inside ml-2">
                {selectedCommande.articles.map((a, i) => <li key={i}>{a.nom} x{a.quantite}</li>)}
              </ul>
            </div>
            <p className="font-mono">Code livreur : {selectedCommande.code_livreur}</p>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="gold" onClick={() => handleManualValidate(selectedCommande.id)}>
              Valider cette collecte
            </Button>
          </div>
        </Modal>
      )}

      {/* Scanner QR modal */}
      <Modal isOpen={showQrScanner} onClose={() => setShowQrScanner(false)} title="Scanner le code livreur" size="sm" accent="gold">
        <div id="qr-reader" style={{ width: '100%' }} />
        <p className="text-xs text-muted-foreground mt-2">Placez le QR code du livreur devant la caméra</p>
      </Modal>
    </div>
  )
}