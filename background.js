// Translates whole subtitle files in batches. Two free providers, tried in order: Google Translate's public
// endpoint, then the endpoint of Chrome's dictionary extension. A batch that fails on one goes to the next.
// Translations are kept in chrome.storage.local, so a lecture watched again needs no request at all.

const BATCH_CHARS = 3500 // Google answers long POST bodies; keep a margin under its ~5000-character limit
const SEPARATOR = '\n' // one cue per line; providers keep line breaks
const CACHE_KEY = 'cache:v1'
const CACHE_MAX = 20000 // entries; oldest dropped first

let cache = null // Map<"lang|text", translation>
let saveTimer = null

async function loadCache() {
  if (cache) return cache
  const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] ?? []
  cache = new Map(stored)
  return cache
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const entries = [...cache.entries()]
    chrome.storage.local.set({ [CACHE_KEY]: entries.slice(-CACHE_MAX) })
  }, 2000)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── Providers: each takes lines and returns the same number of translated lines, or throws ──

async function google(lines, lang) {
  const body = new URLSearchParams({ q: lines.join(SEPARATOR) })
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=${encodeURIComponent(lang)}`
  const reply = await fetch(url, { method: 'POST', body })
  if (!reply.ok) throw new Error(`google ${reply.status}`)
  const data = await reply.json()
  const out = (data?.[0] ?? []).map((chunk) => chunk?.[0] ?? '').join('').split(SEPARATOR).map((line) => line.trim())
  if (out.length !== lines.length) throw new Error('google line mismatch')
  return out
}

// Second provider: the endpoint of Chrome's dictionary extension, a separate Google service that takes one
// `q` per line and answers [[translation, source language], ...]; useful when the first one rate-limits.
async function googleDictionary(lines, lang) {
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(lang)}`
  const body = new URLSearchParams(lines.map((line) => ['q', line]))
  const reply = await fetch(url, { method: 'POST', body })
  if (!reply.ok) throw new Error(`google dictionary ${reply.status}`)
  const data = await reply.json()
  const out = data.map((item) => (Array.isArray(item) ? item[0] : item) ?? '')
  if (out.length !== lines.length) throw new Error('google dictionary line mismatch')
  return out
}

const PROVIDERS = [google, googleDictionary]

async function translateBatch(lines, lang) {
  let lastError = null
  for (const provider of PROVIDERS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await provider(lines, lang)
      } catch (error) {
        lastError = error
        await sleep(400 * 2 ** attempt) // back off, then retry or move to the next provider
      }
    }
  }
  throw lastError
}

// Lines to batches under BATCH_CHARS each.
function batches(lines) {
  const out = []
  let current = []
  let size = 0
  for (const line of lines) {
    if (current.length && size + line.length + 1 > BATCH_CHARS) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(line)
    size += line.length + 1
  }
  if (current.length) out.push(current)
  return out
}

// Translates every line; reports progress after each batch so the page shows translations as they arrive.
async function translateAll(lines, lang, onProgress) {
  const store = await loadCache()
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
  const missing = unique.filter((line) => !store.has(`${lang}|${line}`))
  const result = Object.fromEntries(unique.filter((line) => store.has(`${lang}|${line}`)).map((line) => [line, store.get(`${lang}|${line}`)]))
  if (Object.keys(result).length) onProgress({ ...result })
  for (const batch of batches(missing)) {
    try {
      const translated = await translateBatch(batch, lang)
      batch.forEach((line, index) => {
        if (!translated[index]) return
        store.set(`${lang}|${line}`, translated[index])
        result[line] = translated[index]
      })
      scheduleSave()
      onProgress(Object.fromEntries(batch.map((line) => [line, result[line]]).filter(([, value]) => value)))
    } catch {
      // Both providers failed for this batch: the original stays on screen; the next lecture tries again.
    }
  }
  return result
}

// One word or phrase selected on a caption (the vocabulary lookup), cached like subtitle lines.
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== 'lookup') return false
  translateAll([message.text], message.lang, () => {})
    .then((result) => reply({ translation: result[message.text.trim()] ?? '' }))
    .catch(() => reply({ translation: '' }))
  return true // the reply comes asynchronously
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate') return
  port.onMessage.addListener(async ({ id, lines, lang }) => {
    await translateAll(lines, lang, (partial) => {
      try { port.postMessage({ id, partial }) } catch {} // the tab may have gone
    })
    try { port.postMessage({ id, done: true }) } catch {}
  })
})
