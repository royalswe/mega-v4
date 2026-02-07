import { test as setup, expect } from '@playwright/test'
import { AuthPage } from './pages/AuthPage'
import path from 'path'
import fs from 'fs'

import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const authFile = path.join(process.cwd(), '.auth/user.json')

setup('authenticate', async ({ page }) => {
  // Ensure the auth directory exists
  const authDir = path.dirname(authFile)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const authPage = new AuthPage(page)
  const email = process.env.EMAIL || 'admin@mail.com'
  const password = 'password123'
  const username = process.env.USERNAME || 'admin'

  console.log(`Attempting to authenticate as ${email}...`)

  // Try to login first
  await authPage.gotoLogin()
  await authPage.emailInput.fill(email)
  await authPage.passwordInput.fill(password)
  await authPage.submitButton.click()

  try {
    // Check if login was successful (redirected to home)
    // Short timeout because if it works it should be fast, if not we want to catch it
    await page.waitForURL('**/', { timeout: 5000, waitUntil: 'domcontentloaded' })
  } catch (e) {
    console.log('Login failed (user likely does not exist), trying to register...')
    // If login failed, we might still be on login page or got an error.
    // Proceed to register
    await authPage.register(username, email, password)

    // After register, checking where we are.
    // If it redirects to login, we need to login.
    // If it redirects to home, we are good.
    try {
      await expect(page).toHaveURL(/login|create-account/)
      // If we are still on login/create-account, try to login again (maybe register just created user but didn't auto-login)
      await authPage.login(email, password)
    } catch (e2) {
      // Assume we are on home
    }
  }

  // Save storage state
  await page.context().storageState({ path: authFile })
})
