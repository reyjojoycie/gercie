import { Badge } from '@/components/ui/Badge'
import { Zap } from 'lucide-react'

export default function PromoBadge({ prixPromo }: { prixPromo: number }) {
  return (
    <Badge variant="accent" size="sm" className="bg-gradient-to-r from-amber-400 to-amber-600 text-white">
      <Zap size={12} className="mr-1" />
      {prixPromo.toLocaleString()} FC
    </Badge>
  )
}