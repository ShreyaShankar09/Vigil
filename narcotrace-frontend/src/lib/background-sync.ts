const OUTBOX_SYNC_TAG = 'vigil-outbox-sync'

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> }
}

export async function registerOutboxBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready as SyncRegistration
  if (!registration.sync) return
  await registration.sync.register(OUTBOX_SYNC_TAG)
}
