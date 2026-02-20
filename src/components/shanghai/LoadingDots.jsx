// TypeScript removed: { className?: string } type annotation → plain default param
export function LoadingDots({ className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 py-8 ${className}`}>
      {/* Three dots with staggered animation-delay so they bounce in sequence */}
      <div className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-stone-400" />
    </div>
  )
}
