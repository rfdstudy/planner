import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '../styles/base.css'
import './phone.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PhoneApp } from './PhoneApp'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('Élément racine introuvable dans le document.')
}

createRoot(container).render(
  <StrictMode>
    <PhoneApp />
  </StrictMode>
)

// Le service worker n'est utile qu'en production (ou après un build local).
// Il met en cache la coquille ; les navigations sont servies par le réseau en
// priorité, ce qui permet de remplacer une ancienne version dès la réouverture.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => undefined)
  })
}
