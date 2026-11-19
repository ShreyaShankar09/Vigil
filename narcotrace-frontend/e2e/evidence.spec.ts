import { expect, test, type Page, type Route } from '@playwright/test'

const officer = {
  officer_id: 'OFF-271',
  name: 'Test Officer',
  role: 'field_officer',
  zone: 'Zone A',
  must_change_password: false,
  language: 'en',
}

const analysis = {
  verdict: 'negative',
  substance: 'No target substance detected',
  reaction_color: 'orange_brown',
  reasons: [],
  warnings: [],
  colour_class: 'orange_brown',
  confidence: 96,
  probs: { orange_brown: 0.96 },
  kit: { id: 'KIT-001', reagent: 'Reagent A', chart_verified: true, read_window_s: 300, note: '' },
  calibration: {
    card_found: true,
    exposure: 'ok',
    cast: 'neutral',
    cct_k: 5200,
    delta_e_before: 3,
    delta_e_after: 2,
    bbox: [10, 10, 50, 25],
  },
  images: { raw: '', calibrated: '' },
  model: { name: 'small_cnn', version: 'test', status: 'test' },
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=',
  'base64',
)

async function reply(route: Route, status: number, body: unknown, contentType = 'application/json') {
  await route.fulfill({
    status,
    contentType,
    body: contentType === 'application/json' ? JSON.stringify(body) : body as Buffer | string,
  })
}

async function installApi(page: Page) {
  const session = {
    active: false,
    healthAvailable: true,
    serverImageTampered: false,
    analysisIncludesReactionTime: false,
    syncIncludesReactionTime: false,
  }
  const evidence = new Map<string, Record<string, unknown>>()

  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const authorization = request.headers().authorization

    if (path === '/healthz') {
      await reply(route, session.healthAvailable ? 200 : 503, { status: session.healthAvailable ? 'ok' : 'unavailable' })
      return
    }
    if (path === '/me') {
      await reply(route, session.active && authorization?.startsWith('Bearer ') ? 200 : 401, session.active ? officer : { detail: 'Unauthorized' })
      return
    }
    if (path === '/auth/refresh') {
      await reply(route, session.active ? 200 : 401, session.active ? { token: 'refreshed-access-token' } : { detail: 'Unauthorized' })
      return
    }
    if (path === '/auth/login') {
      const body = JSON.parse(request.postData() ?? '{}') as { officer_id?: string; password?: string }
      if (body.officer_id === officer.officer_id && body.password === 'Correct-Horse-9') {
        session.active = true
        await reply(route, 200, { token: 'initial-access-token', ...officer })
      } else {
        await reply(route, 401, { detail: 'Bad credentials' })
      }
      return
    }
    if (path === '/auth/logout') {
      session.active = false
      await reply(route, 200, { ok: true })
      return
    }
    if (path === '/kits') {
      await reply(route, 200, [{ id: 'KIT-001', reagent: 'Reagent A', expected: [], chart_verified: true, read_window_s: 300 }])
      return
    }
    if (path === '/analyze') {
      session.analysisIncludesReactionTime = (request.postData() ?? '').includes('name="seconds_since_reagent"')
      await reply(route, 200, analysis)
      return
    }
    if (path === '/sync/evidence') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
      const extra = body.extra as Record<string, unknown> | undefined
      session.syncIncludesReactionTime = typeof extra?.seconds_since_reagent === 'number'
      const id = String(body.id)
      evidence.set(id, {
        id,
        case_id: body.case_id,
        officer_id: officer.officer_id,
        zone: officer.zone,
        test_kit_id: body.test_kit_id,
        sample_type: body.sample_type,
        verdict: body.verdict,
        substance: body.substance,
        confidence: body.confidence,
        reaction_color: body.reaction_color,
        model_version: body.model_version,
        captured_at: body.captured_at,
        lat: body.lat,
        lng: body.lng,
        location: body.location,
        temperature_c: null,
        lighting_lux: null,
        device_id: body.device_id,
        image_sha256: body.image_sha256,
        extra: body.extra,
        released: false,
        sync_state: 'synced',
      })
      await reply(route, 200, { status: 'synced' })
      return
    }
    if (path === '/evidence') {
      await reply(route, 200, { items: [...evidence.values()], total: evidence.size, limit: 100, offset: 0 })
      return
    }
    const detail = path.match(/^\/evidence\/([^/]+)$/)
    if (detail) {
      await reply(route, evidence.has(decodeURIComponent(detail[1])) ? 200 : 404, evidence.get(decodeURIComponent(detail[1])) ?? { detail: 'Not found' })
      return
    }
    if (/^\/evidence\/[^/]+\/verify$/.test(path)) {
      await reply(route, 200, { chain_ok: true, broken_at: null, image_ok: !session.serverImageTampered })
      return
    }
    if (/^\/evidence\/[^/]+\/image$/.test(path)) {
      await reply(route, 200, png, 'image/png')
      return
    }
    await reply(route, 404, { detail: 'Not found' })
  })

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, failure: ((error: { code: number; message: string }) => void) | undefined) => {
          failure?.({ code: 1, message: 'Permission denied' })
        },
      },
    })
  })
  await page.goto('/login')
  await page.getByLabel('Officer ID').fill(officer.officer_id)
  await page.locator('#password').fill('Correct-Horse-9')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  return session
}

test('offline capture persists, syncs on reconnect, and checks a tampered device copy', async ({ page }) => {
  const session = await installApi(page)
  await page.goto('/test/new')
  await expect(page.getByLabel('Test kit')).toBeVisible()
  await page.getByLabel('Case ID').fill('CASE-123')
  await page.getByLabel('Sample type').fill('powder')
  await page.getByRole('button', { name: 'Reagent added' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.context().setOffline(true)
  await page.locator('input[type="file"]').last().setInputFiles({
    name: 'capture.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText('Not yet analysed')).toBeVisible()
  await expect(page.getByText('Location unavailable')).toBeVisible()
  const evidenceId = (await page.getByText(/^NT-/).first().textContent())?.trim()
  expect(evidenceId).toBeTruthy()
  await page.getByRole('link', { name: 'Sync' }).click()
  await expect(page.getByText(evidenceId!)).toBeVisible()
  await expect(page.getByText('Pending sync')).toBeVisible()

  session.healthAvailable = false
  await page.context().setOffline(false)
  await page.reload()
  await expect(page).toHaveURL(/\/sync$/)
  await expect(page.getByText(evidenceId!)).toBeVisible()
  await expect(page.getByText('Pending sync')).toBeVisible()

  session.healthAvailable = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('vigil-evidence')
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    const state = await new Promise<string>((resolve, reject) => {
      const request = database.transaction('outbox').objectStore('outbox').get(id as string)
      request.onsuccess = () => resolve((request.result as { syncState: string }).syncState)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return state
  }, evidenceId), { timeout: 15_000 }).toBe('synced')
  expect(session.analysisIncludesReactionTime).toBe(true)
  expect(session.syncIncludesReactionTime).toBe(true)
  await page.goto(`/evidence/${encodeURIComponent(evidenceId!)}`)
  await expect(page.getByRole('button', { name: 'Verify integrity' })).toBeVisible()
  await page.getByRole('button', { name: 'Verify integrity' }).click()
  await expect(page.getByText('Custody chain verified')).toBeVisible()
  await expect(page.getByText('Server image hash verified')).toBeVisible()

  await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('vigil-evidence')
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    const tx = database.transaction('outbox', 'readwrite')
    const store = tx.objectStore('outbox')
    const item = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = store.get(id as string)
      request.onsuccess = () => resolve(request.result as Record<string, unknown>)
      request.onerror = () => reject(request.error)
    })
    item.imageBlob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/png' })
    store.put(item)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    database.close()
  }, evidenceId)
  session.serverImageTampered = true
  await page.reload()
  await page.getByRole('button', { name: 'Verify integrity' }).click()
  await expect(page.getByText('Server image hash verification failed')).toBeVisible()
  await expect(page.getByText('Device copy hash verification failed')).toBeVisible()
})
