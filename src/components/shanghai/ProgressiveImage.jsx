// TypeScript removed:
//   interface ProgressiveImageProps { ... }        → deleted entirely
//   ({ src, alt, className }: ProgressiveImageProps) → plain destructuring with default
//   useRef<HTMLDivElement>(null)                    → useRef(null)
import { useState, useRef, useEffect } from "react"

export function ProgressiveImage({ src, alt, className = "" }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef(null) // was useRef<HTMLDivElement>(null) in TS

  // IntersectionObserver: only start loading the image when it's near the viewport.
  // rootMargin:"200px" means "load 200px before it scrolls into view" — zero layout shift.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect() // once visible, no need to keep observing
        }
      },
      { rootMargin: "200px" }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-stone-200 text-sm text-stone-400 ${className}`}>
        Image unavailable
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Gray placeholder shown until image loads — prevents layout shift */}
      <div
        className={`absolute inset-0 bg-stone-200 transition-opacity duration-500 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Only render <img> once the container is near the viewport */}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  )
}
