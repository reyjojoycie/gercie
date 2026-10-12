// app/api/search/route.ts
// Routeur legacy de recherche. Redirige vers les bons endpoints selon le mode.
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const frontQuery = searchParams.get('query') || searchParams.get('q') || '';
    const mode = searchParams.get('mode') || 'smart'; // smart par défaut
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    console.log(`🔍 [Search Router] Requête - Query: "${frontQuery}", Mode: "${mode}"`);

    // Si mode sémantique ou hybride legacy demandé ET qu'il y a du texte
    if ((mode === 'semantic' || mode === 'hybrid') && frontQuery.length > 0) {
      console.log("➡️ Redirection vers la recherche SÉMANTIQUE / IA legacy");
      const aiParams = new URLSearchParams();
      aiParams.set('q', frontQuery);
      if (mode === 'semantic') aiParams.set('onlySemantic', 'true');
      
      const aiResponse = await fetch(`${baseUrl}/api/ai/search?${aiParams.toString()}`, {
        cache: 'no-store'
      });
      
      if (!aiResponse.ok) {
        return NextResponse.json({ error: "L'IA n'a pas pu répondre." }, { status: aiResponse.status });
      }
      const aiData = await aiResponse.json();
      return NextResponse.json(aiData.results || []);
    }

    // Pour 'smart', 'text', ou requête vide -> Recherche avancée
    console.log("➡️ Redirection vers la recherche avancée (Smart / Texte)");
    const advancedParams = new URLSearchParams(searchParams);
    if (!advancedParams.has('q') && !advancedParams.has('query')) {
      advancedParams.set('query', frontQuery);
    }
    
    const advancedResponse = await fetch(`${baseUrl}/api/search/advanced?${advancedParams.toString()}`, {
      cache: 'no-store'
    });
    
    if (!advancedResponse.ok) {
      return NextResponse.json({ error: "La recherche avancée a échoué." }, { status: advancedResponse.status });
    }
    
    const advancedData = await advancedResponse.json();
    return NextResponse.json(advancedData);

  } catch (error: any) {
    console.error("💥 Erreur critique dans /api/search/route.ts :", error.message);
    return NextResponse.json({ error: "Erreur interne du serveur." }, { status: 500 });
  }
}