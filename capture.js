// Runs in the page itself (MAIN world) from document_start: hands every subtitle file the player downloads
// (Udemy WebVTT, YouTube timedtext) to content.js. Only reads responses; never changes what the page receives.
(() => {
  if (window.__dualSubsCapture) return
  window.__dualSubsCapture = true
  const looksLikeSubtitles = (url) => /\.vtt(\?|$)|caption|subtitle|\/api\/timedtext/i.test(String(url || ''))
  const send = (url, text) => {
    if (typeof text === 'string' && text.length > 0) window.postMessage({ dualSubs: 'vtt', url: String(url), text }, location.origin)
  }

  const fetchOriginal = window.fetch
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url
    const reply = fetchOriginal.call(this, input, init)
    if (looksLikeSubtitles(url)) reply.then((r) => r.clone().text()).then((text) => send(url, text)).catch(() => {})
    return reply
  }

  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (looksLikeSubtitles(url)) this.addEventListener('load', () => { try { send(url, this.responseText) } catch {} })
    return open.call(this, method, url, ...rest)
  }
})()
