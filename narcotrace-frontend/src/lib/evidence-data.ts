import type {
  AnalysisNotice,
  AnalysisSummary,
  AnalyzeResponse,
  EvidenceApiRecord,
  EvidenceRecord,
  ResultVerdict,
} from '@/types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNotices(value: unknown): AnalysisNotice[] {
  if (!Array.isArray(value)) return []
  return value.filter((notice): notice is AnalysisNotice =>
    isObject(notice) && typeof notice.code === 'string',
  )
}

function asAnalysis(value: unknown): AnalysisSummary | undefined {
  if (!isObject(value)) return undefined
  if (
    typeof value.modelStatus !== 'string'
    || typeof value.colourClass !== 'string'
    || typeof value.reagent !== 'string'
  ) return undefined
  return {
    modelStatus: value.modelStatus,
    colourClass: value.colourClass,
    probs: isObject(value.probs) ? value.probs as Record<string, number> : {},
    reagent: value.reagent,
    chartVerified: value.chartVerified === true,
    readWindowS: typeof value.readWindowS === 'number' ? value.readWindowS : null,
    cardFound: value.cardFound === true,
    exposure: typeof value.exposure === 'string' ? value.exposure : 'unknown',
    cast: typeof value.cast === 'string' ? value.cast : 'unknown',
    cctK: typeof value.cctK === 'number' ? value.cctK : null,
    deltaEBefore: typeof value.deltaEBefore === 'number' ? value.deltaEBefore : null,
    deltaEAfter: typeof value.deltaEAfter === 'number' ? value.deltaEAfter : null,
    warnings: asNotices(value.warnings),
  }
}

function imageQuality(analysis: AnalysisSummary | undefined): EvidenceRecord['imageQuality'] {
  if (!analysis) return null
  if (!analysis.cardFound || analysis.exposure === 'dark' || analysis.exposure === 'clipped') return 'Poor'
  const delta = analysis.deltaEAfter ?? 99
  if (analysis.exposure === 'ok' && delta < 8) return 'Excellent'
  return delta < 12 ? 'Good' : 'Fair'
}

export function applyAnalysisResult(record: EvidenceRecord, result: AnalyzeResponse): EvidenceRecord {
  const analysis: AnalysisSummary = {
    modelStatus: result.model.status,
    colourClass: result.colour_class,
    probs: result.probs,
    reagent: result.kit.reagent,
    chartVerified: result.kit.chart_verified,
    readWindowS: result.kit.read_window_s,
    cardFound: result.calibration.card_found,
    exposure: result.calibration.exposure,
    cast: result.calibration.cast,
    cctK: result.calibration.cct_k,
    deltaEBefore: result.calibration.delta_e_before,
    deltaEAfter: result.calibration.delta_e_after,
    warnings: result.warnings,
  }
  return {
    ...record,
    verdict: result.verdict,
    substance: result.substance,
    confidence: result.confidence,
    reactionColor: result.reaction_color,
    imageQuality: imageQuality(analysis),
    modelVersion: `${result.model.name} ${result.model.version}`,
    analysisStatus: 'complete',
    analysis,
    inconclusiveReasons: result.reasons,
  }
}

export function evidenceFromApi(api: EvidenceApiRecord): EvidenceRecord {
  const analysis = asAnalysis(api.extra.analysis)
  const gpsAccuracyM = typeof api.extra.gps_accuracy_m === 'number' ? api.extra.gps_accuracy_m : null
  const inconclusiveReasons = asNotices(api.extra.inconclusive_reasons)
  return {
    id: api.id,
    caseId: api.case_id,
    officerId: api.officer_id,
    officerName: typeof api.extra.officer_name === 'string' ? api.extra.officer_name : api.officer_id,
    testKitId: api.test_kit_id,
    sampleType: api.sample_type,
    verdict: api.verdict,
    substance: api.substance,
    confidence: api.confidence,
    reactionColor: api.reaction_color,
    imageQuality: imageQuality(analysis),
    modelVersion: api.model_version,
    timestamp: api.captured_at,
    location: api.location || '',
    lat: api.lat,
    lng: api.lng,
    gpsVerified: api.extra.gps_verified === true,
    gpsAccuracyM,
    temperatureC: api.temperature_c ?? undefined,
    lightingLux: api.lighting_lux ?? undefined,
    analysis,
    analysisStatus: 'complete',
    secondsSinceReagent: typeof api.extra.seconds_since_reagent === 'number' ? api.extra.seconds_since_reagent : null,
    deviceId: api.device_id,
    sha256: api.image_sha256,
    syncStatus: 'synced',
    custody: [],
    inconclusiveReasons,
  }
}

export function newEvidenceId(): string {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  return `NT-${new Date().getUTCFullYear()}-${suffix}`
}

export function verdictFrom(value: string): ResultVerdict {
  if (value === 'positive' || value === 'negative' || value === 'inconclusive') return value
  throw new Error(`Unknown evidence verdict: ${value}`)
}
