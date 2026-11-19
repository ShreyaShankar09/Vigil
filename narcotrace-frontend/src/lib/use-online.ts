import { useEffect, useState } from 'react'
import { apiHealthz } from '@/lib/api'

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export function useOnlineStatus() {
  const [apiOnline, setApiOnline] = useState(browserOnline)

  useEffect(() => {
    let active = true
    const check = () => {
      if (!navigator.onLine) {
        setApiOnline(false)
        return
      }
      void apiHealthz().then((healthy) => {
        if (active) setApiOnline(healthy)
      })
    }
    const onOffline = () => setApiOnline(false)
    window.addEventListener('online', check)
    window.addEventListener('offline', onOffline)
    const timer = window.setInterval(check, 15_000)
    check()
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('online', check)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return browserOnline() && apiOnline
}
