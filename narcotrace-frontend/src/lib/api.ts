import type {
  AnalyzeResponse,
  EvidenceApiRecord,
  EvidenceRecord,
  HashedCustodyEvent,
  KitInfo,
} from '@/types'

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly retryAfter?: number

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

export class AuthError extends ApiError {
  constructor() {
    super('Authentication required', 401)
    this.name = 'AuthError'
  }
}

let accessToken: string | null = null
let refreshInFlight: Promise<string | null> | null = null
let authExpiredListener: (() => void) | null = null

export const getToken = () => accessToken
export const setToken = (token: string | null) => {
  accessToken = token
  if (token && typeof window !== 'undefined') window.dispatchEvent(new Event('vigil:token-set'))
}
export const clearToken = () => { accessToken = null }

export function getAccessTokenExpiry(): number | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const decoded: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof decoded !== 'object' || decoded === null || !('exp' in decoded) || typeof decoded.exp !== 'number') return null
    return decoded.exp * 1000
  } catch {
    return null
  }
}

export function clearLegacyAuthStorage() {
  try { localStorage.removeItem('vigil.auth.v1') } catch { /* storage unavailable */ }
  try { sessionStorage.removeItem('narcotrace.token') } catch { /* storage unavailable */ }
}

export function subscribeAuthExpired(listener: (() => void) | null) {
  authExpiredListener = listener
}

async function responseError(response: Response): Promise<ApiError> {
  let detail: unknown
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      detail = body.detail
    }
  } catch {
    detail = undefined
  }
  const code = typeof detail === 'object' && detail !== null && 'code' in detail
    ? String(detail.code)
    : typeof detail === 'string' && /^[A-Z0-9_]+$/.test(detail)
      ? detail
      : undefined
  const message = typeof detail === 'string' ? detail : code ?? `Server error (${response.status})`
  const retryHeader = response.headers.get('Retry-After')
  const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : undefined
  return new ApiError(message, response.status, code, Number.isFinite(retryAfter) ? retryAfter : undefined)
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('vigil:network-error'))
    throw new ApiError('Server unavailable', 0)
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await send('/auth/refresh', { method: 'POST' }, null)
      if (response.status === 401) return null
      if (!response.ok) throw await responseError(response)
      const payload: unknown = await response.json()
      if (
        typeof payload !== 'object'
        || payload === null
        || !('token' in payload)
        || typeof payload.token !== 'string'
      ) {
        throw new ApiError('Invalid refresh response', 502)
      }
      setToken(payload.token)
      return payload.token
    })().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const tokenUsed = getToken()
  let response = await send(path, init, tokenUsed)
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const tokenAfterParallelRefresh = getToken()
    let token: string | null
    try {
      token = tokenAfterParallelRefresh && tokenAfterParallelRefresh !== tokenUsed
        ? tokenAfterParallelRefresh
        : await refreshAccessToken()
    } catch {
      clearToken()
      authExpiredListener?.()
      throw new AuthError()
    }
    if (token) response = await send(path, init, token)
  }
  if (response.status === 401) {
    clearToken()
    authExpiredListener?.()
    throw new AuthError()
  }
  if (!response.ok) throw await responseError(response)
  return response
}

export type AuthRole = 'field_officer' | 'lab' | 'zonal_admin' | 'prosecutor'
export type AuthLanguage = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml' | 'mr' | 'bn' | 'gu' | 'pa' | 'or' | 'as' | 'ur'

export interface AuthUser {
  officerId: string
  name: string
  role: AuthRole
  zone: string
  mustChangePassword: boolean
  language: AuthLanguage
}

interface OfficerResponse {
  officer_id: string
  name: string
  role: AuthUser['role']
  zone: string
  must_change_password: boolean
  language?: AuthLanguage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOfficerResponse(value: unknown): value is OfficerResponse {
  return isRecord(value)
    && typeof value.officer_id === 'string'
    && typeof value.name === 'string'
    && (value.role === 'field_officer' || value.role === 'lab' || value.role === 'zonal_admin' || value.role === 'prosecutor')
    && typeof value.zone === 'string'
    && typeof value.must_change_password === 'boolean'
    && (
      value.language === undefined
      || (typeof value.language === 'string' && ['en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'as', 'ur'].includes(value.language))
    )
}

function toAuthUser(payload: OfficerResponse): AuthUser {
  return {
    officerId: payload.officer_id,
    name: payload.name,
    role: payload.role,
    zone: payload.zone,
    mustChangePassword: payload.must_change_password,
    language: (payload.language && ['en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'as', 'ur'].includes(payload.language))
      ? payload.language
      : 'en',
  }
}

export async function apiLogin(officerId: string, password: string): Promise<AuthUser> {
  const response = await send('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officer_id: officerId, password }),
  }, null)
  if (!response.ok) throw await responseError(response)
  const payload: unknown = await response.json()
  if (!isRecord(payload) || typeof payload.token !== 'string' || !isOfficerResponse(payload)) {
    throw new ApiError('Invalid login response', 502)
  }
  setToken(payload.token)
  return toAuthUser(payload)
}

export async function apiMe(): Promise<AuthUser> {
  const response = await request('/me')
  const payload: unknown = await response.json()
  if (!isOfficerResponse(payload)) throw new ApiError('Invalid profile response', 502)
  return toAuthUser(payload)
}

export async function apiUpdateProfileLanguage(language: AuthLanguage): Promise<void> {
  await request('/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  })
}

export async function apiLogout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
  clearToken()
}

export interface ManagedOfficer {
  officer_id: string
  name: string
  role: AuthUser['role']
  zone: string
  is_disabled: boolean
  must_change_password: boolean
}

export interface OfficerCreate {
  officer_id: string
  name: string
  role: AuthUser['role']
  zone?: string
  password: string
}

export async function apiListOfficers(): Promise<ManagedOfficer[]> {
  return (await request('/admin/officers')).json()
}

export async function apiCreateOfficer(officer: OfficerCreate): Promise<ManagedOfficer> {
  return (await request('/admin/officers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(officer),
  })).json()
}

export async function apiUpdateOfficer(
  officerId: string,
  update: { disabled?: boolean; temporary_password?: string },
): Promise<ManagedOfficer> {
  return (await request(`/admin/officers/${encodeURIComponent(officerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })).json()
}

/** Captured image bytes + kit -> reference-card calibration -> colour CNN -> kit-specific verdict. */
export async function analyzeImage(blob: Blob, kitId: string, secondsSinceReagent: number | null): Promise<AnalyzeResponse> {
  const form = new FormData()
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  form.append('file', blob, `capture.${extension}`)
  form.append('kit_id', kitId)
  if (secondsSinceReagent !== null) form.append('seconds_since_reagent', String(secondsSinceReagent))
  return (await request('/analyze', { method: 'POST', body: form })).json()
}

export async function apiListKits(): Promise<KitInfo[]> {
  return request('/kits').then((response) => response.json())
}

export interface EvidenceListResponse {
  items: EvidenceApiRecord[]
  total: number
  limit: number
  offset: number
}

export async function apiListEvidence(options: {
  verdict?: string
  caseId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
} = {}): Promise<EvidenceListResponse> {
  const query = new URLSearchParams()
  if (options.verdict) query.set('verdict', options.verdict)
  if (options.caseId) query.set('case_id', options.caseId)
  if (options.from) query.set('captured_from', options.from)
  if (options.to) query.set('captured_to', options.to)
  query.set('limit', String(options.limit ?? 100))
  query.set('offset', String(options.offset ?? 0))
  return request(`/evidence?${query.toString()}`).then((response) => response.json())
}

export async function apiGetEvidence(id: string): Promise<EvidenceApiRecord> {
  return request(`/evidence/${encodeURIComponent(id)}`).then((response) => response.json())
}

export interface ApiCustodyEvent {
  id: number
  seq: number
  payload: {
    label: string
    timestamp: string
    actor: string
    location: string
    gpsVerified: boolean
    [key: string]: unknown
  }
  prev_hash: string
  hash: string
}

export async function apiGetEvidenceCustody(id: string): Promise<{ events: ApiCustodyEvent[]; chain_ok: boolean; broken_at: number | null }> {
  return request(`/evidence/${encodeURIComponent(id)}/custody`).then((response) => response.json())
}

export async function apiVerifyEvidence(id: string): Promise<{ chain_ok: boolean; broken_at: number | null; image_ok: boolean }> {
  return request(`/evidence/${encodeURIComponent(id)}/verify`).then((response) => response.json())
}

export async function apiEvidenceImage(id: string): Promise<Blob> {
  return request(`/evidence/${encodeURIComponent(id)}/image`).then((response) => response.blob())
}

export async function apiSyncEvidence(
  record: EvidenceRecord,
  imageBlob: Blob,
  custody: HashedCustodyEvent[],
): Promise<'synced' | 'already_synced'> {
  if (
    record.verdict === null
    || record.substance === null
    || record.confidence === null
    || record.reactionColor === null
    || record.modelVersion === null
  ) {
    throw new ApiError('Evidence is missing its analysis result', 422, 'ANALYSIS_REQUIRED')
  }
  const bytes = new Uint8Array(await imageBlob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  const response = await request('/sync/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: record.id,
      case_id: record.caseId,
      test_kit_id: record.testKitId,
      sample_type: record.sampleType,
      verdict: record.verdict,
      substance: record.substance,
      confidence: record.confidence,
      reaction_color: record.reactionColor,
      model_version: record.modelVersion,
      captured_at: record.timestamp,
      lat: record.lat,
      lng: record.lng,
      location: record.location,
      device_id: record.deviceId,
      image_sha256: record.sha256,
      image_b64: btoa(binary),
      custody,
      extra: {
        analysis: record.analysis ?? null,
        analysis_status: record.analysisStatus,
        gps_verified: record.gpsVerified,
        gps_accuracy_m: record.gpsAccuracyM,
        seconds_since_reagent: record.secondsSinceReagent,
        inconclusive_reasons: record.inconclusiveReasons ?? [],
      },
    }),
  })
  const result: unknown = await response.json()
  if (typeof result !== 'object' || result === null || !('status' in result)) {
    throw new ApiError('Invalid evidence sync response', 502)
  }
  if (result.status !== 'synced' && result.status !== 'already_synced') {
    throw new ApiError('Unexpected evidence sync status', 502)
  }
  return result.status
}

export async function apiDashboardSummary(): Promise<{
  by_verdict: Record<string, number>
  hotspots: { lat: number; lng: number; n: number }[]
}> {
  return request('/dashboard/summary').then((response) => response.json())
}

export async function apiForm6Pdf(id: string, lang: string): Promise<Blob> {
  return request(`/evidence/${encodeURIComponent(id)}/form6.pdf?lang=${encodeURIComponent(lang)}`)
    .then((response) => response.blob())
}

export async function apiHealthz(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 4_000)
  try {
    const response = await fetch(`${API_URL}/healthz`, { signal: controller.signal, cache: 'no-store' })
    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}
