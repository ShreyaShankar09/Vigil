import { expect, test, type Page, type Route } from '@playwright/test'

const officer = {
  officer_id: 'OFF-271',
  name: 'Test Officer',
  role: 'field_officer',
  zone: 'Zone A',
  must_change_password: false,
  language: 'en',
}

async function reply(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  })
}

async function installApi(page: Page, initialPath = '/login') {
  const session = { active: false, refreshExpired: false, loginFailures: 0 }
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const authorization = request.headers().authorization

    if (path === '/me') {
      if (session.active && authorization?.startsWith('Bearer ')) {
        await reply(route, 200, officer)
      } else {
        await reply(route, 401, { detail: 'Unauthorized' })
      }
      return
    }

    if (path === '/auth/refresh') {
      if (session.active && !session.refreshExpired) {
        await reply(route, 200, { token: 'refreshed-access-token' })
      } else {
        await reply(route, 401, { detail: 'Invalid refresh token' })
      }
      return
    }

    if (path === '/auth/login') {
      const requestBody = JSON.parse(request.postData() ?? '{}') as { officer_id?: string; password?: string }
      if (requestBody.officer_id === officer.officer_id && requestBody.password === 'Correct-Horse-9') {
        session.active = true
        session.refreshExpired = false
        await reply(route, 200, { token: 'initial-access-token', ...officer })
      } else {
        session.loginFailures += 1
        if (session.loginFailures > 5) {
          await reply(route, 429, { detail: 'Too many failed attempts' }, { 'Retry-After': '8' })
        } else {
          await reply(route, 401, { detail: 'Bad credentials' })
        }
      }
      return
    }

    if (path === '/auth/logout') {
      session.active = false
      await reply(route, 200, { ok: true })
      return
    }

    await reply(route, 404, { detail: 'Not found' })
  })

  await page.goto(initialPath)
  await expect(page.getByLabel('Officer ID')).toBeVisible()
  return session
}

test('the app root starts at the sign-in page', async ({ page }) => {
  await installApi(page, '/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('sign-in remains usable at a 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await installApi(page)
  await expect(page.getByLabel('Officer ID')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
  await expect(page.locator('form button[type="submit"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

async function signIn(page: Page, password: string) {
  await page.locator('#officer-id').fill(officer.officer_id)
  await page.locator('#password').fill(password)
  await page.locator('form button[type="submit"]').click()
}

test('wrong password shows an accessible error', async ({ page }) => {
  await installApi(page)
  await signIn(page, 'incorrect-password')
  await expect(page.getByText('Officer ID or password is incorrect.')).toBeVisible()
  await expect(page.locator('#password')).toHaveValue('')
})

test('locks out after five failed attempts and uses Retry-After', async ({ page }) => {
  await installApi(page)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await signIn(page, 'incorrect-password')
    await expect(page.getByText('Officer ID or password is incorrect.')).toBeVisible()
  }
  await signIn(page, 'incorrect-password')
  await expect(page.getByText('Too many failed sign-in attempts.')).toBeVisible()
  await expect(page.locator('[aria-live="off"]')).toContainText(/Try again in \d+ seconds\./)
  await expect(page.locator('form button[type="submit"]')).toBeDisabled()
})

test('successful sign-in opens the role dashboard', async ({ page }) => {
  await installApi(page)
  await signIn(page, 'Correct-Horse-9')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Good morning, Test/ })).toBeVisible()
})

test('reload restores the session through the refresh cookie flow', async ({ page }) => {
  await installApi(page)
  await signIn(page, 'Correct-Horse-9')
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Good morning, Test/ })).toBeVisible()
})

test('expired refresh returns the user to sign-in with a localized expiry message', async ({ page }) => {
  const session = await installApi(page)
  await signIn(page, 'Correct-Horse-9')
  await expect(page).toHaveURL(/\/dashboard$/)
  session.refreshExpired = true
  await page.reload()
  await expect(page).toHaveURL(/\/login\?reason=expired$/)
  await expect(page.getByText('Your session expired. Sign in again to continue.')).toBeVisible()
})

test('logout clears the session and stays signed out after reload', async ({ page }) => {
  await installApi(page)
  await signIn(page, 'Correct-Horse-9')
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('language selection on sign-in persists after login and reload', async ({ page }) => {
  await installApi(page)
  await page.locator('select').selectOption('hi')
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await signIn(page, 'Correct-Horse-9')
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
})

test('Urdu renders the sign-in flow right-to-left', async ({ page }) => {
  await installApi(page)
  await page.locator('select').selectOption('ur')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: 'سائن اِن کریں' })).toBeVisible()
})
