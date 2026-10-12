// e2e/purchase.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Purchase flow', () => {
  test('should add a product to cart and proceed to checkout', async ({ page }) => {
    // 1. Naviguer vers la page d'accueil
    await page.goto('/')

    // Attendre que les produits soient chargés (grille de produits)
    await page.waitForSelector('.card-hover', { timeout: 10000 })

    // 2. Cliquer sur le premier produit pour voir les détails
    const firstProduct = page.locator('.card-hover').first()
    await firstProduct.click()

    // Attendre la page produit
    await page.waitForURL(/\/produits\/.*/)

    // 3. Vérifier que le bouton "Ajouter au panier" est présent
    const addToCartButton = page.locator('button', { hasText: /Ajouter au panier/i })
    await expect(addToCartButton).toBeVisible()

    // 4. Ajouter au panier
    await addToCartButton.click()

    // Une notification de succès devrait apparaître
    await expect(page.locator('text=ajouté au panier')).toBeVisible({ timeout: 5000 })

    // 5. Aller vers le panier via la navbar
    await page.click('text=Panier') // ou un lien avec icône ShoppingBag

    // 6. Vérifier que le panier contient l'article
    await expect(page.locator('text=Mon panier')).toBeVisible()
    // L'article ajouté devrait apparaître (nom du produit)
    // On peut vérifier que le nombre d'articles est mis à jour

    // 7. Procéder à la commande
    await page.click('text=Passer la commande')

    // 8. La page de commande demande une connexion
    // Si l'utilisateur n'est pas connecté, on est redirigé vers la page de connexion
    await page.waitForURL(/\/login/)

    // On pourrait ici simuler une connexion (avec des identifiants de test) et continuer,
    // mais pour l'exemple, on s'arrête là.
  })
})
