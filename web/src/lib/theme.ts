const KEY = 'parcel.theme'

export type Theme = 'dark' | 'light'

const LIGHT = '(prefers-color-scheme: light)'

function system(): Theme {
  return window.matchMedia(LIGHT).matches ? 'light' : 'dark'
}

function saved(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function apply(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}

/** The system appearance, unless a choice made in the app is kept on this device. */
export const theme = {
  current: (): Theme => saved() ?? system(),
  init() {
    apply(saved() ?? system())
    window.matchMedia(LIGHT).addEventListener('change', () => {
      if (saved() === null) apply(system())
    })
  },
  set(next: Theme) {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode: the choice lasts for the page only.
    }
    apply(next)
  },
}
