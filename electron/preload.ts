import { contextBridge } from 'electron'

// Seul marqueur exposé pour l'instant : il permet au renderer de choisir
// l'implémentation de plateforme. Les capacités viendront avec les jalons.
contextBridge.exposeInMainWorld('planner', {
  isElectron: true
})
