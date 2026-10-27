let vocabulary = []

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function save() {
  chrome.storage.local.set({ vocabulary })
}

function draw() {
  const query = document.getElementById('search').value.trim().toLowerCase()
  const shown = vocabulary.filter((entry) => !query || `${entry.word} ${entry.meaning}`.toLowerCase().includes(query))
  const list = document.getElementById('list')
  list.replaceChildren()
  document.getElementById('count').textContent = vocabulary.length
  document.getElementById('empty').hidden = vocabulary.length > 0
  for (const entry of shown) {
    const item = el('div', 'item')
    const head = el('div')
    head.append(el('span', 'word', entry.word), el('span', 'meaning', entry.meaning ?? ''))
    item.append(head)
    if (entry.context) item.append(el('div', 'context', `“${entry.context}”${entry.contextTranslation ? ` · ${entry.contextTranslation}` : ''}`))
    const meta = el('div', 'meta')
    const source = el('a', null, entry.title || entry.url || '')
    if (entry.url) {
      source.href = entry.url
      source.target = '_blank'
    }
    const remove = el('button', null, 'Xoá')
    remove.addEventListener('click', () => {
      vocabulary = vocabulary.filter((other) => other !== entry)
      save()
      draw()
    })
    meta.append(source, remove)
    item.append(meta)
    list.append(item)
  }
}

const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

document.getElementById('csv').addEventListener('click', () => {
  const rows = vocabulary.map((entry) => [entry.word, entry.meaning, entry.context, entry.contextTranslation].map(cell).join(','))
  const blob = new Blob([`﻿${rows.join('\n')}`], { type: 'text/csv' })
  const link = el('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'dual-subtitles-vocabulary.csv'
  link.click()
})

document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Xoá toàn bộ sổ từ?')) return
  vocabulary = []
  save()
  draw()
})

document.getElementById('search').addEventListener('input', draw)

chrome.storage.local.get({ vocabulary: [] }, (data) => {
  vocabulary = data.vocabulary.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  draw()
})
