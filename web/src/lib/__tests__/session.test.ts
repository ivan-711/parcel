import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Session = typeof import('../session').session

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString()

async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false
  void promise.then(() => {
    done = true
  })
  await vi.advanceTimersByTimeAsync(0)
  return done
}

// Clerk never loads in any of these, as when a blocker stops its script. Each test gets a
// fresh module, since giving up on Clerk is remembered for the life of the page.
describe('session.ready without Clerk', () => {
  let session: Session

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    ;({ session } = await import('../session'))
    session.endDemo()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets a demo visitor through after a moment', async () => {
    session.startDemo('tok_a', tomorrow())
    const ready = session.ready()
    expect(await settled(ready)).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await settled(ready)).toBe(true)
  })

  it('gives everyone else longer, but not forever', async () => {
    const ready = session.ready()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await settled(ready)).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await settled(ready)).toBe(true)
  })

  it('takes a shorter limit when asked', async () => {
    const ready = session.ready(500)
    await vi.advanceTimersByTimeAsync(600)
    expect(await settled(ready)).toBe(true)
  })

  it('does not wait again once it has given up', async () => {
    const first = session.ready()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await settled(first)).toBe(true)
    expect(await settled(session.ready())).toBe(true)
  })
})
