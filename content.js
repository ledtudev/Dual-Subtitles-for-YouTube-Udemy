// Puts the translation inside the player's own caption box, on its own line, on Udemy and YouTube. The player
// downloads a subtitle file when captions are on (Udemy: WebVTT; YouTube: timedtext json3 or XML); capture.js hands
// it here, background.js translates the whole file in batches, and every caption the player shows is matched to its
// translation by text, falling back to the cue at the video's current time (YouTube's auto-captions roll word by
// word, so they rarely match a cue's text). Selecting words on a caption looks them up and saves them to the
// vocabulary book (vocabulary.html).

const log = (...args) => console.info('[Dual Subs]', ...args)
log('loaded on', location.hostname)

let settings = { ...DUAL_SUBS_DEFAULTS }
let cues = [] // { start, end, text }
const translations = new Map() // normalized original → translation
let requestId = 0

const normalize = (text) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// ── Subtitle files ──
function toSeconds(stamp) {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number)
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function parseVtt(text) {
  const out = []
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) continue
    const [start, end] = lines[timing].split('-->').map((part) => toSeconds(part.trim().split(/\s+/)[0]))
    const cueText = normalize(lines.slice(timing + 1).join(' '))
    if (cueText) out.push({ start, end, text: cueText })
  }
  return out
}

// YouTube timedtext, json3: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }
function parseJson3(text) {
  const events = JSON.parse(text).events ?? []
  return events.flatMap((event) => {
    const cueText = normalize((event.segs ?? []).map((seg) => seg.utf8 ?? '').join(''))
    const start = (event.tStartMs ?? 0) / 1000
    return cueText ? [{ start, end: start + (event.dDurationMs ?? 0) / 1000, text: cueText }] : []
  })
}

// YouTube timedtext, XML (srv1: <text start dur>, srv3: <p t d> in milliseconds).
function parseTimedTextXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  return [...doc.querySelectorAll('text, p')].flatMap((node) => {
    const ms = node.hasAttribute('t')
    const start = Number(node.getAttribute(ms ? 't' : 'start')) / (ms ? 1000 : 1)
    const length = Number(node.getAttribute(ms ? 'd' : 'dur')) / (ms ? 1000 : 1)
    const cueText = normalize(node.textContent ?? '')
    return cueText && Number.isFinite(start) ? [{ start, end: start + (length || 0), text: cueText }] : []
  })
}

function parseSubtitles(text) {
  const head = text.trimStart()
  try {
    if (head.startsWith('{')) return parseJson3(text)
    if (head.startsWith('<')) return parseTimedTextXml(text)
  } catch {
    return []
  }
  return text.includes('-->') ? parseVtt(text) : []
}

// ── Translation ──
let port = null
function translationPort() {
  if (port) return port
  port = chrome.runtime.connect({ name: 'translate' })
  port.onMessage.addListener(({ id, partial }) => {
    if (id !== requestId || !partial) return
    for (const [original, translated] of Object.entries(partial)) translations.set(original, translated)
    scheduleRender()
  })
  port.onDisconnect.addListener(() => { port = null }) // the service worker slept; reconnect on next use
  return port
}

function translateCues() {
  if (!settings.enabled || cues.length === 0) return
  requestId += 1
  translations.clear()
  asked.clear()
  translationPort().postMessage({ id: requestId, lines: cues.map((cue) => cue.text), lang: settings.lang })
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.dualSubs !== 'vtt') return
  if (/thumb|sprite|storyboard/i.test(event.data.url)) return // preview-image tracks, not speech
  const parsed = parseSubtitles(event.data.text)
  if (parsed.length === 0) return
  cues = parsed
  log('subtitle file captured:', parsed.length, 'cues', event.data.url)
  translateCues()
})

// ── Rendering ──
// The element each player draws its caption text in. Players lay their caption boxes out in their own way (Udemy's
// is a row), so the translation does not go inside it: it is an overlay in the player, placed from the caption's
// real position. Below the original (default), the original is lifted by the translation's height and the
// translation takes its place, since captions sit at the very bottom of the video.
const SITES = [
  { host: /(^|\.)udemy\.com$/, caption: '[data-purpose="captions-cue-text"], .shaka-text-container > div:not(.dual-subs-line)' }, // old player, Shaka player,
  { host: /(^|\.)youtube\.com$/, caption: '.caption-window .captions-text', keepLayout: true },
]
const SITE = SITES.find((site) => site.host.test(location.hostname)) ?? SITES[0]
const CAPTION_SELECTOR = SITE.caption
const LINE_CLASS = 'dual-subs-line'
const HOST_CLASS = 'dual-subs-host'
const GAP_PX = 4
const lines = new Map() // caption element → its translation overlay

const originalText = (caption) => caption.textContent ?? ''

function currentCue() {
  const time = document.querySelector('video')?.currentTime
  return time == null ? null : cues.find((item) => time >= item.start && time <= item.end) ?? null
}

const asked = new Set() // lines translated one by one, when no subtitle file was captured for them

function translationFor(captionText) {
  const line = normalize(captionText)
  const direct = translations.get(line)
  if (direct) return direct
  const cue = currentCue() // the player split or merged cues differently from the file
  const byTime = cue ? translations.get(cue.text) : null
  if (byTime) return byTime
  // No file (some players fetch it where capture.js cannot see): translate what is on screen.
  if (line && settings.enabled && !asked.has(`${settings.lang}|${line}`)) {
    asked.add(`${settings.lang}|${line}`)
    chrome.runtime.sendMessage({ type: 'lookup', text: line, lang: settings.lang }, (reply) => {
      if (chrome.runtime.lastError || !reply?.translation) return log('translation failed', chrome.runtime.lastError?.message ?? reply)
      translations.set(line, reply.translation)
      scheduleRender()
    })
  }
  return ''
}

function styleLine(line, caption) {
  const sized = caption.querySelector('.ytp-caption-segment') ?? caption // YouTube sizes each segment
  const base = parseFloat(getComputedStyle(sized).fontSize) || 20
  line.style.fontSize = `${Math.round((base * settings.fontSize) / 100 * 0.9)}px`
  line.style.color = settings.color
  line.style.fontWeight = settings.bold ? '600' : '400'
  line.style.background = `rgba(0, 0, 0, ${settings.background / 100})`
}

// The translation sits in the caption's own container, which is forced into a column so it stacks.
function lift() {}

function place(line, caption) {
  const box = caption.parentElement
  if (!box) return
  // YouTube sizes and moves its caption window itself, and re-measures whenever it is restyled; the line just
  // follows the caption in normal flow there.
  if (SITE.keepLayout) {
    // Its auto-captions also roll between one and two lines; the translation floats just above the caption
    // window instead of inside it, so it never covers a rolling line.
    const frame = box.closest('.html5-video-player') ?? box.parentElement
    if (line.parentNode !== frame) frame.append(line)
    const at = box.getBoundingClientRect()
    const area = frame.getBoundingClientRect()
    line.style.setProperty('position', 'absolute', 'important')
    line.style.left = `${Math.round(at.left + at.width / 2 - area.left)}px`
    line.style.bottom = `${Math.round(area.bottom - at.top + 4)}px`
    line.style.transform = 'translateX(-50%)'
    line.style.margin = '0'
    line.style.maxWidth = `${Math.round(area.width * 0.9)}px`
    return
  }
  for (const [name, value] of [['display', 'flex'], ['flex-direction', 'column'], ['align-items', 'center']]) {
    if (box.style.getPropertyValue(name) !== value) box.style.setProperty(name, value, 'important')
  }
  if (settings.position === 'above') { if (line.nextSibling !== caption) box.insertBefore(line, caption) }
  else if (caption.nextSibling !== line) caption.after(line)
  // The caption sits at the very bottom of the video: a line under it would fall off the player, so the
  // whole box moves up by whatever spills past the player's bottom edge.
  const player = box.closest('[class*="video-player"], .html5-video-player') ?? box.parentElement
  const current = Number(box.dataset.dualSubsShift || 0)
  const spill = Math.max(0, box.getBoundingClientRect().bottom + current - (player?.getBoundingClientRect().bottom ?? Infinity) + 8)
  if (Math.abs(spill - current) > 1) {
    box.dataset.dualSubsShift = String(Math.round(spill))
    box.style.setProperty('transform', spill ? `translateY(-${Math.round(spill)}px)` : 'none', 'important')
  }
}

function dropLine(caption) {
  lines.get(caption)?.remove()
  lines.delete(caption)
  lift(caption, 0)
  caption.classList.remove(HOST_CLASS)
  caption.style.removeProperty('visibility')
}

// YouTube: its own caption box rolls auto-captions line by line and is cut at the video's edge, so it is hidden
// and replaced by one panel showing the whole sentence being spoken and its translation.
let panel = null
function renderYouTube() {
  const player = document.querySelector('.html5-video-player')
  const shown = [...document.querySelectorAll(CAPTION_SELECTOR)].map(originalText).join(' ')
  const original = normalize(currentCue()?.text ?? shown)
  const active = settings.enabled && player && normalize(shown) !== ''
  document.documentElement.classList.toggle('dual-subs-yt-on', Boolean(active))
  if (!active) { panel?.remove(); panel = null; return }
  if (!panel) {
    panel = document.createElement('div')
    panel.className = 'dual-subs-yt'
    panel.innerHTML = '<div class="dual-subs-yt-orig"></div><div class="dual-subs-line"></div>'
  }
  if (panel.parentNode !== player) player.append(panel)
  const [orig, line] = panel.children
  const text = translationFor(original)
  if (orig.textContent !== original) orig.textContent = original
  if (line.textContent !== text) line.textContent = text
  orig.hidden = settings.hideOriginal && Boolean(text)
  line.hidden = !text
  panel.style.flexDirection = settings.position === 'above' ? 'column-reverse' : 'column'
  panel.style.bottom = player.classList.contains('ytp-autohide') ? '4%' : '64px'
  const size = Math.max(14, Math.min(40, player.clientHeight / 22))
  orig.style.fontSize = `${Math.round(size)}px`
  styleLine(line, orig)
}

function render() {
  if (SITE.keepLayout) return renderYouTube()
  for (const caption of [...lines.keys()]) if (!caption.isConnected || !settings.enabled) dropLine(caption)
  if (!settings.enabled) return
  const found = document.querySelectorAll(CAPTION_SELECTOR)
  if (found.length && !render.seen) { render.seen = true; log('caption found', found[0]) }
  for (const caption of found) {
    const text = translationFor(originalText(caption))
    let line = lines.get(caption)
    if (!line) {
      line = document.createElement('div')
      line.className = LINE_CLASS
      lines.set(caption, line)
      caption.classList.add(HOST_CLASS)
    }
    if (line.textContent !== text) line.textContent = text
    line.hidden = !text || !caption.textContent?.trim()
    caption.style.visibility = settings.hideOriginal && text ? 'hidden' : ''
    styleLine(line, caption)
    if (line.hidden) lift(caption, 0)
    else place(line, caption)
  }
}

// The players change the page constantly: render at most once per frame.
let scheduled = false
const scheduleRender = () => {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => { scheduled = false; render() })
}
new MutationObserver(scheduleRender).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
window.addEventListener('resize', scheduleRender)
document.addEventListener('fullscreenchange', scheduleRender)

// ── Learning: select a word to look it up and save it ──
let bubble = null
function closeBubble() {
  bubble?.remove()
  bubble = null
}

function showBubble(rect, word, context) {
  closeBubble()
  bubble = document.createElement('div')
  bubble.className = 'dual-subs-bubble'
  bubble.innerHTML = '<div class="dual-subs-word"></div><div class="dual-subs-meaning">Đang dịch…</div><div class="dual-subs-actions"><button data-act="save">Lưu vào sổ từ</button><button data-act="close">Đóng</button></div>'
  bubble.querySelector('.dual-subs-word').textContent = word
  document.body.append(bubble)
  const top = Math.max(8, rect.top - bubble.offsetHeight - 10)
  bubble.style.top = `${top}px`
  bubble.style.left = `${Math.min(window.innerWidth - bubble.offsetWidth - 8, Math.max(8, rect.left + rect.width / 2 - bubble.offsetWidth / 2))}px`
  let meaning = ''
  chrome.runtime.sendMessage({ type: 'lookup', text: word, lang: settings.lang }, (reply) => {
    meaning = reply?.translation ?? ''
    const target = bubble?.querySelector('.dual-subs-meaning')
    if (target) target.textContent = meaning || 'Không dịch được, thử lại sau.'
  })
  bubble.addEventListener('mousedown', (event) => event.stopPropagation())
  bubble.addEventListener('click', (event) => {
    const act = event.target.dataset?.act
    if (act === 'close') closeBubble()
    if (act !== 'save') return
    saveWord({ word, meaning, context: context.text, contextTranslation: context.translation })
    event.target.textContent = 'Đã lưu ✓'
    event.target.disabled = true
  })
}

function saveWord(entry) {
  const video = document.querySelector('video')
  const item = {
    ...entry,
    lang: settings.lang,
    url: location.href,
    title: document.title,
    time: video ? Math.floor(video.currentTime) : null,
    savedAt: new Date().toISOString(),
  }
  chrome.storage.local.get({ vocabulary: [] }, ({ vocabulary }) => {
    const rest = vocabulary.filter((saved) => !(saved.word.toLowerCase() === item.word.toLowerCase() && saved.lang === item.lang))
    chrome.storage.local.set({ vocabulary: [item, ...rest] })
  })
}

document.addEventListener('mouseup', (event) => {
  if (!settings.enabled || event.target.closest?.('.dual-subs-bubble')) return
  const selection = window.getSelection()
  const word = normalize(selection?.toString() ?? '')
  const caption = selection?.anchorNode?.parentElement?.closest?.(`${CAPTION_SELECTOR}, .dual-subs-yt-orig`)
  if (!word || word.length > 80 || !caption) return
  const contextText = normalize(originalText(caption))
  showBubble(selection.getRangeAt(0).getBoundingClientRect(), word, { text: contextText, translation: translationFor(contextText) })
})
document.addEventListener('mousedown', () => { if (bubble) closeBubble() })

// ── Settings ──
chrome.storage.sync.get(DUAL_SUBS_DEFAULTS, (stored) => { settings = stored; scheduleRender() })
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return
  const retranslate = 'lang' in changes || ('enabled' in changes && changes.enabled.newValue)
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue
  if (retranslate) translateCues()
  render()
})
