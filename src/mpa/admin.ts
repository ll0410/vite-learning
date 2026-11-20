const entry = document.querySelector<HTMLMetaElement>('meta[name="plugin-lab-entry"]')?.content ?? 'unknown'

document.body.dataset.entry = entry

const entryName = document.getElementById('entry-name')
const entryTitle = document.getElementById('entry-title')

if (entryName) entryName.textContent = entry
if (entryTitle) entryTitle.textContent = document.title
