// e2e/login.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('should show validation errors for empty fields', async ({ page }) => {
    await page.goto('/login')

    // Cliquer sur le bouton sans rien saisir
    await page.click('button[type="submit"]')

    // Vérifier les messages d'erreur
    await expect(page.locator('text=Email invalide')).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    // Utiliser un compte de test créé via le seed ou Supabase local
    await page.goto('/login')

    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'testpassword')

    await page.click('button[type="submit"]')

    // Attendre la redirection vers la page d'accueil ou le tableau de bord
    await page.waitForURL(/\/$/)

    // Vérifier que le menu utilisateur est présent
    await expect(page.locator('text=Mon compte')).toBeVisible()
  })
})
