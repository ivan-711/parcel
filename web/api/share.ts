import { describeShare, withHead, type SharedDeal } from '../src/lib/share-head.js'

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/
const HTML = { 'content-type': 'text/html; charset=utf-8' }

/**
 * Serves a shared report's shell with the deal's title and preview tags already
 * in the head, so a link pasted into a chat unfurls as the deal and not as
 * "Parcel". Everything else about the page still comes from the app.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const host = request.headers.get('x-forwarded-host') ?? url.host
  const self = process.env.VERCEL_URL ?? url.host

  const shell = await fetch(`https://${self}/app.html`, { signal: AbortSignal.timeout(5000) })
  if (!shell.ok) return new Response('The app shell is missing.', { status: 502 })
  const html = await shell.text()

  const api = process.env.VITE_API_URL
  if (!api || !TOKEN.test(token)) {
    return new Response(html, { status: 404, headers: { ...HTML, 'cache-control': 'no-store' } })
  }
  const found = await fetch(`${api}/v1/shared/${token}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null)
  if (found?.status === 404) {
    return new Response(html, { status: 404, headers: { ...HTML, 'cache-control': 'no-store' } })
  }
  if (!found?.ok) {
    // Let the app try the API itself rather than caching a bad moment.
    return new Response(html, { status: 200, headers: { ...HTML, 'cache-control': 'no-store' } })
  }
  const deal = (await found.json()) as SharedDeal
  const page = withHead(html, describeShare(deal, `https://${host}/r/${token}`))
  return new Response(page, {
    status: 200,
    headers: { ...HTML, 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  })
}
