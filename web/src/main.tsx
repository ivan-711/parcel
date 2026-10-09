import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import './styles/base.css'

// Public pages ship prerendered for first paint and crawlers; the app takes
// the container over once it loads, which keeps the markup identical.
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
