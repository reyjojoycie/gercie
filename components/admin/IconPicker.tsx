// components/admin/IconPicker.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Check, HelpCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

// Liste des icônes disponibles pour les statistiques
const AVAILABLE_ICONS = [
  'Users',
  'ShoppingBag',
  'Star',
  'Truck',
  'ShieldCheck',
  'RotateCcw',
  'MapPin',
  'Headphones',
  'Award',
  'BadgeCheck',
  'CreditCard',
  'Gift',
  'Heart',
  'ThumbsUp',
  'TrendingUp',
  'Clock',
  'Smile',
  'Globe',
  'Zap',
  'Package',
  'Wallet',
  'Building2',
  'Store',
  'Phone',
  'Mail',
];

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const SelectedIcon = (Icons as any)[value] || HelpCircle;

  const handleSelect = (iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background hover:bg-gold-400/5 transition-colors w-full"
      >
        <SelectedIcon size={18} className="text-gold-500" />
        <span className="flex-1 text-left text-sm">{value}</span>
        <ChevronDown size={14} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-2">
          <div className="grid grid-cols-4 gap-1">
            {AVAILABLE_ICONS.map((iconName) => {
              const Icon = (Icons as any)[iconName];
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => handleSelect(iconName)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg transition-colors',
                    value === iconName
                      ? 'bg-gold-500/20 text-gold-600'
                      : 'hover:bg-gold-400/10 text-muted-foreground'
                  )}
                >
                  <Icon size={20} />
                  <span className="text-[10px]">{iconName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}