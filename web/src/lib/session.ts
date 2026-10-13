/**
 * Who the app is acting as.
 *
 * A demo visitor holds a short lived token the API handed out. A signed in
 * user gets tokens from Clerk, which the auth provider registers here so the
 * API client stays free of React.
 */

const KEY = 'parcel.demo'

interface DemoSession {
  token: string
  expiresAt: string
}

type TokenSource = () => Promise<string | null>

let clerkTokens: TokenSource | null = null
let clerkUser: string | null = null
const listeners = new Set<() => void>()

function identityChanged() {
  for (const listener of listeners) listener()
}

let clerkLoaded: () => void = () => undefined
const clerkReady = new Promise<void>((resolve) => {
  clerkLoaded = resolve
})
let gaveUpOnClerk = false

function readDemo(): DemoSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoSession
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const session = {
  demo(): DemoSession | null {
    return readDemo()
  },
  startDemo(token: string, expiresAt: string) {
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt }))
    identityChanged()
  },
  // No identity change here: whatever is still mounted would refetch with no token on its
  // way out, and the next identity clears the cache when it starts.
  endDemo() {
    localStorage.removeItem(KEY)
  },
  useClerk(source: TokenSource | null, userId: string | null = null) {
    clerkTokens = source
    if (userId === clerkUser) return
    clerkUser = userId
    identityChanged()
  },
  /** Runs when the app starts acting as someone else, so nothing fetched for the last one lingers. */
  onIdentityChange(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Clerk has finished loading, so token() answers for real from here on. */
  clerkLoaded() {
    clerkLoaded()
  },
  /**
   * Resolves once token() can be trusted. Route loaders run before anything
   * renders, so without this they'd ask for a token Clerk hasn't produced yet.
   * Clerk is a third party script a blocker can stop, so nobody waits forever:
   * a demo visitor only a moment, since their token is already here, and anyone
   * else long enough for a slow connection before being treated as signed out.
   */
  async ready(limit = readDemo() ? 2_000 : 10_000): Promise<void> {
    if (gaveUpOnClerk) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        gaveUpOnClerk = true
        resolve()
      }, limit)
      void clerkReady.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  },
  /** A signed in user wins over any demo token left in this browser. */
  async token(): Promise<string | null> {
    const signedIn = clerkTokens ? await clerkTokens() : null
    if (signedIn) {
      localStorage.removeItem(KEY)
      return signedIn
    }
    return readDemo()?.token ?? null
  },
  async isActive(): Promise<boolean> {
    return (await this.token()) !== null
  },
}
