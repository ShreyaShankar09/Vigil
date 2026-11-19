import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, MapPin, WifiOff } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { useAppData } from '@/lib/store'
import { Button } from '@/components/ui/Button'
import { CameraScanner } from '@/components/evidence/CameraScanner'
import { ResultCard } from '@/components/evidence/ResultCard'
import { CalibrationPanel } from '@/components/evidence/CalibrationPanel'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { ApiError, analyzeImage, apiHealthz, apiListKits } from '@/lib/api'
import { appendCustodyEvent, sha256Hex } from '@/lib/custody'
import { captureGps } from '@/lib/gps'
import { imageBlobType } from '@/lib/image-bytes'
import { applyAnalysisResult, newEvidenceId } from '@/lib/evidence-data'
import { getCachedKits, putOutbox, saveKits, type OutboxItem } from '@/lib/outbox'
import { processEvidenceOutbox } from '@/lib/sync-worker'
import { translateAnalysisNotice } from '@/lib/analysis-notices'
import { useOnlineStatus } from '@/lib/use-online'
import type { AnalyzeResponse, EvidenceRecord, KitInfo } from '@/types'
import { cn, formatNumber } from '@/lib/utils'
import { localizeBackendCode } from '@/lib/localize-code'

type Step = 'identify' | 'capture' | 'review'
const stepOrder: Step[] = ['identify', 'capture', 'review']

export default function NewTest() {
  const { state: authState, signOut } = useAuth()
  const { outbox } = useAppData()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const [step, setStep] = useState<Step>('identify')
  const [caseId, setCaseId] = useState('')
  const [sampleType, setSampleType] = useState('')
  const [kits, setKits] = useState<KitInfo[]>([])
  const [kitId, setKitId] = useState('')
  const [kitsError, setKitsError] = useState(false)
  const [reagentAddedAt, setReagentAddedAt] = useState<number | null>(null)
  const [secondsSinceReagent, setSecondsSinceReagent] = useState<number | null>(null)
  const [current, setCurrent] = useState<OutboxItem | null>(null)
  const [analysisDetails, setAnalysisDetails] = useState<AnalyzeResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const remote = await apiListKits()
        await saveKits(remote)
        if (active) {
          setKits(remote)
          setKitId((currentKit) => currentKit || remote[0]?.id || '')
          setKitsError(false)
        }
      } catch {
        const cached = await getCachedKits()
        if (active) {
          setKits(cached)
          setKitId((currentKit) => currentKit || cached[0]?.id || '')
          setKitsError(cached.length === 0)
        }
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (reagentAddedAt === null) return
    const update = () => setSecondsSinceReagent(Math.max(0, Math.floor((Date.now() - reagentAddedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [reagentAddedAt])

  useEffect(() => {
    if (!current) return
    const updated = outbox.find((item) => item.id === current.id)
    if (updated && updated.updatedAt !== current.updatedAt) setCurrent(updated)
  }, [current, outbox])

  if (authState.status !== 'authed') return null
  const stepIndex = stepOrder.indexOf(step)

  const runAnalysis = async (item: OutboxItem) => {
    if (!navigator.onLine || !(await apiHealthz())) {
      setNotice(t('capture.offlineNotice'))
      return
    }
    setBusy(true)
    setErrorCode(null)
    setNotice(null)
    try {
      const result = await analyzeImage(item.imageBlob, item.record.testKitId, item.record.secondsSinceReagent)
      setAnalysisDetails(result)
      const record = applyAnalysisResult(item.record, result)
      const custodyChain = await appendCustodyEvent(item.custodyChain, {
        label: 'Automated Analysis Completed',
        timestamp: new Date().toISOString(),
        actor: record.modelVersion ?? 'Analysis service',
        location: record.location,
        gpsVerified: record.gpsVerified,
      })
      const updated = { ...item, record, custodyChain, updatedAt: new Date().toISOString() }
      await putOutbox(updated)
      setCurrent(updated)
      setNotice(null)
      void processEvidenceOutbox()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) void signOut()
      if (error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 401) {
        const failed: OutboxItem = {
          ...item,
          record: { ...item.record, analysisStatus: 'failed', syncStatus: 'failed' },
          syncState: 'failed',
          attempts: item.attempts + 1,
          lastError: error.code ?? 'ANALYSIS_FAILED',
          updatedAt: new Date().toISOString(),
          nextAttemptAt: 0,
        }
        await putOutbox(failed)
        setCurrent(failed)
      }
      setErrorCode(error instanceof ApiError ? error.code ?? 'SERVER_UNAVAILABLE' : 'SERVER_UNAVAILABLE')
    } finally {
      setBusy(false)
    }
  }

  const handleCaptured = async (source: Blob | null) => {
    if (!source) {
      setErrorCode('CAPTURE_FAILED')
      return
    }
    setBusy(true)
    setErrorCode(null)
    setNotice(null)
    try {
      const imageType = await imageBlobType(source)
      if (!imageType) {
        setErrorCode(source.size > 8 * 1024 * 1024 ? 'IMAGE_TOO_LARGE' : 'UNSUPPORTED_IMAGE_TYPE')
        return
      }
      const imageBlob = source.type === imageType ? source : source.slice(0, source.size, imageType)
      const [sha256, gps] = await Promise.all([
        sha256Hex(await imageBlob.arrayBuffer()),
        captureGps(),
      ])
      const timestamp = new Date().toISOString()
      const id = newEvidenceId()
      const actor = authState.user.name
      const location = gps.gpsVerified && gps.lat !== null && gps.lng !== null
        ? `${formatNumber(gps.lat, 5)}, ${formatNumber(gps.lng, 5)}`
        : ''
      const record: EvidenceRecord = {
        id,
        caseId: caseId.trim(),
        officerId: authState.user.officerId,
        officerName: actor,
        testKitId: kitId,
        sampleType: sampleType.trim(),
        verdict: null,
        substance: null,
        confidence: null,
        reactionColor: null,
        imageQuality: null,
        modelVersion: null,
        timestamp,
        location,
        lat: gps.lat,
        lng: gps.lng,
        gpsVerified: gps.gpsVerified,
        gpsAccuracyM: gps.accuracyM,
        analysisStatus: 'awaiting_analysis',
        secondsSinceReagent,
        deviceId: navigator.userAgent.slice(0, 40) || 'unavailable',
        sha256,
        syncStatus: 'pending',
        custody: [],
      }
      const custodyChain = await appendCustodyEvent([], {
        label: 'Evidence Captured',
        timestamp,
        actor,
        location,
        gpsVerified: gps.gpsVerified,
      })
      const item: OutboxItem = {
        id,
        record: { ...record, custody: [{
          id: `${id}-0`, label: 'Evidence Captured', timestamp, actor, location,
          gpsVerified: gps.gpsVerified, hashVerified: true,
        }] },
        imageBlob,
        custodyChain,
        syncState: 'pending',
        attempts: 0,
        lastError: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncedAt: null,
        nextAttemptAt: 0,
      }
      await putOutbox(item)
      setCurrent(item)
      setAnalysisDetails(null)
      setStep('review')
      if (!gps.gpsVerified) setNotice(t('capture.gpsUnavailable'))
      await runAnalysis(item)
    } catch {
      setErrorCode('CAPTURE_FAILED')
    } finally {
      setBusy(false)
    }
  }

  const record = current?.record
  const kit = kits.find((entry) => entry.id === kitId)

  return (
    <AppShell title={t('nav.startTest')} subtitle={<bdi dir="ltr" className="font-mono">{authState.user.officerId}</bdi>}>
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center gap-1.5" aria-label={t('test.capture.progress')}>
          {stepOrder.map((item, index) => (
            <div key={item} className="flex flex-1 items-center gap-1.5">
              <div className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                index < stepIndex ? 'bg-verified-500 text-white' : index === stepIndex ? 'bg-evidence-500 text-white' : 'bg-ink-600 text-mist-700',
              )}>
                {index < stepIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              {index < stepOrder.length - 1 && <div className={cn('h-0.5 flex-1', index < stepIndex ? 'bg-verified-500' : 'bg-ink-600')} />}
            </div>
          ))}
        </div>

        {step === 'identify' && (
          <div className="space-y-4 rounded-xl border border-line-800 bg-ink-800 p-5">
            <Field label={t('evidence.caseId')}>
              <input value={caseId} onChange={(event) => setCaseId(event.target.value)} className={inputClass} required />
            </Field>
            <Field label={t('test.capture.sampleType')}>
              <input value={sampleType} onChange={(event) => setSampleType(event.target.value)} className={inputClass} required />
            </Field>
            <Field label={t('test.capture.kit')}>
              <select value={kitId} onChange={(event) => setKitId(event.target.value)} className={inputClass} disabled={kits.length === 0} required>
                {kits.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} — {entry.reagent}</option>)}
              </select>
            </Field>
            {kitsError && <p role="alert" className="text-sm text-caution-400">{t('capture.kitsUnavailable')}</p>}
            {kit && <p className="text-xs text-mist-500">{kit.chart_verified ? '' : t('capture.chartUnverified')}</p>}
            {reagentAddedAt === null ? (
              <Button variant="outline" className="w-full" onClick={() => setReagentAddedAt(Date.now())}>{t('capture.reagentAdded')}</Button>
            ) : (
              <p className="text-sm tabular text-mist-300">{t('capture.reagentTimer', { seconds: formatNumber(secondsSinceReagent ?? 0, 0) })}</p>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={!caseId.trim() || !sampleType.trim() || !kitId || kits.length === 0}
              onClick={() => setStep('capture')}
            >
              {t('test.capture.continue')}
            </Button>
          </div>
        )}

        {step === 'capture' && (
          <div className="space-y-4">
            <CameraScanner onCapture={(blob) => { void handleCaptured(blob) }} />
            {busy && <p role="status" className="text-center text-sm text-mist-400">{t('sync.healthChecking')}</p>}
            <Button variant="outline" onClick={() => setStep('identify')}>
              <ArrowLeft className="h-4 w-4" /> {t('test.capture.back')}
            </Button>
          </div>
        )}

        {step === 'review' && record && current && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line-800 bg-ink-800 p-4">
              <p dir="ltr" className="font-mono text-sm text-mist-100">{record.id}</p>
              <p dir="ltr" className="mt-1 break-all font-mono text-xs text-mist-400">{t('capture.hash')}: {record.sha256}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-mist-400">
                <MapPin className="h-3.5 w-3.5" />
                {record.gpsVerified
                  ? <><bdi dir="ltr" className="font-mono">{record.location}</bdi> · {t('capture.gpsAccuracy', { metres: formatNumber(record.gpsAccuracyM ?? 0) })}</>
                  : t('evidence.locationUnavailable')}
              </p>
              {record.analysisStatus === 'awaiting_analysis' && (
                <p className="mt-3 flex items-center gap-2 text-sm text-caution-400">
                  {!online && <WifiOff className="h-4 w-4" />}
                  {t('evidence.notYetAnalysed')} — {t('sync.waitingAnalysis')}
                </p>
              )}
              {record.analysisStatus === 'failed' && errorCode && (
                <p role="alert" className="mt-3 text-sm text-caution-400">{localizeBackendCode(errorCode, t)}</p>
              )}
              {notice && <p className="mt-3 text-xs text-caution-400">{notice}</p>}
              {errorCode && record.analysisStatus !== 'failed' && <p role="alert" className="mt-3 text-sm text-caution-400">{localizeBackendCode(errorCode, t)}</p>}
              {record.analysisStatus === 'awaiting_analysis' && online && (
                <Button className="mt-3" onClick={() => { void runAnalysis(current) }} disabled={busy}>
                  {t('capture.analyse')}
                </Button>
              )}
            </div>
            {record.verdict !== null && <ResultCard record={record} />}
            {analysisDetails && (
              <CalibrationPanel
                analysis={analysisDetails}
                loading={false}
                error={null}
                onRetry={() => { if (current) void runAnalysis(current) }}
              />
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {record.verdict === 'inconclusive' ? (
                <Button size="lg" className="flex-1" onClick={() => {
                  setStep('capture')
                  setCurrent(null)
                  setAnalysisDetails(null)
                  setErrorCode(null)
                  setNotice(null)
                }}>
                  {t('capture.retake')}
                </Button>
              ) : null}
              <Link to={`/evidence/${record.id}`} className="flex-1">
                <Button size="lg" variant={record.verdict === 'inconclusive' ? 'outline' : 'primary'} className="w-full">{t('evidence.openRecord')}</Button>
              </Link>
              <Button size="lg" variant="outline" onClick={() => {
                setStep('identify')
                setCurrent(null)
                setAnalysisDetails(null)
                setErrorCode(null)
                setNotice(null)
              }}>
                {t('capture.newTest')}
              </Button>
            </div>
            {record.inconclusiveReasons?.length ? (
              <ul className="list-inside list-disc text-xs text-caution-400">
                {record.inconclusiveReasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`}>{translateAnalysisNotice(reason, t)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const inputClass = 'w-full rounded-md border border-line-700 bg-ink-900 px-3 py-2.5 text-sm text-mist-100 outline-none focus:border-signal-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mist-500">{label}</span>
      {children}
    </label>
  )
}
