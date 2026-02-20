// TypeScript removed:
//   import type { Category } from "@/lib/shanghai-data"  → deleted (was mock data types)
//   interface FilterTabsProps { ... }                     → deleted
//   useRef<HTMLDivElement> / useRef<HTMLButtonElement>    → useRef(null)
// "Trending" tab removed — no liked_count column in DB yet
import { useRef, useEffect } from "react"

const tabs = [
  { label: "All",       value: "all" },
  { label: "Food",      value: "food" },
  { label: "Events",    value: "events" },
  { label: "Nightlife", value: "nightlife" },
  { label: "Art",       value: "art" },
  // "Trending" removed until liked_count is added to the pipeline
]

export function FilterTabs({ activeTab, onTabChange }) {
  const scrollRef = useRef(null)
  const activeRef = useRef(null)

  // Auto-scroll the tab bar so the active tab is centred — useful on mobile
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current
      const button = activeRef.current
      const scrollLeft =
        button.offsetLeft - container.offsetWidth / 2 + button.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: "smooth" })
    }
  }, [activeTab])

  return (
    <div className="sticky top-[57px] z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur-sm">
      <div
        ref={scrollRef}
        // scrollbar-hide hides the horizontal scrollbar on mobile while keeping scroll
        className="scrollbar-hide mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value
          return (
            <button
              key={tab.value}
              ref={isActive ? activeRef : null}
              onClick={() => onTabChange(tab.value)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "border-b-2 border-stone-900 font-semibold text-stone-900"
                  : "border-b-2 border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
