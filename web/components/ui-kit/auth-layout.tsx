import type React from 'react'
import { AppFrame } from '../app-frame'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <main id="main" tabIndex={-1} className="page-width flex flex-1 items-start justify-center py-16 outline-none sm:py-24">
        {children}
      </main>
    </AppFrame>
  )
}
