// "use client" removed — that's a Next.js directive, not needed in Vite/React
import { Search } from "lucide-react"

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900">
            <span className="text-sm font-bold text-stone-50">S</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-stone-900">
            Shanghai Discovery
          </h1>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors duration-200 hover:bg-stone-200 hover:text-stone-700"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
