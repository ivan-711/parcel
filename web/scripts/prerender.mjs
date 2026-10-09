// Renders the public pages to static HTML after `vite build`, so crawlers and
// first paint get real content. The app hydrates over it on load.
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const PAGES = ['/', '/methodology']
const PORT = 4173

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)
const wait = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('preview server did not start')
}

try {
  await wait()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  for (const path of PAGES) {
    await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' })
    const html = await page.evaluate(() => {
      // Drawn after measuring, so it must not be in the markup React hydrates.
      document.querySelectorAll('svg[aria-hidden="true"][class*="layer"]').forEach((el) => el.remove())
      return '<!doctype html>' + document.documentElement.outerHTML
    })
    const out = path === '/' ? 'dist/index.html' : `dist${path}/index.html`
    await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
    await writeFile(out, html)
    console.log(`prerendered ${path} -> ${out}`)
  }
  await browser.close()
} finally {
  server.kill()
}
