const fields = Object.keys(DUAL_SUBS_DEFAULTS)
const value = (input) => (input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value)

function preview(settings) {
  const line = document.querySelector('#preview .tran')
  line.style.color = settings.color
  line.style.fontWeight = settings.bold ? '600' : '400'
  line.style.fontSize = `${Math.round(13 * settings.fontSize / 100)}px`
  line.style.background = `rgba(0, 0, 0, ${settings.background / 100})`
  document.querySelector('#preview .orig').style.display = settings.hideOriginal ? 'none' : ''
  document.querySelector('#preview').style.flexDirection = settings.position === 'above' ? 'column-reverse' : 'column'
  document.querySelector('#preview').style.display = 'flex'
  document.querySelector('#preview').style.alignItems = 'center'
}

chrome.storage.sync.get(DUAL_SUBS_DEFAULTS, (settings) => {
  for (const key of fields) {
    const input = document.getElementById(key)
    if (!input) continue
    if (input.type === 'checkbox') input.checked = settings[key]
    else input.value = settings[key]
    input.addEventListener('input', () => {
      settings[key] = value(input)
      preview(settings)
      chrome.storage.sync.set({ [key]: settings[key] })
    })
  }
  preview(settings)
})

chrome.storage.local.get({ vocabulary: [] }, ({ vocabulary }) => {
  document.getElementById('count').textContent = vocabulary.length
})
