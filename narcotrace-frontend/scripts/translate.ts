import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src', 'locales')
const localeCodes = ['hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'as', 'ur']
type Resource = string | { [key: string]: Resource } | string[]

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

function setValue(target: Record<string, unknown>, key: string, value: string) {
  const parts = key.split('.')
  let node = target
  for (const part of parts.slice(0, -1)) {
    if (!isObject(node[part])) node[part] = {}
    node = node[part] as Record<string, unknown>
  }
  node[parts.at(-1)!] = value
}

function pseudoLocalize(value: string) {
  const accented: Record<string, string> = {
    a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'ë', f: 'ƒ', g: 'ğ', h: 'ħ',
    i: 'ï', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ',
    q: 'ɋ', r: 'ŕ', s: 'š', t: 'ŧ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ',
    y: 'ÿ', z: 'ž',
  }
  const transformed = [...value].map((character) => {
    const lower = character.toLowerCase()
    const replacement = accented[lower]
    return replacement ? (character === lower ? replacement : replacement.toUpperCase()) : character
  }).join('')
  const padding = ' ~'.repeat(Math.ceil(value.length * 0.3))
  return `[${transformed}${padding}]`
}

await mkdir(localesDir, { recursive: true })
const english = JSON.parse(await readFile(path.join(localesDir, 'en.json'), 'utf8')) as Resource
const englishFlat = flatten(english)
const statusRows: string[] = []

for (const language of localeCodes) {
  const file = path.join(localesDir, `${language}.json`)
  let existing: unknown = {}
  try {
    existing = JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch {
    existing = {}
  }
  const existingFlat = flatten(existing)
  const localized: Record<string, unknown> = {}
  const todo: string[] = []
  for (const [key, englishText] of Object.entries(englishFlat)) {
    const existingText = existingFlat[key]
    const value = existingText && existingText !== englishText ? existingText : englishText
    setValue(localized, key, value)
    if (value === englishText) todo.push(key)
  }
  localized._todo = todo
  await writeFile(file, `${JSON.stringify(localized, null, 2)}\n`)
  statusRows.push(`| ${language} | ${Object.keys(englishFlat).length} | ${todo.length} | draft |`)
}

const pseudo: Record<string, unknown> = {}
for (const [key, englishText] of Object.entries(englishFlat)) {
  setValue(pseudo, key, pseudoLocalize(englishText))
}
await writeFile(path.join(localesDir, 'en-XA.json'), `${JSON.stringify(pseudo, null, 2)}\n`)

const review = [
  '# Translation review status',
  '',
  'English is the source of truth. Non-English entries still in English are marked `_todo` in their locale JSON.',
  'Verdicts, legal disclaimers, and Form 6 text require review by a native speaker and legal reviewer before production.',
  '',
  '| Locale | Keys | `_todo` | Status |',
  '| --- | ---: | ---: | --- |',
  '| en | ' + Object.keys(englishFlat).length + ' | 0 | draft |',
  ...statusRows,
  '',
  'The English source copy is also draft: official NDPS wording remains a clearly marked placeholder pending legal review.',
  '',
]
await mkdir(path.join(root, 'translations'), { recursive: true })
await writeFile(path.join(root, 'translations', 'REVIEW.md'), review.join('\n'))
