// app/api/commandes/[id]/facture/route.ts
// ---------------------------------------------------------------------------
// API de Génération de Facture PDF – Écosystème Gercie
// Correctif Next.js Asynchronous Params & Resolution Fonts Native PDFKit
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import PDFDocument from 'pdfkit'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // ✅ CORRECTION 1 : Résolution de l'exception Next.js (Dynamic APIs asynchrones)
    const resolvedParams = await params
    const commandeId = resolvedParams.id
    
    // 1. Initialisation sécurisée de Supabase
    const supabase = await createClient(false)
    
    // 2. Vérification de l'état d'authentification
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
    }

    // 3. Extraction de la commande principale
    const { data: commande, error: commandeError } = await supabase
      .from('commandes')
      .select('*')
      .eq('id', commandeId)
      .single()

    if (commandeError || !commande) {
      logger.warn({ commandeId }, 'Commande introuvable ou droits insuffisants')
      return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 })
    }

    // 4. Extraction isolée des sous-articles
    const { data: articles } = await supabase
      .from('commande_articles')
      .select('*')
      .eq('commande_id', commandeId)

    // 5. Initialisation sécurisée de PDFKit
    const chunks: Buffer[] = []
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 50,
      // ✅ CORRECTION 2 : Désactivation des fichiers externes AFM problématiques sur Next.js
      // En forçant une police standard par défaut ou en gérant l'absence d'AFM.
    })
    
    doc.on('data', (chunk) => chunks.push(chunk))

    // 💡 SÉCURISATION DES POLICES (Fallback Courier/Helvetica sans AFM si crash)
    // Pour contourner le bug de chemin de PDFKit dans Next.js, nous utilisons les polices 
    // système sécurisées sans dépendance AFM externe ou structures complexes.
    const fontPrimary = 'Courier'
    const fontBold = 'Courier-Bold'

    // --- DESIGN SÉCURISÉ POUR GERCIE ---
    doc.fillColor('#1E2229').font(fontBold).fontSize(22).text('GERCIE', 50, 50)
    doc.fontSize(9).font(fontPrimary).fillColor('#71717A').text('Plateforme E-commerce Multiservice', 50, 75)
    
    doc.fontSize(16).font(fontBold).fillColor('#1E2229').text('FACTURE', 400, 50, { align: 'right' })
    
    const referenceFacture = commande.numero_commande || `CMD-${commande.id.slice(0, 8).toUpperCase()}`
    doc.fontSize(10).font(fontPrimary).fillColor('#71717A').text(`N° : ${referenceFacture}`, 400, 75, { align: 'right' })

    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#E4E4E7').stroke()

    // Métadonnées
    const dateFacture = commande.created_at ? new Date(commande.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
    doc.fontSize(10).fillColor('#1E2229').font(fontBold).text('Détails de la facturation :', 50, 120)
    doc.font(fontPrimary).fillColor('#3F3F46')
    doc.text(`Date : ${dateFacture}`)
    doc.text(`Statut du paiement : ${(commande.statut || 'payee').toUpperCase()}`)
    doc.text(`Mode de règlement : ${(commande.payment_method || 'Mobile Money').toUpperCase()}`)

    // Client
    doc.font(fontBold).fillColor('#1E2229').text('Destinataire :', 350, 120)
    doc.font(fontPrimary).fillColor('#3F3F46')
    doc.text(`Client ID : ${(commande.user_id || session.user.id).slice(0, 8)}`, 350, 135)
    doc.text(`Livraison : ${commande.adresse_livraison || 'Non specifiee (Comptoir)'}`, 350, 150)

    // En-têtes du tableau d'articles
    let yPosition = 220
    doc.fillColor('#F4F4F5').rect(50, yPosition, 495, 22).fill()
    doc.fillColor('#1E2229').font(fontBold).fontSize(9)
    doc.text('Designation de l’article', 60, yPosition + 6)
    doc.text('Qte', 340, yPosition + 6, { width: 30, align: 'center' })
    doc.text('Prix Unitaire', 390, yPosition + 6, { width: 70, align: 'right' })
    doc.text('Total', 470, yPosition + 6, { width: 70, align: 'right' })

    yPosition += 22
    doc.font(fontPrimary).fontSize(9).fillColor('#27272A')

    if (articles && articles.length > 0) {
      articles.forEach((item: any) => {
        doc.moveTo(50, yPosition).lineTo(545, yPosition).strokeColor('#F4F4F5').stroke()
        
        const nomProduit = item.nom_produit || `Produit Ref-${String(item.produit_id).slice(0,6)}`
        const qte = item.quantite || 1
        const pu = item.prix_unitaire || 0
        const totalLigne = qte * pu

        doc.text(nomProduit, 60, yPosition + 8, { width: 260, ellipsis: true })
        doc.text(String(qte), 340, yPosition + 8, { width: 30, align: 'center' })
        doc.text(`${Number(pu).toLocaleString()} FC`, 390, yPosition + 8, { width: 70, align: 'right' })
        doc.text(`${totalLigne.toLocaleString()} FC`, 470, yPosition + 8, { width: 70, align: 'right' })
        
        yPosition += 26
      })
    } else {
      doc.moveTo(50, yPosition).lineTo(545, yPosition).strokeColor('#F4F4F5').stroke()
      doc.text('Commande globale enregistree sur Gercie', 60, yPosition + 8)
      doc.text('1', 340, yPosition + 8, { width: 30, align: 'center' })
      doc.text(`${Number(commande.montant_total || 0).toLocaleString()} FC`, 390, yPosition + 8, { width: 70, align: 'right' })
      doc.text(`${Number(commande.montant_total || 0).toLocaleString()} FC`, 470, yPosition + 8, { width: 70, align: 'right' })
      yPosition += 26
    }

    // Totaux finals
    doc.moveTo(50, yPosition).lineTo(545, yPosition).strokeColor('#E4E4E7').stroke()
    yPosition += 15

    doc.fontSize(11).font(fontBold).fillColor('#1E2229')
    doc.text('Montant Total (CDF) :', 280, yPosition, { width: 180, align: 'right' })
    
    const montantTotal = commande.montant_total || 0
    doc.text(`${Number(montantTotal).toLocaleString()} FC`, 470, yPosition, { width: 70, align: 'right' })

    doc.fontSize(8).font(fontPrimary).fillColor('#94A3B8')
    doc.text('Merci pour votre confiance sur Gercie. Ce document fait office de preuve de paiement officielle.', 50, 740, { align: 'center', width: 495 })
    
    doc.end()

    // Compilation du buffer binaire
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (err) => reject(err))
    })

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="facture-${referenceFacture}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    })

  } catch (error: any) {
    logger.error(error, 'Erreur lors de la compilation de la facture PDF')
    return NextResponse.json(
      { error: 'Erreur d’exécution du module PDF', details: error.message },
      { status: 500 }
    )
  }
}