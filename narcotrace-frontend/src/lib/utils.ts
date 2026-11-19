import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function activeIntlLocale() {
  const locale = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en'
  return `${locale}-u-nu-latn`
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(activeIntlLocale(), { maximumFractionDigits }).format(value)
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), { day: '2-digit', month: 'short' }).format(new Date(iso))
}

export function formatDateTimeShort(iso: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} · ${formatTime(iso)}`
}
