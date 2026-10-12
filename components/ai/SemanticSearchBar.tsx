// components/ai/SemanticSearchBar.tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, Mic } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/ui/Toast';

interface SearchSuggestion {
  product_id: string;
  score: number;
  nom?: string;
  prix?: number;
  images?: string[];
}

export default function SemanticSearchBar() {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Fermer les suggestions si clic à l'extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recherche de suggestions (utilise le mode smart par défaut via advanced)
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let cancelled = false;
    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        // On utilise /api/search/advanced en mode smart pour les suggestions
        const res = await fetch(
          `/api/search/advanced?q=${encodeURIComponent(debouncedQuery)}&mode=smart&limit=5`
        );
        const data = await res.json();
        
        if (!cancelled && data.data) {
          const enriched = data.data.map((p: any) => ({
            product_id: p.id,
            score: p._score || 0.5,
            nom: p.nom || 'Produit',
            prix: p.prix,
            images: p.images,
          }));
          setSuggestions(enriched);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error('Erreur suggestions recherche', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSuggestions();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setShowSuggestions(false);
    // Plus de paramètre 'mode', le backend utilisera 'smart' par défaut
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [query, router]);

  const handleSuggestionClick = (productId: string) => {
    setShowSuggestions(false);
    setQuery('');
    router.push(`/produits/${productId}`);
  };

  // Reconnaissance vocale
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.addToast({ type: 'error', message: 'Reconnaissance vocale non supportée.' });
      return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.addToast({ type: 'error', message: 'Erreur de reconnaissance vocale.' });
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [toast]);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder="Rechercher un produit, une catégorie…"
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#0f172a] px-4 py-3 pl-12 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] shadow-sm"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          
          {loading && (
            <Loader2 className="absolute right-16 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-600" />
          )}
          
          <button
            type="button"
            onClick={startListening}
            disabled={isListening}
            className={`absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
              isListening ? 'text-red-500 bg-red-100 dark:bg-red-900/30 animate-pulse' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            }`}
            title="Recherche vocale"
          >
            <Mic className="h-4 w-4" />
          </button>
          
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-medium text-white shadow-md hover:shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Rechercher
        </button>
      </form>

      {/* Liste des suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e293b] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 max-h-96 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.product_id}
              onClick={() => handleSuggestionClick(suggestion.product_id)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#334155] transition-colors border-b last:border-b-0 border-gray-100 dark:border-gray-700"
            >
              {suggestion.images && suggestion.images[0] && (
                <img src={suggestion.images[0]} alt={suggestion.nom} className="h-10 w-10 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{suggestion.nom}</p>
                {suggestion.prix && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{suggestion.prix.toLocaleString()} FC</p>
                )}
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">
                {Math.round(suggestion.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}