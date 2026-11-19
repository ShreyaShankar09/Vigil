import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, ScanLine, SwitchCamera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { assessCanvas, type QuickImageWarning } from '@/lib/image-quality'

export function CameraScanner({ onCapture }: { onCapture: (image: Blob | null) => void }) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nativeInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [qualityWarning, setQualityWarning] = useState<QuickImageWarning>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const streamActive = status === 'live'

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const startCamera = async (mode: 'environment' | 'user' = facing) => {
    stopStream()
    setStatus('starting')
    setErrorKey(null)
    setQualityWarning(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setErrorKey('test.capture.cameraUnavailable')
      return
    }
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
      } catch (e) {
        if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      streamRef.current = stream
      setFacing(mode)
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        await v.play().catch(() => {})
      }
      setStatus('live')
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setStatus('error')
      setErrorKey(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'test.capture.cameraDenied'
          : name === 'NotFoundError'
            ? 'test.capture.cameraNotFound'
            : name === 'NotReadableError'
              ? 'test.capture.cameraBusy'
              : 'test.capture.cameraFailed',
      )
    }
  }

  useEffect(() => stopStream, [])

  useEffect(() => {
    if (!streamActive) return
    let frameId = 0
    let lastCheck = 0
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const inspect = (now: number) => {
      const video = videoRef.current
      if (context && video?.videoWidth && now - lastCheck >= 700) {
        lastCheck = now
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        setQualityWarning(assessCanvas(canvas))
      }
      frameId = window.requestAnimationFrame(inspect)
    }
    frameId = window.requestAnimationFrame(inspect)
    return () => window.cancelAnimationFrame(frameId)
  }, [streamActive])

  const handleCapture = () => {
    const v = videoRef.current
    if (streamActive && v && v.videoWidth) {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        stopStream()
        onCapture(blob)
      }, 'image/jpeg', 0.92)
    } else {
      onCapture(null)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    stopStream()
    onCapture(file)
  }
  const error = errorKey ? t(errorKey) : ''

  return (
    <div className="flex flex-col gap-4">
      <div style={{ containerType: 'size' }} className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-line-700 bg-ink-950 sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover ${streamActive ? '' : 'hidden'} ${facing === 'user' ? '-scale-x-100' : ''}`}
        />
        {!streamActive && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,_var(--color-ink-700),_var(--color-ink-950))] px-6 text-center">
            <Camera className="h-10 w-10 text-mist-500" />
            <p className="max-w-xs text-xs text-mist-500">
              {status === 'starting' ? t('test.capture.cameraStarting') : error || t('test.capture.cameraStart')}
            </p>
            {status !== 'starting' && (
              <Button size="md" onClick={() => startCamera()}>
                <Camera className="h-4 w-4" />
                {status === 'error' ? t('test.capture.cameraTryAgain') : t('test.capture.cameraStartButton')}
              </Button>
            )}
          </div>
        )}
        {streamActive && (
          <button
            type="button"
            onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-ink-950/80 text-mist-100 hover:bg-ink-950"
            aria-label={t('test.capture.cameraSwitch')}
          >
            <SwitchCamera className="h-4.5 w-4.5" />
          </button>
        )}
        {streamActive && qualityWarning && (
          <p role="status" aria-live="polite" className="absolute inset-x-3 bottom-14 rounded-md bg-caution-950/95 px-3 py-2 text-center text-xs font-medium text-caution-300">
            {t(`test.capture.quickCheck.${qualityWarning}`)}
          </p>
        )}

        {/* alignment frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="relative h-2/3 w-4/5 rounded-lg border-2 border-evidence-400/70">
            <span className="absolute -left-px -top-px h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-evidence-400" />
            <span className="absolute -right-px -top-px h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-evidence-400" />
            <span className="absolute -bottom-px -left-px h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-evidence-400" />
            <span className="absolute -bottom-px -right-px h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-evidence-400" />
            <div className="absolute inset-x-2 top-1/2 h-0.5 bg-evidence-400/70 animate-scanline" />
          </div>
        </div>

        {/* reference-card guide: card must be about this size so the calibrator can find it (sized to the centre square that is analysed) */}
        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-sm border-2 border-dashed border-signal-400/90"
          style={{ width: '32cqmin', height: '13.4cqmin', left: 'calc(50% - 47cqmin)', top: 'calc(50% + 33.6cqmin)' }}
        >
          <span className="rounded bg-ink-950/70 px-1 text-[10px] font-medium text-signal-400">{t('test.capture.referenceCard')}</span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-md bg-ink-950/80 px-3 py-1.5 text-xs font-medium text-mist-100">
            {t('test.capture.positionStrip')}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-md bg-ink-950/80 px-3 py-1.5 text-xs font-medium text-verified-400">
            <ScanLine className="h-3.5 w-3.5" />
            {t('test.capture.lightingChecked')}
          </span>
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-1.5 text-xs text-mist-500 sm:grid-cols-2">
        <li>{t('test.capture.instruction1')}</li>
        <li>{t('test.capture.instruction2')}</li>
        <li>{t('test.capture.instruction3')}</li>
        <li>{t('test.capture.instruction4')}</li>
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={streamActive ? handleCapture : () => nativeInputRef.current?.click()}>
          <Camera className="h-4.5 w-4.5" />
          {streamActive ? t('test.capture.captureEvidence') : t('test.capture.takePhoto')}
        </Button>
        <Button size="lg" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4.5 w-4.5" />
          {t('test.capture.uploadImage')}
        </Button>
        <input ref={nativeInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={handleUpload} />
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  )
}
