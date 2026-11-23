import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChainOfCustodyTimeline } from '@/components/evidence/ChainOfCustodyTimeline'
import type { CustodyEvent } from '@/types'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key === 'test.capture.analysisService' ? 'ವಿಶ್ಲೇಷಣಾ ಸೇವೆ' : key,
  }),
}))

const event = (id: string, actor: string): CustodyEvent => ({
  id,
  label: 'Automated Analysis Completed',
  timestamp: '2026-01-01T00:00:00Z',
  actor,
  location: '',
  gpsVerified: false,
  hashVerified: false,
})

describe('ChainOfCustodyTimeline', () => {
  it('localizes the analysis-service actor without changing model-version actors', () => {
    render(<ChainOfCustodyTimeline events={[
      event('service', 'Analysis service'),
      event('model', 'vigil-model-1'),
    ]} />)

    expect(screen.getByText('ವಿಶ್ಲೇಷಣಾ ಸೇವೆ ·')).toBeInTheDocument()
    expect(screen.getByText('vigil-model-1 ·')).toBeInTheDocument()
  })
})
