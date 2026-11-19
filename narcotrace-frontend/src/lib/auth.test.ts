import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiListOfficers, clearToken, getToken, setToken } from '@/lib/api'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('access token refresh coordination', () => {
  beforeEach(() => {
    clearToken()
  })

  it('shares one refresh for parallel 401 responses and retries both requests', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === '/auth/refresh') {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 0))
        return jsonResponse(200, { token: 'fresh-access-token' })
      }
      if (path === '/admin/officers') {
        const authorization = new Headers(init?.headers).get('Authorization')
        return authorization === 'Bearer fresh-access-token'
          ? jsonResponse(200, [])
          : jsonResponse(401, { detail: 'Expired' })
      }
      return jsonResponse(404, { detail: 'Not found' })
    })
    vi.stubGlobal('fetch', fetchMock)
    setToken('expired-access-token')

    await expect(Promise.all([apiListOfficers(), apiListOfficers()])).resolves.toEqual([[], []])
    expect(refreshCalls).toBe(1)
    expect(getToken()).toBe('fresh-access-token')
    expect(localStorage.getItem('narcotrace.token')).toBeNull()
    expect(sessionStorage.getItem('narcotrace.token')).toBeNull()
  })
})
