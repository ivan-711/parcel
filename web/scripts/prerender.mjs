// Renders the public pages to static HTML after `vite build`, so crawlers and
// first paint get real content. The app hydrates over it on load.
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const PAGES = ['/', '/methodology']
const PORT = 4173
// `vercel build` writes the site to .vercel/output/static instead of dist.
const DIR = process.env.PRERENDER_DIR ?? 'dist'

const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--strictPort',
    '--outDir',
    DIR,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)
const wait = async () => {
  for (let i = 0; i < 50; i++) {
    const up = await fetch(`http://127.0.0.1:${PORT}/`).then(
      (r) => r.ok,
      () => false,
    )
    if (up) return
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
    // The trace overlay is measured at runtime, so it stays out of the static markup.
    await page
      .locator('svg[aria-hidden="true"][class*="layer"]')
      .evaluateAll((els) => els.forEach((el) => el.remove()))
    // Preload links the app adds at runtime carry the preview server's origin.
    const html =
      '<!doctype html>' +
      (await page.content())
        .replace(/^<!DOCTYPE html>/i, '')
        .replaceAll(`http://127.0.0.1:${PORT}`, '')
    const out = path === '/' ? `${DIR}/index.html` : `${DIR}${path}/index.html`
    await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
    await writeFile(out, html)
    console.log(`prerendered ${path} -> ${out}`)
  }
  await browser.close()
} finally {
  server.kill()
}
