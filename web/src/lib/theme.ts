const KEY = 'parcel.theme'

export type Theme = 'dark' | 'light'

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function apply(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}

/** Dark is the default; a light choice is kept on this device. */
export const theme = {
  current: read,
  init() {
    apply(read())
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
