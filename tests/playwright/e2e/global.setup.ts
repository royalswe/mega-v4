import { test as setup, expect } from '@playwright/test'
import { AuthPage } from './pages/AuthPage'
import path from 'path'
import fs from 'fs'

import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const authFile = path.join(__dirname, '../../playwright/.auth/user.json')

setup('authenticate', async ({ page }) => {
  // Ensure the auth directory exists
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const authPage = new AuthPage(page)
  const timestamp = Date.now()
  const email = `e2e-global-${timestamp}@example.com`
  const password = 'password123'
  const username = `globaluser${timestamp}`

  // Register a new user for the global session
  await authPage.register(username, email, password)

  // Wait for redirect to login or home/dashboard
  // The register method in AuthPage doesn't wait for URL, so we do it here or inside register if we updated it.
  // Existing test showed redirect to /login after register.
  await expect(page).toHaveURL(/login/)

  // Login
  await authPage.login(email, password)

  // Save storage state
  await page.context().storageState({ path: authFile })
})
