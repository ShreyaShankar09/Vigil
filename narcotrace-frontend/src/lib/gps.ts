export interface GpsReading {
  lat: number | null
  lng: number | null
  accuracyM: number | null
  gpsVerified: boolean
}

export function captureGps(
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.geolocation,
  timeoutMs = 10_000,
): Promise<GpsReading> {
  if (!geolocation) return Promise.resolve({ lat: null, lng: null, accuracyM: null, gpsVerified: false })
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        lat: Number.isFinite(coords.latitude) ? coords.latitude : null,
        lng: Number.isFinite(coords.longitude) ? coords.longitude : null,
        accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        gpsVerified: Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude),
      }),
      () => resolve({ lat: null, lng: null, accuracyM: null, gpsVerified: false }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}
