// TypeScript removed:
//   import type { Post }              → deleted
//   interface PostModalProps {...}    → deleted
//   typed refs / event handlers       → plain useRef(null), plain (e) params
//
// Field remap (v0 mock → real Supabase columns):
//   post.images          → post.all_images ?? []
//   post.source          → post.platform       ('xiaohongshu' | 'weibo')
//   post.author.avatar   → post.author_avatar
//   post.author.name     → post.original_author
//   post.description     → post.description_en
//   post.foreignerTips   → post.practical_tips
//   post.venue           → post.location_name
//   post.chineseText     → post.description_cn
//   post.externalUrl     → post.xiaohongshu_url OR post.weibo_url
//
// New: video support — when post.post_type === 'video' or post.video_url exists,
//      show a <video> player instead of the image carousel
import { useState, useEffect, useCallback, useRef } from "react"
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Share2,
  ExternalLink,
  Sparkles,
  MapPin,
} from "lucide-react"
import { ProgressiveImage } from "./ProgressiveImage"

export function PostModal({ post, onClose }) {
  const [currentImage, setCurrentImage] = useState(0)
  const [showChinese, setShowChinese] = useState(false)
  const [copied, setCopied] = useState(false)
  const modalRef = useRef(null)
  const touchStartY = useRef(0)
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Lock body scroll when modal is open — prevents background scroll on mobile
  useEffect(() => {
    if (post) {
      document.body.style.overflow = "hidden"
      // Reset internal state every time a new post opens
      setCurrentImage(0)
      setShowChinese(false)
      setCopied(false)
      setTranslateY(0)
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [post])

  // ESC key closes the modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Sync URL with open post — lets users share a direct link to a post
  useEffect(() => {
    if (post) {
      window.history.replaceState(null, "", `/?post=${post.id}`)
    } else {
      window.history.replaceState(null, "", "/")
    }
  }, [post])

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  // Touch drag-to-dismiss: swipe down more than 150px to close
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e) => {
    if (!isDragging) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setTranslateY(delta)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    if (translateY > 150) {
      onClose()
    } else {
      setTranslateY(0)
    }
  }

  if (!post) return null

  // Derived display values from real Supabase field names
  const images = post.all_images ?? []
  const isVideo = post.post_type === "video" || !!post.video_url
  const platformLabel = post.platform === "xiaohongshu" ? "XHS" : "Weibo"
  const platformBg = post.platform === "xiaohongshu" ? "bg-red-500" : "bg-blue-500"
  const platformName = post.platform === "xiaohongshu" ? "Xiaohongshu" : "Weibo"
  // External link: XHS posts use xiaohongshu_url, Weibo posts use weibo_url
  const externalUrl = post.platform === "xiaohongshu" ? post.xiaohongshu_url : post.weibo_url

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop — fades out as user drags modal down */}
      <div
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: Math.max(0, 1 - translateY / 300) }}
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:max-h-[85vh] md:max-w-lg md:rounded-2xl"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease-out",
        }}
      >
        {/* Drag handle pill — visual affordance on mobile */}
        <div className="sticky top-0 z-10 flex justify-center bg-white pb-1 pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-stone-100 hover:text-stone-900 md:right-4 md:top-4"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Media: video player OR image carousel ── */}
        {isVideo && post.video_url ? (
          // Video post: show native HTML5 video player with poster from first image
          <video
            src={post.video_url}
            controls
            poster={images[0]}
            className="aspect-[4/3] w-full bg-stone-900 object-contain"
          />
        ) : images.length > 0 ? (
          // Image post: carousel with prev/next arrows and dot indicators
          <div className="relative">
            <ProgressiveImage
              src={images[currentImage]}
              alt={post.Title || "Post image"}
              className="aspect-[4/3] w-full"
            />

            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentImage((prev) => (prev === 0 ? images.length - 1 : prev - 1))
                  }}
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentImage((prev) => (prev === images.length - 1 ? 0 : prev + 1))
                  }}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {/* Dot indicators */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {images.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${
                        i === currentImage ? "bg-white" : "bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* ── Text content ── */}
        <div className="p-5">
          {/* Title */}
          <h2 className="flex-1 text-lg font-bold leading-snug text-stone-900 text-balance">
            {post.Title}
          </h2>

          {/* Author + platform badge */}
          <div className="mt-3 flex items-center gap-2">
            {post.author_avatar ? (
              <img
                src={post.author_avatar}
                alt={post.original_author}
                className="h-8 w-8 rounded-full bg-stone-100 object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-sm text-stone-500">
                {post.original_author?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-stone-900">
                {post.original_author}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-stone-500">via</span>
                <span className={`rounded-full ${platformBg} px-2 py-0.5 text-xs text-white`}>
                  {platformLabel}
                </span>
              </div>
            </div>
          </div>

          {/* English description */}
          {post.description_en && (
            <p className="mt-4 text-sm leading-relaxed text-stone-700">
              {post.description_en}
            </p>
          )}

          {/* ✨ For Foreigners tip box — amber highlight, only shown when tips exist */}
          {post.practical_tips && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  For Foreigners
                </span>
              </div>
              <p className="text-sm leading-relaxed text-amber-900">
                {post.practical_tips}
              </p>
            </div>
          )}

          {/* Location: venue name + district pill */}
          {(post.location_name || post.district) && (
            <div className="mt-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-stone-400" />
              <span className="text-sm text-stone-700">
                {post.location_name && (
                  <span className="font-medium">{post.location_name}</span>
                )}
                {post.location_name && post.district && <span> &middot; </span>}
              </span>
              {post.district && (
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                  {post.district}
                </span>
              )}
            </div>
          )}

          {/* Expandable original Chinese text */}
          {post.description_cn && (
            <div className="mt-4">
              <button
                onClick={() => setShowChinese(!showChinese)}
                className="flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-700"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    showChinese ? "rotate-180" : ""
                  }`}
                />
                <span>View original Chinese</span>
              </button>
              {showChinese && (
                <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm leading-relaxed text-stone-600">
                  {post.description_cn}
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-stone-100 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200"
            >
              <Share2 className="h-4 w-4" />
              {copied ? "Copied!" : "Share"}
            </button>

            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View on {platformName}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
