import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const API = 'http://localhost:8000'
const PASSWORD = 'E2E-Password-2026'
const projectRoot = resolve(process.cwd(), '..')

async function loginApi(request: APIRequestContext, officerId: string, password = PASSWORD) {
  const response = await request.post(`${API}/auth/login`, {
    data: { officer_id: officerId, password },
  })
  return { response, payload: await response.json() as { token?: string } }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('narcotrace.lang', 'en')
  })
})

async function signInPage(
  page: Page,
  officerId = 'OFF-E2E-001',
  password = PASSWORD,
  destination: RegExp = /\/dashboard$/,
) {
  await page.goto('/login')
  const select = page.locator('select').first()
  if (await select.isVisible()) {
    await select.selectOption('en')
  }
  await page.getByLabel('Officer ID').fill(officerId)
  await page.locator('#password').fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(destination)
}

async function appendFixtureCustody(request: APIRequestContext, evidenceId: string) {
  const { response, payload } = await loginApi(request, 'LAB-E2E-001')
  expect(response.status()).toBe(200)
  const appended = await request.post(`${API}/evidence/${evidenceId}/custody`, {
    headers: { Authorization: `Bearer ${payload.token}` },
    data: { label: 'Laboratory Received', actor: 'Client-supplied actor', location: 'Bengaluru FSL' },
  })
  expect(appended.status()).toBe(200)
}

async function uploadFixture(page: Page, file: string, caseId: string) {
  await page.goto('/test/new')
  await page.getByLabel('Case ID').fill(caseId)
  await page.getByLabel('Sample type').fill('powder')
  await expect(page.getByLabel('Test kit')).toBeVisible()
  await page.getByLabel('Test kit').selectOption('KIT-COC-04')
  const reagentButton = page.getByRole('button', { name: 'Reagent added' })
  if (await reagentButton.isVisible()) await reagentButton.click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('input[type="file"]').last().setInputFiles(
    resolve(projectRoot, 'narcotrace-synthetic-dataset', file),
  )
}

test('S1 real login: wrong password, five-failure lockout, and successful sign-in', async ({ page, request }) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await loginApi(request, 'OFF-E2E-LOCK', 'wrong-password-for-e2e')
    expect(failed.response.status()).toBe(401)
  }
  const locked = await loginApi(request, 'OFF-E2E-LOCK', 'wrong-password-for-e2e')
  expect(locked.response.status()).toBe(429)
  expect(Number(locked.response.headers()['retry-after'])).toBeGreaterThan(0)

  await page.goto('/login')
  await page.getByLabel('Officer ID').fill('OFF-E2E-001')
  await page.locator('#password').fill('wrong-password-for-e2e')
  await page.locator('form button[type="submit"]').click()
  await expect(page.getByText('Officer ID or password is incorrect.')).toBeVisible()
  await page.getByLabel('Officer ID').fill('OFF-E2E-001')
  await page.locator('#password').fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('S2 real synthetic fixtures produce all five decision outcomes and are listed as evidence', async ({ page }) => {
  await signInPage(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const fixtures = [
    { file: 'test/blue/SYN0000_00.jpg', caseId: 'E2E-POSITIVE', verdict: 'POSITIVE' },
    { file: 'test/no_reaction/SYN0000_05.jpg', caseId: 'E2E-NEGATIVE', verdict: 'NEGATIVE' },
    { file: 'test/orange_brown/SYN0000_03.jpg', caseId: 'E2E-WRONG-COLOUR', verdict: 'INCONCLUSIVE' },
    { file: 'test/unreadable/SYN0638_07.jpg', caseId: 'E2E-NO-CARD', verdict: 'INCONCLUSIVE' },
    { file: 'test/unreadable/SYN0711_07.jpg', caseId: 'E2E-DARK', verdict: 'INCONCLUSIVE' },
  ]

  for (const fixture of fixtures) {
    await uploadFixture(page, fixture.file, fixture.caseId)
    await expect(page.getByText(fixture.verdict, { exact: true })).toBeVisible({ timeout: 60_000 })
    if (fixture.verdict === 'INCONCLUSIVE') {
      await expect(page.getByRole('button', { name: 'Retake' })).toBeVisible()
    }
  }

  await page.goto('/evidence')
  for (const fixture of fixtures) {
    await expect(page.getByText(fixture.caseId, { exact: true })).toBeVisible({ timeout: 30_000 })
  }
})

test('S3 offline outbox syncs and a lab custody append verifies for the officer', async ({ page, request }) => {
  await signInPage(page)
  await page.goto('/test/new')
  await page.getByLabel('Case ID').fill('E2E-OFFLINE')
  await page.getByLabel('Sample type').fill('powder')
  await page.getByLabel('Test kit').selectOption('KIT-COC-04')
  await page.getByRole('button', { name: 'Reagent added' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.context().setOffline(true)
  await page.locator('input[type="file"]').last().setInputFiles(
    resolve(projectRoot, 'narcotrace-synthetic-dataset/test/blue/SYN0000_00.jpg'),
  )
  await expect(page.getByText('Not yet analysed')).toBeVisible()
  const evidenceId = (await page.getByText(/^NT-/).first().textContent())?.trim()
  expect(evidenceId).toBeTruthy()
  await page.getByRole('link', { name: 'Sync' }).click()
  await expect(page.getByText(evidenceId!, { exact: true })).toBeVisible()
  await expect(page.getByText('Pending sync')).toBeVisible()

  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 90_000 })
  const officer = await loginApi(request, 'OFF-E2E-001')
  const officerHeaders = { Authorization: `Bearer ${officer.payload.token}` }
  await expect.poll(async () => {
    const result = await request.get(`${API}/evidence/${encodeURIComponent(evidenceId!)}`, { headers: officerHeaders })
    return result.status()
  }, { timeout: 30_000 }).toBe(200)

  await appendFixtureCustody(request, evidenceId!)
  await page.goto(`/evidence/${encodeURIComponent(evidenceId!)}/custody`)
  await expect(page.getByText('Laboratory Received')).toBeVisible()
  await page.goto(`/evidence/${encodeURIComponent(evidenceId!)}`)
  await page.getByRole('button', { name: 'Verify integrity' }).click()
  await expect(page.getByText('Custody chain verified')).toBeVisible()
  await expect(page.getByText('Server image hash verified')).toBeVisible()
})

test('S4 direct database tampering fails verification and produces an admin alert', async ({ page, request }) => {
  const { response, payload } = await loginApi(request, 'OFF-E2E-001')
  expect(response.status()).toBe(200)
  const headers = { Authorization: `Bearer ${payload.token}` }
  const composeFile = resolve(projectRoot, 'docker-compose.yml')

  for (const [action, evidenceId] of [
    ['tamper-image', 'E2E-TAMPER-I'],
    ['tamper-custody', 'E2E-TAMPER-C'],
  ] as const) {
    execFileSync('docker', [
      'compose', '-f', composeFile, 'exec', '-T', '-e', 'E2E_MUTATIONS_ENABLED=1',
      'backend', 'python', '-m', 'app.e2e_tools', action, evidenceId,
    ], { cwd: projectRoot, stdio: 'pipe' })
    const verified = await request.get(`${API}/evidence/${evidenceId}/verify`, { headers })
    expect(verified.status()).toBe(200)
    const integrity = await verified.json() as { chain_ok: boolean; image_ok: boolean }
    if (action === 'tamper-image') expect(integrity.image_ok).toBe(false)
    else expect(integrity.chain_ok).toBe(false)
  }

  await signInPage(page, 'ZONAL-E2E-1', PASSWORD, /\/command$/)
  await page.goto('/alerts')
  await expect(page.getByText('Evidence integrity failure').first()).toBeVisible({ timeout: 30_000 })
})

test('S5 API object scopes, prosecutor release filter, and admin first-login password change', async ({ page, request }) => {
  const officer = await loginApi(request, 'OFF-E2E-001')
  const officerHeaders = { Authorization: `Bearer ${officer.payload.token}` }
  expect((await request.get(`${API}/evidence/E2E-OTHER-01`, { headers: officerHeaders })).status()).toBe(403)
  expect((await request.post(`${API}/evidence/E2E-OWN-0001/custody`, {
    headers: officerHeaders,
    data: { label: 'Not permitted', location: 'Bengaluru' },
  })).status()).toBe(403)
  await signInPage(page)
  await page.goto('/evidence/E2E-OTHER-01')
  await expect(page.getByText('No matching record', { exact: true })).toBeVisible()

  const prosecutor = await loginApi(request, 'PROS-E2E-01')
  const prosecutorHeaders = { Authorization: `Bearer ${prosecutor.payload.token}` }
  const released = await request.get(`${API}/evidence`, { headers: prosecutorHeaders })
  expect(released.status()).toBe(200)
  expect((await released.json() as { items: Array<{ id: string }> }).items.map((item) => item.id))
    .toContain('E2E-REL-0001')
  expect((await request.get(`${API}/evidence/E2E-OWN-0001`, { headers: prosecutorHeaders })).status()).toBe(403)

  const admin = await loginApi(request, 'ZONAL-E2E-1')
  const created = await request.post(`${API}/admin/officers`, {
    headers: { Authorization: `Bearer ${admin.payload.token}` },
    data: {
      officer_id: 'E2E-NEW-001',
      name: 'E2E Newly Provisioned',
      role: 'field_officer',
      zone: 'Bengaluru',
      password: 'Temporary-E2E-2026',
    },
  })
  expect(created.status()).toBe(201)
  expect((await created.json() as { must_change_password: boolean }).must_change_password).toBe(true)

  const profileLink = page.getByRole('link', { name: 'Profile' })
  if (await profileLink.isVisible()) {
    await profileLink.click()
  } else {
    await page.goto('/profile')
  }
  await page.getByRole('main').getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await signInPage(page, 'E2E-NEW-001', 'Temporary-E2E-2026', /\/change-password$/)
  await page.locator('#current-password').fill('Temporary-E2E-2026')
  await page.locator('#new-password').fill('Changed-E2E-Password-2026')
  await page.locator('#confirm-password').fill('Changed-E2E-Password-2026')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('S6 browser and server Form 6 PDFs include the evidence record and Indic PDF responses', async ({ page, request }) => {
  const auth = await loginApi(request, 'OFF-E2E-001')
  expect(auth.response.status()).toBe(200)
  const evidenceResponse = await request.get(`${API}/evidence/E2E-OWN-0001`, {
    headers: { Authorization: `Bearer ${auth.payload.token}` },
  })
  expect(evidenceResponse.status()).toBe(200)
  const evidence = await evidenceResponse.json() as { image_sha256: string; verdict: string }

  await signInPage(page)
  await page.goto('/evidence/E2E-OWN-0001')
  await expect(page.getByRole('main').getByText('E2E-OWN-0001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Generate Form 6' }).click()
  const form = page.locator('#form6-sheet')
  await expect(form).toContainText('E2E-OWN-0001')
  await expect(form).toContainText(evidence.image_sha256.slice(0, 32))
  await expect(form).toContainText(new RegExp(evidence.verdict, 'i'))
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  const downloadWait = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  expect((await downloadWait).suggestedFilename()).toContain('F6-E2E-OWN-0001')

  const headers = { Authorization: `Bearer ${auth.payload.token}` }
  for (const locale of ['kn', 'hi', 'ur']) {
    const pdf = await request.get(`${API}/evidence/E2E-OWN-0001/form6.pdf?lang=${locale}`, { headers })
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    const bytes = await pdf.body()
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
    expect(bytes.byteLength).toBeGreaterThan(10_000)
  }
})

test('S8 session expiry preserves a locally queued capture', async ({ page, request }) => {
  const admin = await loginApi(request, 'ZONAL-E2E-1')
  await signInPage(page)
  await page.goto('/test/new')
  await page.getByLabel('Case ID').fill('E2E-SESSION-EXPIRY')
  await page.getByLabel('Sample type').fill('powder')
  await page.getByLabel('Test kit').selectOption('KIT-COC-04')
  await page.getByRole('button', { name: 'Reagent added' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.context().setOffline(true)
  await page.locator('input[type="file"]').last().setInputFiles(
    resolve(projectRoot, 'narcotrace-synthetic-dataset/test/blue/SYN0000_00.jpg'),
  )
  await expect(page.getByText('Not yet analysed')).toBeVisible()
  const evidenceId = (await page.getByText(/^NT-/).first().textContent())?.trim()
  expect(evidenceId).toBeTruthy()

  const disabled = await request.patch(`${API}/admin/officers/OFF-E2E-001`, {
    headers: { Authorization: `Bearer ${admin.payload.token}` },
    data: { disabled: true },
  })
  expect(disabled.status()).toBe(200)
  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page).toHaveURL(/\/login\?reason=expired$/, { timeout: 30_000 })
  const queued = await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolveOpen, reject) => {
      const requestOpen = indexedDB.open('vigil-evidence')
      requestOpen.onsuccess = () => resolveOpen(requestOpen.result)
      requestOpen.onerror = () => reject(requestOpen.error)
    })
    const item = await new Promise<{ syncState: string; imageBlob: Blob }>((resolveGet, reject) => {
      const requestGet = database.transaction('outbox').objectStore('outbox').get(id as string)
      requestGet.onsuccess = () => resolveGet(requestGet.result as { syncState: string; imageBlob: Blob })
      requestGet.onerror = () => reject(requestGet.error)
    })
    database.close()
    return item ? { syncState: item.syncState, imageSize: item.imageBlob.size } : null
  }, evidenceId)
  expect(queued).not.toBeNull()
  expect(queued?.syncState).not.toBe('synced')
  expect(queued?.imageSize).toBeGreaterThan(0)

  await request.patch(`${API}/admin/officers/OFF-E2E-001`, {
    headers: { Authorization: `Bearer ${admin.payload.token}` },
    data: { disabled: false },
  })
})
