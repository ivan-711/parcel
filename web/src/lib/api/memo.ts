import { session } from '../session'
import type { Schemas } from './queries'

export type MemoEvent =
  | { kind: 'draft'; text: string }
  | { kind: 'retry'; unmatched: string[] }
  | { kind: 'done'; memo: Schemas['MemoOut'] }
  | { kind: 'error'; title: string; code: string }

/**
 * Streams a memo as it's written.
 *
 * The API answers with server sent events; a refusal (limit reached, memos
 * off) comes back as a normal problem response before any event.
 */
export async function* writeMemo(dealId: string, signal?: AbortSignal): AsyncGenerator<MemoEvent> {
  const base = import.meta.env.VITE_API_URL ?? ''
  const token = await session.token()
  const response = await fetch(`${base}/v1/deals/${dealId}/memo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })
  if (!response.ok || !response.body) {
    const problem = (await response.json().catch(() => null)) as {
      title?: string
      code?: string
    } | null
    yield {
      kind: 'error',
      title: problem?.title ?? 'The memo could not be written.',
      code: problem?.code ?? 'unknown',
    }
    return
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let cut = buffer.indexOf('\n\n')
    while (cut !== -1) {
      const block = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      cut = buffer.indexOf('\n\n')
      const event = parse(block)
      if (event) yield event
    }
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function parse(block: string): MemoEvent | null {
  let name = ''
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice(7)
    else if (line.startsWith('data: ')) data += line.slice(6)
  }
  if (!name || !data) return null
  const body = JSON.parse(data) as Record<string, unknown>
  switch (name) {
    case 'draft':
      return { kind: 'draft', text: str(body.text) }
    case 'retry':
      return { kind: 'retry', unmatched: (body.unmatched as string[] | undefined) ?? [] }
    case 'done':
      return { kind: 'done', memo: body as unknown as Schemas['MemoOut'] }
    case 'error':
      return { kind: 'error', title: str(body.title), code: str(body.code) }
    default:
      return null
  }
}
