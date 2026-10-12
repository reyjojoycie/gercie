'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search as SearchIcon, SlidersHorizontal, X, Sparkles, ChevronLeft, ChevronRight,
  Grid3x3, Folder, FolderOpen, ChevronRight as ChevronRightIcon, Image as ImageIcon
} from 'lucide-react';

import { Container } from '../../components/layout/Container';
import { ProductGrid } from '../../components/ProductGrid';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useSearch } from '@/hooks/useSearch';
import { categoryTree, getCategoryIconComponent, getCategoryByIdFast } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { ScrollToTop } from '@/components/ui/ScrollToTop';
import FilterToolbar from '../../components/product/FilterToolbar';
import React from 'react';

const RESULTS_PER_PAGE = 12;

function CategoryTreeItem({ node, selectedId, onSelect, depth = 0 }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const IconComponent = getCategoryIconComponent(node.id);

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) setIsOpen(!isOpen);
        }}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-lg transition-colors text-left",
          isSelected ? "bg-gold-500/10 text-gold-600 dark:text-gold-400 font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          isOpen ? <FolderOpen size={14} className="text-gold-500" /> : <Folder size={14} className="text-gray-400" />
        ) : (
          <IconComponent size={14} className="text-gray-400" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {hasChildren && (
          <ChevronRightIcon size={12} className={cn("transition-transform", isOpen && "rotate-90")} />
        )}
      </button>
      {hasChildren && isOpen && (
        <div className="mt-1">
          {node.children.map((child: any) => (
            <CategoryTreeItem key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryTreeFilter({ selectedId, onSelect }: any) {
  return (
    <div className="space-y-1 max-h-96 overflow-y-auto pr-2">
      <button
        onClick={() => onSelect('')}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-lg transition-colors text-left",
          !selectedId ? "bg-gold-500/10 text-gold-600 dark:text-gold-400 font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
      >
        <Grid3x3 size={14} />
        <span>Toutes les catégories</span>
      </button>
      {categoryTree.map((node) => (
        <CategoryTreeItem key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

// Composant dédié à l'affichage des résultats de recherche visuelle
function VisualSearchResults() {
  const router = useRouter();
  const [results, setResults] = useState<any[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState<string>('');

  useEffect(() => {
    const storedResults = sessionStorage.getItem('gercie-visual-results');
    const storedImage = sessionStorage.getItem('gercie-visual-image');
    const storedText = sessionStorage.getItem('gercie-visual-text');
    
    if (storedResults) setResults(JSON.parse(storedResults));
    if (storedImage) setImage(storedImage);
    if (storedText) setText(storedText);
  }, []);

  if (results.length === 0) {
    return (
      <div className="text-center py-20">
        <ImageIcon className="mx-auto mb-4 text-gray-400" size={48} />
        <p className="text-gray-500 mb-4">Aucun résultat visuel trouvé ou session expirée.</p>
        <Button onClick={() => router.push('/search')} variant="outline-gold">
          Retour à la recherche classique
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {image && (
        <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <img src={image} alt="Requête visuelle" className="w-24 h-24 object-cover rounded-lg border" />
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="text-purple-500" size={18} />
              Résultats pour cette image
            </h3>
            {text && <p className="text-sm text-gray-500 mt-1">Combiné avec le texte : "{text}"</p>}
          </div>
        </div>
      )}
      <ProductGrid products={results} viewMode="grid" animated />
    </div>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchMode = searchParams.get('mode');

  // Si le mode est 'visual', on affiche uniquement les résultats visuels
  if (searchMode === 'visual') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-16 z-30 backdrop-blur-xl bg-background/80 border-b border-border shadow-soft">
          <Container className="py-3">
            <div className="flex items-center gap-3">
              <ImageIcon size={20} className="text-purple-500" />
              <h1 className="text-lg font-semibold">Recherche par image</h1>
              <Button variant="ghost" size="sm" onClick={() => router.push('/search')} className="ml-auto">
                <X size={16} className="mr-1" /> Fermer
              </Button>
            </div>
          </Container>
        </div>
        <Container className="flex-1 py-6">
          <VisualSearchResults />
        </Container>
        <ScrollToTop variant="circle" showProgress />
      </div>
    );
  }

  // Sinon, mode recherche classique / Smart Search
  const urlQuery = searchParams.get('q') || '';
  const urlCategoryId = searchParams.get('categoryId') || '';
  const urlMinPrice = searchParams.get('minPrice') || '';
  const urlMaxPrice = searchParams.get('maxPrice') || '';
  const urlSortBy = (searchParams.get('sortBy') || 'pertinence') as 'prix' | 'created_at' | 'pertinence';
  const urlSortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
  const urlInStock = searchParams.get('inStock') === '1';
  const urlFreeShipping = searchParams.get('freeShipping') === '1';
  const urlExpress = searchParams.get('express') === '1';
  const urlMinDiscount = searchParams.get('minDiscount') || '';
  const urlMaxDiscount = searchParams.get('maxDiscount') || '';
  const urlDateFrom = searchParams.get('dateFrom') || '';
  const urlDateTo = searchParams.get('dateTo') || '';
  const urlVendor = searchParams.get('vendor') || '';
  const urlTags = searchParams.get('tags') ? searchParams.get('tags')!.split(',') : [];
  const urlSecondarySorts = searchParams.get('secondarySorts') ? searchParams.get('secondarySorts')!.split(',') : [];

  const [page, setPage] = useState(Number(searchParams.get('page') || '1'));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  const [compatibleProducts, setCompatibleProducts] = useState<any[]>([]);
  const [intents, setIntents] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('gercie_recent_searches');
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (urlQuery.trim()) {
      setRecentSearches(prev => {
        const updated = [urlQuery, ...prev.filter(s => s !== urlQuery)].slice(0, 8);
        sessionStorage.setItem('gercie_recent_searches', JSON.stringify(updated));
        return updated;
      });
    }
  }, [urlQuery]);

  const updateUrlParams = useCallback((updates: Record<string, string | string[] | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        params.delete(key);
      } else if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, value as string);
      }
    });
    if (!updates.hasOwnProperty('page')) {
      params.set('page', '1');
      setPage(1);
    }
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleSortChange = (sort: string) => {
    const [sortBy, order] = sort.split('-');
    updateUrlParams({ sortBy, sortOrder: order || 'desc' });
  };
  const handleViewModeChange = (mode: 'grid' | 'list') => setViewMode(mode);
  const handleMinPriceChange = (value: string) => updateUrlParams({ minPrice: value });
  const handleMaxPriceChange = (value: string) => updateUrlParams({ maxPrice: value });
  const handleCategoryChange = (value: string) => updateUrlParams({ categoryId: value });
  const handleInStockChange = (checked: boolean) => updateUrlParams({ inStock: checked ? '1' : undefined });
  const handleFreeShippingChange = (checked: boolean) => updateUrlParams({ freeShipping: checked ? '1' : undefined });
  const handleExpressChange = (checked: boolean) => updateUrlParams({ express: checked ? '1' : undefined });
  const handleMinDiscountChange = (value: string) => updateUrlParams({ minDiscount: value });
  const handleMaxDiscountChange = (value: string) => updateUrlParams({ maxDiscount: value });
  const handleDateFromChange = (value: string) => updateUrlParams({ dateFrom: value });
  const handleDateToChange = (value: string) => updateUrlParams({ dateTo: value });
  const handleVendorChange = (value: string) => updateUrlParams({ vendor: value });
  const handleTagsChange = (tags: string[]) => updateUrlParams({ tags: tags.length ? tags : undefined });
  const handleSecondarySortsChange = (sorts: string[]) => updateUrlParams({ secondarySorts: sorts.length ? sorts : undefined });
  const handleResetFilters = () => router.replace('/search', { scroll: false });
  const clearSearch = () => updateUrlParams({ q: undefined, page: undefined });

  const searchFilters = useMemo(() => {
    const categoryName = urlCategoryId ? getCategoryByIdFast(urlCategoryId)?.name : undefined;
    return {
      query: urlQuery,
      categoryPrefix: categoryName,
      minPrice: urlMinPrice ? Number(urlMinPrice) : undefined,
      maxPrice: urlMaxPrice ? Number(urlMaxPrice) : undefined,
      sortBy: urlSortBy,
      sortOrder: urlSortOrder,
      page,
      limit: RESULTS_PER_PAGE,
      inStock: urlInStock,
      freeShipping: urlFreeShipping,
      express: urlExpress,
      minDiscount: urlMinDiscount ? Number(urlMinDiscount) : undefined,
      maxDiscount: urlMaxDiscount ? Number(urlMaxDiscount) : undefined,
      dateFrom: urlDateFrom,
      dateTo: urlDateTo,
      vendor: urlVendor,
      tags: urlTags,
      secondarySorts: urlSecondarySorts,
    };
  }, [urlQuery, urlCategoryId, urlMinPrice, urlMaxPrice, urlSortBy, urlSortOrder, page, urlInStock, urlFreeShipping, urlExpress, urlMinDiscount, urlMaxDiscount, urlDateFrom, urlDateTo, urlVendor, urlTags, urlSecondarySorts]);

  const {
    results: textProducts,
    totalResults: textTotal,
    pagination: textPagination,
    facets,
    isLoading: textLoading,
    isFetching: textFetching,
    error: textError,
    refetch: textRefetch,
  } = useSearch(searchFilters);

  useEffect(() => {
    const fetchSmartExtras = async () => {
      if (!urlQuery.trim()) {
        setCompatibleProducts([]);
        setIntents([]);
        return;
      }
      try {
        const params = new URLSearchParams();
        params.set('q', urlQuery);
        params.set('mode', 'smart');
        params.set('limit', RESULTS_PER_PAGE.toString());
        
        const res = await fetch(`/api/search/advanced?${params.toString()}`);
        const data = await res.json();
        
        if (data.compatible) setCompatibleProducts(data.compatible);
        else setCompatibleProducts([]);
        
        if (data.intents) setIntents(data.intents);
        else setIntents([]);
      } catch (err) {
        setCompatibleProducts([]);
        setIntents([]);
      }
    };
    
    const timeoutId = setTimeout(fetchSmartExtras, 300);
    return () => clearTimeout(timeoutId);
  }, [urlQuery]);

  const products = textProducts;
  const totalResults = textTotal;
  const isLoading = textLoading;
  const isFetching = textFetching;
  const error = textError;
  const refetch = textRefetch;
  const totalPages = textPagination?.totalPages || 1;

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      updateUrlParams({ page: String(newPage) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-16 z-30 backdrop-blur-xl bg-background/80 border-b border-border shadow-soft">
        <Container className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchIcon size={20} className="text-gold-500" />
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {urlQuery ? (
                <>
                  Résultats pour « <strong>{urlQuery}</strong> »
                  <button onClick={clearSearch} className="text-muted-foreground hover:text-red-500">
                    <X size={16} />
                  </button>
                </>
              ) : (
                'Tous les produits'
              )}
              {totalResults > 0 && (
                <Badge variant="neutral" size="sm">{totalResults} produit{totalResults > 1 ? 's' : ''}</Badge>
              )}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline-gold"
                size="sm"
                className="md:hidden"
                onClick={() => setShowMobileFilters(true)}
              >
                <SlidersHorizontal size={16} className="mr-1" /> Filtres
              </Button>
            </div>
          </div>
          
          {intents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {intents.map((intent, idx) => (
                <Badge key={idx} variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                  <Sparkles size={12} className="mr-1" /> {intent}
                </Badge>
              ))}
            </div>
          )}
        </Container>
      </div>

      <Container className="flex-1 py-6">
        <div className="flex gap-6">
          <aside className="hidden md:block md:w-64 md:flex-shrink-0 space-y-4">
            <div className="bg-card rounded-2xl shadow-card border border-border p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Folder size={16} className="text-gold-500" /> Catégories
              </h3>
              <CategoryTreeFilter selectedId={urlCategoryId} onSelect={handleCategoryChange} />
            </div>
            
            <div className="bg-card rounded-2xl shadow-card border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">Recherches récentes</h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, idx) => (
                  <button
                    key={idx}
                    onClick={() => updateUrlParams({ q: term })}
                    className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gold-500/10 hover:text-gold-600 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <FilterToolbar
              sortBy={urlSortBy}
              sortOrder={urlSortOrder}
              onSortChange={handleSortChange}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              minPrice={urlMinPrice}
              maxPrice={urlMaxPrice}
              onMinPriceChange={handleMinPriceChange}
              onMaxPriceChange={handleMaxPriceChange}
              inStock={urlInStock}
              onInStockChange={handleInStockChange}
              freeShipping={urlFreeShipping}
              onFreeShippingChange={handleFreeShippingChange}
              express={urlExpress}
              onExpressChange={handleExpressChange}
            />

            <div className="mt-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={page + urlQuery + urlCategoryId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProductGrid
                    products={products}
                    loading={isLoading}
                    error={error ?? undefined}
                    onRetry={() => refetch()}
                    emptyState={{
                      title: 'Aucun produit trouvé',
                      description: 'Essayez avec d’autres mots‑clés ou parcourez le catalogue.',
                      actionLabel: 'Voir tout le catalogue',
                      onAction: handleResetFilters,
                    }}
                    viewMode={viewMode}
                    animated
                    onViewModeChange={handleViewModeChange}
                  />
                </motion.div>
              </AnimatePresence>

              {compatibleProducts.length > 0 && !isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-10"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-purple-500" size={20} />
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                      Suggestions & produits compatibles
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Accessoires et articles qui complètent parfaitement votre recherche.
                  </p>
                  <ProductGrid
                    products={compatibleProducts}
                    loading={false}
                    viewMode="grid"
                    animated
                  />
                </motion.div>
              )}

              {!isLoading && totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  <Button variant="outline-gold" size="icon" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
                    <ChevronLeft size={18} />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-2 text-muted-foreground">…</span>}
                        <button
                          onClick={() => handlePageChange(p)}
                          className={cn(
                            'min-w-[2.5rem] h-10 px-3 rounded-lg text-sm font-medium transition-all',
                            p === page
                              ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                              : 'text-muted-foreground hover:bg-gold-400/10'
                          )}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                  <Button variant="outline-gold" size="icon" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
                    <ChevronRight size={18} />
                  </Button>
                </div>
              )}
            </div>
          </main>
        </div>
      </Container>

      <AnimatePresence>
        {showMobileFilters && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-2xl md:hidden overflow-y-auto"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold">Filtres</h2>
              <button onClick={() => setShowMobileFilters(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-6">
              <CategoryTreeFilter selectedId={urlCategoryId} onSelect={(id: string) => { handleCategoryChange(id); setShowMobileFilters(false); }} />
              <Button variant="outline" className="w-full" onClick={handleResetFilters}>Réinitialiser les filtres</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollToTop variant="circle" showProgress />
    </div>
  );
}