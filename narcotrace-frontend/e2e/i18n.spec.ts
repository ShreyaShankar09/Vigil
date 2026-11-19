import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const locales = [
  { code: 'en', family: 'Noto Sans', sample: 'Vigil' },
  { code: 'hi', family: 'Noto Sans Devanagari', sample: 'हिन्दी' },
  { code: 'kn', family: 'Noto Sans Kannada', sample: 'ಕನ್ನಡ' },
  { code: 'ta', family: 'Noto Sans Tamil', sample: 'தமிழ்' },
  { code: 'te', family: 'Noto Sans Telugu', sample: 'తెలుగు' },
  { code: 'ml', family: 'Noto Sans Malayalam', sample: 'മലയാളം' },
  { code: 'mr', family: 'Noto Sans Devanagari', sample: 'मराठी' },
  { code: 'bn', family: 'Noto Sans Bengali', sample: 'বাংলা' },
  { code: 'gu', family: 'Noto Sans Gujarati', sample: 'ગુજરાતી' },
  { code: 'pa', family: 'Noto Sans Gurmukhi', sample: 'ਪੰਜਾਬੀ' },
  { code: 'or', family: 'Noto Sans Oriya', sample: 'ଓଡ଼ିଆ' },
  { code: 'as', family: 'Noto Sans Bengali', sample: 'অসমীয়া' },
  { code: 'ur', family: 'Noto Nastaliq Urdu', sample: 'اردو', dir: 'rtl' },
] as const

async function signIn(page: Page) {
  await page.locator('#officer-id').fill('OFF-E2E-001')
  await page.locator('#password').fill('E2E-Password-2026')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

for (const locale of locales) {
  test(`login localization, font and accessibility: ${locale.code}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.addInitScript((code) => localStorage.setItem('narcotrace.lang', code), locale.code)
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code)
    await expect(page.locator('html')).toHaveAttribute('dir', 'dir' in locale ? locale.dir : 'ltr')
    await expect(page.locator('#officer-id')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()

    await expect.poll(() => page.evaluate(({ family }) =>
      document.documentElement.style.getPropertyValue('--font-sans').includes(family),
    locale)).toBe(true)
    const fontState = await page.evaluate(({ family, sample }) => ({
      computed: getComputedStyle(document.body).fontFamily,
      loaded: document.fonts.check(`16px "${family}"`, sample),
      tofu: document.body.innerText.includes('\uFFFD'),
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }), locale)
    expect(fontState.computed).toContain(locale.family)
    expect(fontState.loaded).toBe(true)
    expect(fontState.tofu).toBe(false)
    expect(fontState.width).toBeLessThanOrEqual(fontState.viewport)
    expect((await page.locator('body').innerText()).split('\n').some((line) => /^[a-z]+\.[a-z.]+$/.test(line.trim()))).toBe(false)

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${locale.code}.png`), fullPage: true })

    await signIn(page)
    for (const path of ['/dashboard', '/test/new', '/evidence', '/sync']) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale.code)
      const lines = (await page.locator('body').innerText()).split('\n').map((line) => line.trim())
      expect(lines.some((line) => /^[a-z]+\.[a-z.]+$/.test(line))).toBe(false)
      expect((await page.locator('body').innerText()).includes('\uFFFD')).toBe(false)
    }
  })
}

test('language switch persists through login and role pages have no raw translation keys', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('combobox', { name: /language/i }).selectOption('ur')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await signIn(page)

  for (const path of ['/dashboard', '/test/new', '/evidence', '/sync']) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur')
    const lines = (await page.locator('body').innerText()).split('\n').map((line) => line.trim())
    expect(lines.some((line) => /^[a-z]+\.[a-z.]+$/.test(line))).toBe(false)
    expect((await page.locator('body').innerText()).includes('\uFFFD')).toBe(false)
  }

  await page.getByRole('combobox', { name: /زبان|language/i }).selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})

test.afterEach(async ({ request }) => {
  const login = await request.post('http://localhost:8000/auth/login', {
    data: { officer_id: 'OFF-E2E-001', password: 'E2E-Password-2026' },
  })
  if (login.status() === 200) {
    const payload = (await login.json()) as { token?: string }
    if (payload.token) {
      await request.patch('http://localhost:8000/me', {
        headers: { Authorization: `Bearer ${payload.token}` },
        data: { language: 'en' },
      })
    }
  }
})

test('pseudo-locale is available for layout checks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('narcotrace.lang', 'en-XA'))
  await page.goto('/login')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA')
  await expect(page.locator('#officer-id')).toBeVisible()
})
