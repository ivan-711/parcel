// Renders the public pages to static HTML after `vite build`, so crawlers and
// first paint get real content. The app hydrates over it on load.
import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
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
  // Every path outside the public pages is served app.html, which the build emits.
  await access(`${DIR}/app.html`)
  const browser = await chromium.launch()
  // Every page is rendered before any is written: once index.html holds the landing page,
  // the preview server would hand it out as the shell for the pages still to come.
  const rendered = new Map()
  for (const path of PAGES) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    })
    await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' })
    // The trace overlay is measured at runtime, so it stays out of the static markup.
    await page
      .locator('svg[aria-hidden="true"][class*="layer"]')
      .evaluateAll((els) => els.forEach((el) => el.remove()))
    // Preload links the app adds at runtime carry the preview server's origin.
    // The appearance is decided on the visitor's device before first paint.
    const html =
      '<!doctype html>' +
      (await page.content())
        .replace(/^<!DOCTYPE html>/i, '')
        .replace(/<html([^>]*) data-theme="[^"]*"/, '<html$1')
        .replaceAll(`http://127.0.0.1:${PORT}`, '')
    rendered.set(path === '/' ? `${DIR}/index.html` : `${DIR}${path}/index.html`, html)
    await page.close()
  }
  await browser.close()
  for (const [out, html] of rendered) {
    await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true })
    await writeFile(out, html)
    console.log(`prerendered ${out}`)
  }
} finally {
  server.kill()
}
