// features/admin/index.ts
/**
 * Point d'entrée central pour le module d'administration.
 * Exporte tous les composants, hooks et services disponibles.
 * Version ultra‑premium – à jour avec tous les enrichissements de l'étape 7.
 */

// ---------------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------------
export { default as AdminProductForm } from './components/AdminProductForm'

// ---------------------------------------------------------------------------
// Services – Produits
// ---------------------------------------------------------------------------
export {
  getServerProductList,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getProductBySku,
  searchProducts,
  duplicateProduct,
  toggleProductActive,
  bulkDeleteProducts,
  bulkUpdateProducts,
  adjustStock,
  getProductStats,
  exportProductsCSV,
} from './services/adminProductService'

// ---------------------------------------------------------------------------
// Services – Commandes
// ---------------------------------------------------------------------------
export {
  getOrders,
  getOrderById,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  deleteOrder,
  cancelOrder,
  searchOrders,
  getOrdersByUser,
  getOrderStats,
  getRecentOrders,
  exportOrdersCSV,
  assignLivreur,
  updateShippingAddress,
  getOrderTimeline,
} from './services/adminOrderService'

// ---------------------------------------------------------------------------
// Services – Portefeuille
// ---------------------------------------------------------------------------
export {
  getWalletBalance,
  getWalletBalances,
  getRecentWalletTransactions,
  getUserBalance,
  adjustCentralWallet,
  getWalletMonthlyStats,
  exportWalletTransactionsCSV,
} from './services/adminWalletService'

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export { useAdminStats } from './hooks/useAdminStats'
export { useAdminOrders } from './hooks/useAdminOrders'