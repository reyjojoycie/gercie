// components/search/ImageSearchUpload.tsx
// Composant d'upload d'image pour la recherche visuelle (Maillon S2)
// Permet de combiner image + texte pour une recherche hybride.
// ---------------------------------------------------------------------------
'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, Image as ImageIcon, Sparkles } from 'lucide-react';
import { fileToBase64 } from '@/lib/ai/imageEmbeddings';
import { ProductGrid } from '@/components/ProductGrid';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface SearchResult {
  product_id: string;
  similarity: number;
  nom: string;
  prix: number;
  images: string[];
}

export default function ImageSearchUpload() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textQuery, setTextQuery] = useState('');
  const [textWeight, setTextWeight] = useState(0.5); // 0.5 = équilibre image/texte
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Gestion du drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  }, []);

  // Gestion de la sélection de fichier
  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.addToast({ type: 'error', message: 'Veuillez sélectionner une image valide.' });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.addToast({ type: 'error', message: 'L\'image ne doit pas dépasser 10MB.' });
      return;
    }
    
    setSelectedFile(file);
    
    // Créer un aperçu
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  // Supprimer l'image sélectionnée
  const handleRemoveImage = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResults([]);
    setHasSearched(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Lancer la recherche
  const handleSearch = useCallback(async () => {
    if (!selectedFile && !textQuery.trim()) {
      toast.addToast({ type: 'error', message: 'Veuillez uploader une image ou entrer un texte.' });
      return;
    }
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      let imageUrl: string | undefined;
      
      // Convertir l'image en base64 si présente
      if (selectedFile) {
        imageUrl = await fileToBase64(selectedFile);
      }
      
      // Appeler l'API de recherche par image
      const response = await fetch('/api/search/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl,
          text: textQuery.trim() || undefined,
          textWeight,
          limit: 20,
          minSimilarity: 0.1,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la recherche');
      }
      
      const data = await response.json();
      
      // Convertir les résultats au format attendu par ProductGrid
      const formattedResults: SearchResult[] = (data.results || []).map((r: any) => ({
        product_id: r.product_id,
        similarity: r.similarity,
        nom: r.nom,
        prix: r.prix,
        images: r.images || [],
      }));
      
      setResults(formattedResults);
      
      if (formattedResults.length === 0) {
        toast.addToast({ 
          type: 'info', 
          message: 'Aucun produit similaire trouvé. Essayez avec une autre image ou un texte plus précis.' 
        });
      } else {
        toast.addToast({ 
          type: 'success', 
          message: `${formattedResults.length} produit(s) similaire(s) trouvé(s) !` 
        });
      }
      
    } catch (error: any) {
      console.error('Erreur recherche image:', error);
      toast.addToast({ 
        type: 'error', 
        message: error.message || 'Une erreur est survenue lors de la recherche.' 
      });
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [selectedFile, textQuery, textWeight, toast]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Titre */}
      <div className="flex items-center gap-2">
        <Sparkles className="text-purple-500" size={24} />
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Recherche par image
        </h2>
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Uploadez une photo d'un produit que vous recherchez, ou combinez avec un texte pour plus de précision.
      </p>

      {/* Zone d'upload */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
          className="hidden"
        />
        
        {previewUrl ? (
          <div className="relative inline-block">
            <img
              src={previewUrl}
              alt="Aperçu"
              className="max-h-48 rounded-lg shadow-md"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveImage();
              }}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto text-gray-400" size={48} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Glissez-déposez une image ici, ou <span className="text-purple-500 font-medium">cliquez pour sélectionner</span>
            </p>
            <p className="text-xs text-gray-500">PNG, JPG, WEBP (max 10MB)</p>
          </div>
        )}
      </div>

      {/* Texte optionnel */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Texte optionnel (pour affiner la recherche)
        </label>
        <input
          type="text"
          value={textQuery}
          onChange={(e) => setTextQuery(e.target.value)}
          placeholder="Ex: vitre compatible, couleur rouge, taille M..."
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Pondération image/texte */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Priorité : {textWeight < 0.3 ? 'Image' : textWeight > 0.7 ? 'Texte' : 'Équilibré'}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={textWeight}
          onChange={(e) => setTextWeight(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Image</span>
          <span>Texte</span>
        </div>
      </div>

      {/* Bouton de recherche */}
      <Button
        onClick={handleSearch}
        disabled={isSearching || (!selectedFile && !textQuery.trim())}
        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSearching ? (
          <>
            <Loader2 className="animate-spin mr-2" size={20} />
            Analyse en cours...
          </>
        ) : (
          <>
            <ImageIcon className="mr-2" size={20} />
            Rechercher des produits similaires
          </>
        )}
      </Button>

      {/* Résultats */}
      {hasSearched && !isSearching && (
        <div className="mt-8">
          {results.length > 0 ? (
            <>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Produits similaires trouvés ({results.length})
              </h3>
              <ProductGrid
                products={results.map(r => ({
                  id: r.product_id,
                  nom: r.nom,
                  prix: r.prix,
                  images: r.images,
                  _score: r.similarity,
                }))}
                viewMode="grid"
                animated
              />
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ImageIcon className="mx-auto mb-2" size={48} />
              <p>Aucun produit similaire trouvé.</p>
              <p className="text-sm mt-2">Essayez avec une autre image ou ajoutez du texte pour affiner.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}