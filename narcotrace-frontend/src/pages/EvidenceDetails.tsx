import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck, MapPin, Thermometer, Sun, Smartphone, ArrowRight, FileX } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { VerdictBadge, SyncBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { useAppData } from '@/lib/store'
import { Form6Panel, GenerateForm6Button, newForm6 } from '@/components/evidence/Form6Panel'
import { formatDateTime, formatNumber } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { apiEvidenceImage, apiGetEvidence, apiVerifyEvidence, ApiError } from '@/lib/api'
import { evidenceFromApi } from '@/lib/evidence-data'
import { sha256Hex } from '@/lib/custody'
import { useOnlineStatus } from '@/lib/use-online'
import { localizeBackendCode } from '@/lib/localize-code'

export default function EvidenceDetails() {
  const { id } = useParams()
  const { state } = useAuth()
  const { outbox, getForm6, saveForm6 } = useAppData()
  const { t } = useI18n()
  const online = useOnlineStatus()
  const localItem = outbox.find((item) => item.id === id)
  const [remoteRecord, setRemoteRecord] = useState<ReturnType<typeof evidenceFromApi> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<{
    chain_ok: boolean
    image_ok: boolean
    local_image_ok: boolean | null
  } | null>(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    let active = true
    if (!id || !online || (localItem !== undefined && localItem.syncState !== 'synced')) {
      setRemoteRecord(null)
      return () => { active = false }
    }
    void apiGetEvidence(id)
      .then((response) => {
        if (active) {
          setRemoteRecord(evidenceFromApi(response))
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof ApiError ? error.code ?? 'EVIDENCE_READ_FAILED' : 'EVIDENCE_READ_FAILED')
      })
    return () => { active = false }
  }, [id, online, localItem])

  const record = useMemo(() => remoteRecord ?? localItem?.record, [remoteRecord, localItem])
  const form6 = id ? getForm6(id) : undefined

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!id || !record) return
    const imageRequest = localItem && localItem.syncState !== 'synced'
      ? Promise.resolve(localItem.imageBlob)
      : online
        ? apiEvidenceImage(id)
        : Promise.resolve(localItem?.imageBlob)
    void imageRequest.then((blob) => {
      if (!active || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setImageUrl(objectUrl)
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.code ?? 'EVIDENCE_IMAGE_FAILED' : 'EVIDENCE_IMAGE_FAILED')
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setImageUrl(null)
    }
  }, [id, record, localItem, online])

  if (state.status !== 'authed') return null
  if (!record) {
    return (
      <AppShell title={t('evidence.notFound')}>
        {loadError && <p role="alert" className="mb-3 text-sm text-caution-400">{localizeBackendCode(loadError, t)}</p>}
        <EmptyState icon={FileX} title={t('evidence.noMatchingRecord')} body={t('evidence.unavailableRecord')} />
      </AppShell>
    )
  }

  const verify = async () => {
    if (!id || !online || (localItem !== undefined && localItem.syncState !== 'synced')) return
    setVerifying(true)
    try {
      const serverResult = await apiVerifyEvidence(id)
      const localImageOk = localItem
        ? await sha256Hex(await localItem.imageBlob.arrayBuffer()) === localItem.record.sha256
        : null
      setVerifyResult({
        ...serverResult,
        local_image_ok: localImageOk,
      })
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.code ?? 'EVIDENCE_VERIFY_FAILED' : 'EVIDENCE_VERIFY_FAILED')
    } finally {
      setVerifying(false)
    }
  }

  const hasAnalysis = record.verdict !== null

  return (
    <AppShell
      title={<>{t('evidence.evidenceId')} <bdi dir="ltr" className="font-mono">{record.id}</bdi></>}
      subtitle={<>{t('evidence.caseId')} <bdi dir="ltr" className="font-mono">{record.caseId}</bdi></>}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {loadError && <p role="alert" className="text-sm text-caution-400">{localizeBackendCode(loadError, t)}</p>}
        <div className="flex items-center gap-2">
          {record.verdict ? <VerdictBadge verdict={record.verdict} /> : <span className="text-xs text-caution-400">{t('evidence.notYetAnalysed')}</span>}
          <SyncBadge status={record.syncStatus} />
        </div>
        {!hasAnalysis && <p className="rounded-md border border-caution-500/30 p-3 text-sm text-caution-400">{t('sync.waitingAnalysis')}</p>}

        <Section title={t('evidence.testResult')}>
          {hasAnalysis && <p className="text-sm text-mist-300">{record.substance}</p>}
          <p className="mt-1 text-xs text-mist-700 tabular">{formatDateTime(record.timestamp)}</p>
        </Section>

        <Section title={t('evidence.caseInformation')}>
          <Grid>
            <Row label={t('evidence.caseId')} value={record.caseId} mono />
            <Row label={t('evidence.officerId')} value={<><bdi dir="ltr" className="font-mono">{record.officerId}</bdi> · {record.officerName}</>} />
            <Row label={t('evidence.testKitId')} value={record.testKitId} mono />
            <Row label={t('evidence.sampleId')} value={record.id} mono />
          </Grid>
        </Section>

        {hasAnalysis && (
          <Section title={t('evidence.aiAnalysis')}>
            <Grid>
              <Row label={t('evidence.classification')} value={record.verdict ? t(`result.${record.verdict}`) : ''} />
              <Row label={t('evidence.confidence')} value={record.confidence === null ? '' : `${formatNumber(record.confidence, 1)}%`} />
              <Row label={t('evidence.modelVersion')} value={record.modelVersion ?? ''} mono />
              {record.analysis && <Row label={t('evidence.modelStatus')} value={record.analysis.modelStatus} />}
              {record.analysis && <Row label={t('evidence.reactionSeen')} value={`${record.analysis.reagent} · ${record.reactionColor ?? ''}`} />}
              {record.analysis?.deltaEAfter != null && <Row label={t('evidence.calibrationError')} value={t('test.capture.deltaEAfter', { after: formatNumber(record.analysis.deltaEAfter, 1), before: record.analysis.deltaEBefore == null ? '—' : formatNumber(record.analysis.deltaEBefore, 1) })} />}
            </Grid>
          </Section>
        )}

        <Section title={t('evidence.environmentalData')}>
          <Grid>
            <Row
              label={t('evidence.gpsCoordinates')}
              value={record.lat !== null && record.lng !== null ? `${formatNumber(record.lat, 5)}, ${formatNumber(record.lng, 5)}` : t('evidence.locationUnavailable')}
              mono
              icon={MapPin}
            />
            {record.gpsAccuracyM !== null && <Row label={t('evidence.gpsAccuracy')} value={`${formatNumber(record.gpsAccuracyM)} m`} icon={MapPin} />}
            <Row label={t('evidence.location')} value={record.location || t('evidence.locationUnavailable')} />
            {record.temperatureC != null && <Row label={t('evidence.temperature')} value={`${formatNumber(record.temperatureC, 1)}°C`} icon={Thermometer} />}
            {record.lightingLux != null && <Row label={t('evidence.lighting')} value={`${formatNumber(record.lightingLux)} lux`} icon={Sun} />}
            {record.analysis && <Row label={t('evidence.captureLighting')} value={t(`analysis.exposure.${record.analysis.exposure === 'ok' ? 'good' : record.analysis.exposure}`)} icon={Sun} />}
            <Row label={t('evidence.device')} value={record.deviceId} mono icon={Smartphone} />
          </Grid>
        </Section>

        {imageUrl && <img src={imageUrl} alt={t('evidence.capturedPhoto')} className="max-h-96 w-full rounded-lg object-contain" />}

        <Section title={t('evidence.integrity')}>
          <p className="text-xs font-medium text-mist-500">{t('evidence.sha256')}</p>
          <p dir="ltr" className="mt-1 break-all rounded-md bg-ink-900/60 p-2.5 font-mono text-xs text-mist-300">{record.sha256}</p>
          {localItem && localItem.syncState !== 'synced' ? (
            <p className="mt-3 text-xs text-caution-400">{t('evidence.localPending')}</p>
          ) : (
            <>
              <Button className="mt-3" variant="outline" onClick={() => { void verify() }} disabled={verifying || !online}>
                <ShieldCheck className="h-4 w-4" /> {verifying ? t('evidence.verifying') : t('evidence.verifyIntegrity')}
              </Button>
              {verifyResult && (
                <div className="mt-3 space-y-1 text-sm">
                  <p className={verifyResult.chain_ok ? 'text-verified-400' : 'text-caution-400'}>
                    {verifyResult.chain_ok ? t('evidence.chainOk') : t('evidence.chainFailed')}
                  </p>
                  <p className={verifyResult.image_ok ? 'text-verified-400' : 'text-caution-400'}>
                    {verifyResult.image_ok ? t('evidence.imageOk') : t('evidence.imageFailed')}
                  </p>
                  {verifyResult.local_image_ok !== null && (
                    <p className={verifyResult.local_image_ok ? 'text-verified-400' : 'text-caution-400'}>
                      {verifyResult.local_image_ok ? t('evidence.localImageOk') : t('evidence.localImageFailed')}
                    </p>
                  )}
                  <p className="text-xs text-mist-500">{t('evidence.serverVerified')}</p>
                </div>
              )}
            </>
          )}
        </Section>

        <Link to={`/evidence/${record.id}/custody`}>
          <Button variant="secondary" size="lg" className="w-full">
            {t('evidence.viewCustody')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        {hasAnalysis && (
          <div className="mt-2">
            {form6 ? (
              <Form6Panel record={record} form={form6} onForm={saveForm6} onConfirm={saveForm6} />
            ) : (
              <GenerateForm6Button onClick={() => saveForm6(newForm6(record, state.user, t))} />
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-800 bg-ink-700/40 p-4">
      <p className="mb-2.5 text-sm font-semibold text-mist-100">{title}</p>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Row({ label, value, mono, icon: Icon }: { label: string; value: React.ReactNode; mono?: boolean; icon?: typeof MapPin }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-mist-700">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm font-medium text-mist-100 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
