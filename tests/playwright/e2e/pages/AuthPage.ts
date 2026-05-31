import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

export class AuthPage {
  readonly page: Page
  readonly identifierInput: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly confirmPasswordInput: Locator
  readonly usernameInput: Locator
  readonly loginSubmitButton: Locator
  readonly registerSubmitButton: Locator
  readonly loginHeading: Locator

  constructor(page: Page) {
    this.page = page
    // Prefer stable form field names over visible labels (labels can be localized).
    this.identifierInput = page.locator('input[name="login"], input[name="email"]').first()
    this.emailInput = page.locator('input[name="email"]').first()
    this.passwordInput = page.locator('input[name="password"]').first()
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]').first()
    this.usernameInput = page.locator('input[name="username"]').first()
    this.loginSubmitButton = page
      .locator('form')
      .filter({ has: this.identifierInput })
      .locator('button[type="submit"]')
      .first()
    this.registerSubmitButton = page
      .locator('form')
      .filter({ has: this.usernameInput })
      .locator('button[type="submit"]')
      .first()
    this.loginHeading = page.getByRole('heading', { name: /log in|login|logga in/i })
  }

  async gotoLogin() {
    await this.page.goto('/login')
    await expect(this.identifierInput).toBeVisible()
  }

  async gotoRegister() {
    await this.page.goto('/create-account')
    await expect(this.usernameInput).toBeVisible()
  }

  async login(identifier: string, password: string = 'password123') {
    await this.gotoLogin()
    await this.identifierInput.fill(identifier)
    await this.passwordInput.fill(password)
    await this.loginSubmitButton.click()
  }

  async register(username: string, email: string, password: string = 'password123') {
    await this.gotoRegister()
    await this.usernameInput.fill(username)
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.confirmPasswordInput.fill(password)
    await this.registerSubmitButton.click()
  }
}
