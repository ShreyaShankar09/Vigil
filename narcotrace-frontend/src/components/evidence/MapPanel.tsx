import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { EvidenceRecord } from '@/types'
import { formatTime } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { useI18n } from '@/lib/i18n'
import { X } from 'lucide-react'

const verdictColor = { positive: '#c4392b', negative: '#2e9b6b', inconclusive: '#c98a2e' }

export function MapPanel({ records }: { records: EvidenceRecord[] }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LayerGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [active, setActive] = useState<EvidenceRecord | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    let activeEffect = true
    let map: LeafletMap | null = null
    void import('leaflet').then(({ default: L }) => {
      if (!activeEffect || !mapElement.current) return
      map = L.map(mapElement.current, { preferCanvas: true }).setView([12.9716, 77.5946], 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: t('map.attribution'),
      }).addTo(map)
      mapRef.current = map
      markersRef.current = L.layerGroup().addTo(map)
      setMapReady(true)
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        void navigator.serviceWorker.register('/tiles-worker.js')
      }
    })
    return () => {
      activeEffect = false
      map?.remove()
      mapRef.current = null
      markersRef.current = null
      setMapReady(false)
    }
  }, [t])

  useEffect(() => {
    if (!mapReady || !markersRef.current) return
    void import('leaflet').then(({ default: L }) => {
      const layer = markersRef.current
      if (!layer) return
      layer.clearLayers()
      for (const record of records) {
        if (record.lat === null || record.lng === null) continue
        const color = record.verdict ? verdictColor[record.verdict] : '#718096'
        L.circleMarker([record.lat, record.lng], {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 2,
        })
          .bindTooltip(record.id)
          .on('click', () => setActive(record))
          .addTo(layer)
      }
    })
  }, [mapReady, records])

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-lg border border-line-800">
      <div ref={mapElement} className="h-full w-full" aria-label={t('command.mapTitle')} />
      {active && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-lg border border-line-700 bg-ink-700/95 p-3 backdrop-blur sm:right-auto sm:w-64">
          <div className="flex items-center justify-between">
            <Link to={`/evidence/${active.id}`} className="font-mono text-sm font-medium text-mist-100 hover:text-signal-400">
              {active.id}
            </Link>
            <button type="button" onClick={() => setActive(null)} className="text-xs text-mist-500" aria-label={t('command.closeMapDetails')}><X aria-hidden="true" /></button>
          </div>
          <p className="mt-1 text-xs text-mist-400">{t('command.case')} <bdi dir="ltr" className="font-mono">{active.caseId}</bdi> · {active.officerName}</p>
          <p className="text-xs text-mist-500">{formatTime(active.timestamp)} · {active.location}</p>
        </div>
      )}
      {!records.some((record) => record.lat !== null && record.lng !== null) && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-ink-900/90 px-2 py-1 text-xs text-mist-400">
          {t('evidence.locationUnavailable')}
        </p>
      )}
    </div>
  )
}
