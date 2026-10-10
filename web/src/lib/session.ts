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

let clerkLoaded: () => void = () => undefined
const clerkReady = new Promise<void>((resolve) => {
  clerkLoaded = resolve
})

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
  },
  endDemo() {
    localStorage.removeItem(KEY)
  },
  useClerk(source: TokenSource | null) {
    clerkTokens = source
  },
  /** Clerk has finished loading, so token() answers for real from here on. */
  clerkLoaded() {
    clerkLoaded()
  },
  /**
   * Resolves once token() can be trusted. Route loaders run before anything
   * renders, so without this they'd ask for a token Clerk hasn't produced yet.
   * A demo visitor only waits a moment, in case Clerk can't load at all.
   */
  async ready(): Promise<void> {
    if (!readDemo()) return clerkReady
    await Promise.race([clerkReady, new Promise((resolve) => setTimeout(resolve, 2000))])
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
