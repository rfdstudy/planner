export {}

declare global {
  interface Window {
    planner?: {
      readonly isElectron: boolean
    }
  }
}
