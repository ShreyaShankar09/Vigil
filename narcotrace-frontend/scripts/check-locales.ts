import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src', 'locales')
const locales = ['hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'as', 'ur']
type LocaleFile = Record<string, unknown> & { _todo?: string[] }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function flatten(value: unknown, prefix = '', result: Record<string, string> = {}): Record<string, string> {
  if (!isObject(value)) return result
  for (const [key, child] of Object.entries(value)) {
    if (key === '_todo') continue
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') result[fullKey] = child
    else flatten(child, fullKey, result)
  }
  return result
}

function parameters(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z_][\w.]*)/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort()
}

const englishFile = JSON.parse(await readFile(path.join(localesDir, 'en.json'), 'utf8')) as LocaleFile
const english = flatten(englishFile)
const englishKeys = Object.keys(english).sort()
const issues: string[] = []
const rows: { locale: string; keys: number; missing: number; todo: number }[] = []
const longTranslations: string[] = []

for (const locale of locales) {
  const file = JSON.parse(await readFile(path.join(localesDir, `${locale}.json`), 'utf8')) as LocaleFile
  const messages = flatten(file)
  const keys = Object.keys(messages).sort()
  const missingKeys = englishKeys.filter((key) => !(key in messages))
  const extraKeys = keys.filter((key) => !(key in english))
  const todo = new Set(file._todo ?? [])

  for (const key of missingKeys) issues.push(`${locale}: missing ${key}`)
  for (const key of extraKeys) issues.push(`${locale}: extra ${key}`)
  for (const [key, message] of Object.entries(messages)) {
    if (!message.trim() && !todo.has(key)) issues.push(`${locale}: empty value for ${key}`)
    if (parameters(message).join('|') !== parameters(english[key] ?? '').join('|')) {
      issues.push(`${locale}: ICU parameters differ for ${key}`)
    }
    if (english[key] && [...message].length > [...english[key]].length * 1.6) {
      longTranslations.push(`${locale}: ${key} (${[...message].length}/${[...english[key]].length} chars)`)
    }
  }
  for (const key of todo) if (!(key in english)) issues.push(`${locale}: _todo references unknown key ${key}`)
  rows.push({ locale, keys: keys.length, missing: missingKeys.length, todo: todo.size })
}

const pseudo = flatten(JSON.parse(await readFile(path.join(localesDir, 'en-XA.json'), 'utf8')) as LocaleFile)
for (const key of englishKeys) if (!(key in pseudo)) issues.push(`en-XA: missing ${key}`)
for (const key of Object.keys(pseudo)) if (!(key in english)) issues.push(`en-XA: extra ${key}`)

console.log('locale | keys | missing | _todo')
console.log('--- | ---: | ---: | ---:')
console.log(`en | ${englishKeys.length} | 0 | 0`)
for (const row of rows) console.log(`${row.locale} | ${row.keys} | ${row.missing} | ${row.todo}`)
console.log(`en-XA | ${Object.keys(pseudo).length} | ${englishKeys.filter((key) => !(key in pseudo)).length} | 0`)
if (longTranslations.length) {
  console.warn('Translations longer than 160% of English:')
  for (const message of longTranslations) console.warn(`  ${message}`)
}
if (issues.length) {
  for (const issue of issues) console.error(issue)
  process.exitCode = 1
}
