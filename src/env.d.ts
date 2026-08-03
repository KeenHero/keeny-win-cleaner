/// <reference types="vite/client" />

import type { CleanerApi } from './types'

declare global {
  interface Window {
    cleaner: CleanerApi
  }
}

export {}
