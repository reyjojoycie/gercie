'use client';

import { useState, useCallback, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
  folder?: string;
  aspectRatio?: number; // 2 pour 2:1, 1 pour carré, etc.
  maxSizeMB?: number;
  className?: string;
  defaultImage?: string;
}

export function ImageUpload({
  onUploadComplete,
  folder = 'hero',
  aspectRatio = 2, // 2:1 (largeur 2x hauteur)
  maxSizeMB = 5,
  className,
  defaultImage,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(defaultImage || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  // Vérifier les dimensions de l'image et le ratio
  const validateImageDimensions = useCallback(
    (file: File): Promise<{ width: number; height: number; isValid: boolean }> => {
      return new Promise((resolve) => {
        const img = document.createElement('img');
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const width = img.width;
          const height = img.height;
          const ratio = width / height;
          const tolerance = 0.1;
          const isValid = Math.abs(ratio - aspectRatio) <= tolerance;
          resolve({ width, height, isValid });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ width: 0, height: 0, isValid: false });
        };
        img.src = url;
      });
    },
    [aspectRatio]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérification taille
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`L'image ne doit pas dépasser ${maxSizeMB} Mo`);
      addToast({ type: 'error', message: `Image trop volumineuse (max ${maxSizeMB} Mo)` });
      return;
    }

    // Vérification type
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image');
      addToast({ type: 'error', message: 'Format non supporté' });
      return;
    }

    // Validation du ratio
    setError(null);
    const { width, height, isValid } = await validateImageDimensions(file);
    if (!isValid) {
      const ratioMsg = `Rapport 2:1 requis (largeur = 2x hauteur). Actuel : ${width}x${height}`;
      setError(ratioMsg);
      addToast({ type: 'error', message: ratioMsg });
      return;
    }

    // Upload vers Supabase Storage
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabaseBrowser.storage
        .from('hero-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Récupérer l'URL publique
      const { data: publicUrlData } = supabaseBrowser.storage
        .from('hero-images')
        .getPublicUrl(filePath);

      let finalUrl = publicUrlData.publicUrl;

      // Appliquer transformation pour forcer le ratio 2:1 (1200x600)
      finalUrl = `${finalUrl}?width=1200&height=600&resize=cover`;

      setPreview(finalUrl);
      onUploadComplete(finalUrl);
      addToast({ type: 'success', message: 'Image uploadée avec succès (ratio 2:1)' });
    } catch (err) {
      console.error('Upload error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors de l\'upload';
      setError(errorMsg);
      addToast({ type: 'error', message: errorMsg });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearPreview = () => {
    setPreview(null);
    setError(null);
    onUploadComplete('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline-gold"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          leftIcon={uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        >
          {uploading ? 'Upload en cours...' : 'Choisir une image (2:1)'}
        </Button>
        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearPreview}
            leftIcon={<X size={14} />}
          >
            Supprimer
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Aperçu de l'image avec conteneur 2:1 – utilisation de <img> standard */}
      {preview && (
        <div className="relative w-full max-w-md rounded-lg overflow-hidden border border-gold-400/30 bg-neutral-100 dark:bg-neutral-800">
          <div className="relative aspect-[2/1]">
            <img
              src={preview}
              alt="Aperçu"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            Format 2:1 (1200x600)
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <p className="text-xs text-neutral-400">
        Image au format 2:1 (ex: 1200x600, 1600x800). Taille max {maxSizeMB} Mo.
      </p>
    </div>
  );
}