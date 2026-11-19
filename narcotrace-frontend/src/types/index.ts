export type ResultVerdict = 'positive' | 'negative' | 'inconclusive'
export type SyncStatus = 'synced' | 'pending' | 'uploading' | 'failed'
export type AnalysisStatus = 'awaiting_analysis' | 'complete' | 'failed'

export interface CustodyEvent {
  id: string
  label: string
  timestamp: string
  actor: string
  location: string
  gpsVerified: boolean
  hashVerified: boolean
}

export interface HashedCustodyEvent {
  payload: {
    label: string
    timestamp: string
    actor: string
    location: string
    gpsVerified: boolean
  }
  prev_hash: string
  hash: string
}

export interface AnalyzeResponse {
  verdict: ResultVerdict
  substance: string
  reaction_color: string
  reasons: AnalysisNotice[]
  warnings: AnalysisNotice[]
  colour_class: string
  confidence: number // 0-100, softmax probability of the predicted colour class
  probs: Record<string, number>
  kit: { id: string; reagent: string; chart_verified: boolean; read_window_s: number | null; note: string }
  calibration: {
    card_found: boolean
    exposure: 'ok' | 'dim' | 'bright' | 'dark' | 'clipped' | 'unknown'
    cast: 'warm' | 'neutral' | 'cool' | 'unknown'
    cct_k: number | null
    delta_e_before: number | null
    delta_e_after: number | null
    bbox: [number, number, number, number] | null // x,y,w,h on a 224px square
  }
  images: { raw: string; calibrated: string }
  model: { name: string; version: string; status: string }
}

export interface AnalysisNotice {
  code: string
  [parameter: string]: string | number | boolean
}

/** What we keep on the evidence record (no images; the sealed photo is stored separately). */
export interface AnalysisSummary {
  modelStatus: string
  colourClass: string
  probs: Record<string, number>
  reagent: string
  chartVerified: boolean
  readWindowS: number | null
  cardFound: boolean
  exposure: string
  cast: string
  cctK: number | null
  deltaEBefore: number | null
  deltaEAfter: number | null
  warnings: AnalysisNotice[]
}

export interface EvidenceRecord {
  id: string // e.g. NT-2026-00142
  caseId: string
  officerId: string
  officerName: string
  testKitId: string
  sampleType: string
  verdict: ResultVerdict | null
  substance: string | null
  confidence: number | null
  reactionColor: string | null
  imageQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | null
  modelVersion: string | null
  timestamp: string
  location: string
  lat: number | null
  lng: number | null
  gpsVerified: boolean
  gpsAccuracyM: number | null
  temperatureC?: number // only when a real sensor reading exists (never fabricated)
  lightingLux?: number
  analysis?: AnalysisSummary // present for results produced by the real calibration + model pipeline
  analysisStatus: AnalysisStatus
  secondsSinceReagent: number | null
  deviceId: string
  sha256: string
  syncStatus: SyncStatus
  custody: CustodyEvent[]
  inconclusiveReasons?: AnalysisNotice[]
}

export interface AlertItem {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  bodyKey: string
  bodyParams: Record<string, string | number>
  timestamp: string
}

export interface KitInfo {
  id: string
  reagent: string
  expected: string[]
  chart_verified: boolean
  read_window_s: number | null
}

export interface EvidenceApiRecord {
  id: string
  case_id: string
  officer_id: string
  zone: string
  test_kit_id: string
  sample_type: string
  verdict: ResultVerdict
  substance: string
  confidence: number
  reaction_color: string
  model_version: string
  captured_at: string
  lat: number | null
  lng: number | null
  location: string
  temperature_c: number | null
  lighting_lux: number | null
  device_id: string
  image_sha256: string
  extra: Record<string, unknown>
  released: boolean
  sync_state: 'synced'
}

export interface Form6Editable {
  sampleDescription: string
  place: string
  observations: string
  quantity: string // '' = Pending Input
  witness: string // '' = Pending Input
  remarks: string
}
export interface Form6Audit {
  at: string
  by: string
  action: string
  detail: string
  detailParams?: Record<string, string | number>
}
export interface Form6Record {
  id: string // F6-<evidenceId>-R<revision>
  evidenceId: string
  caseId: string
  revision: number
  status: 'draft' | 'confirmed'
  generatedAt: string
  generatedBy: string
  confirmedAt?: string
  confirmedBy?: string
  fields: Form6Editable
  history: Form6Audit[]
}
