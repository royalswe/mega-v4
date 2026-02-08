import { type Page, type Locator, expect } from '@playwright/test'

export class AuthPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly confirmPasswordInput: Locator
  readonly usernameInput: Locator
  readonly submitButton: Locator
  readonly loginHeading: Locator

  constructor(page: Page) {
    this.page = page
    // Selectors based on existing test findings
    this.emailInput = page.getByLabel('Email', { exact: false }) // Matches labels containing "Email" (e.g., "Email" or "Email or Username")
    this.passwordInput = page.getByLabel('Password', { exact: true })
    this.confirmPasswordInput = page.getByLabel('Confirm Password')
    this.usernameInput = page.getByLabel('Username')
    this.submitButton = page.getByRole('button', { name: /Log In|Create Account/i })
    this.loginHeading = page.getByRole('heading', { name: /Log In/i })
  }

  async gotoLogin() {
    await this.page.goto('/login')
  }

  async gotoRegister() {
    await this.page.goto('/create-account')
  }

  async login(email: string, password: string = 'password123') {
    await this.gotoLogin()
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
    // Wait for navigation or state change
    await expect(this.page).toHaveURL('/')
  }

  async register(username: string, email: string, password: string = 'password123') {
    await this.gotoRegister()
    await this.usernameInput.fill(username)
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.confirmPasswordInput.fill(password)
    await this.submitButton.click()
  }
}
