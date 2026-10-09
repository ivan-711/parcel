import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { theme } from './lib/theme'
import '@fontsource-variable/inter'
import './styles/base.css'

// Public pages ship prerendered for first paint and crawlers; the app takes
// the container over once it loads, which keeps the markup identical.
theme.init()
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
