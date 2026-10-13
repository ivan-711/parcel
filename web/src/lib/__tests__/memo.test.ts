import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeMemo, type MemoEvent } from '../api/memo'

vi.mock('../session', () => ({ session: { token: () => Promise.resolve('tok') } }))

function stream(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

async function collect(dealId: string): Promise<MemoEvent[]> {
  const events: MemoEvent[] = []
  for await (const event of writeMemo(dealId)) events.push(event)
  return events
}

describe('writeMemo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('yields every event even when chunks split an event in two', async () => {
    const memo = { text: 'Hello there.', grounded: true, unmatched: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          stream([
            'event: draft\ndata: {"text":"Hel',
            'lo"}\n\nevent: draft\ndata: {"text":" there."}\n\nevent: retry\n',
            'data: {"unmatched":["$1"]}\n\n',
            `event: done\ndata: ${JSON.stringify(memo)}\n\n`,
          ]),
        ),
      ),
    )
    expect(await collect('deal-1')).toEqual([
      { kind: 'draft', text: 'Hello' },
      { kind: 'draft', text: ' there.' },
      { kind: 'retry', unmatched: ['$1'] },
      { kind: 'done', memo },
    ])
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/v1/deals/deal-1/memo')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('turns a refusal before any event into one error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ title: 'Memos are off.', code: 'memos_off' }), {
            status: 503,
            headers: { 'content-type': 'application/problem+json' },
          }),
        ),
      ),
    )
    expect(await collect('deal-1')).toEqual([
      { kind: 'error', title: 'Memos are off.', code: 'memos_off' },
    ])
  })
})
