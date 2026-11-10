import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import './styles/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('Élément racine introuvable dans le document.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
