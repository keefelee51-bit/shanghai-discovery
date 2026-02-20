// TypeScript removed:
//   import type { Post }           → deleted
//   interface TextCardProps {...}  → deleted
//   ({ post, onClick }: TextCardProps) → plain destructuring
//
// Field remap (v0 mock → real Supabase columns):
//   post.images       → post.all_images     (array column, may be null)
//   post.description  → post.description_en (English translation)
//   post.isNew        → computed from post.created_at (< 24 hours old)
//   post.author.avatar → post.author_avatar (flat)
//   post.author.name   → post.original_author (flat)
//
// TextCard is for Weibo posts (or any post without images) — text-first layout
import { ProgressiveImage } from "./ProgressiveImage"

export function TextCard({ post, onClick }) {
  // "NEW" badge: same 24-hour rule as VisualCard
  const isNew =
    post.created_at &&
    Date.now() - new Date(post.created_at).getTime() < 24 * 60 * 60 * 1000

  return (
    <article
      onClick={onClick}
      className="group mb-4 cursor-pointer break-inside-avoid overflow-hidden rounded-lg bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md md:hover:-translate-y-0.5"
    >
      {/* Badge row: always show platform, conditionally show NEW */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs text-white ${
            post.platform === "xiaohongshu" ? "bg-red-500" : "bg-blue-500"
          }`}
        >
          {post.platform === "xiaohongshu" ? "XHS" : "Weibo"}
        </span>
        {isNew && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
            NEW
          </span>
        )}
      </div>

      {/* Title — line-clamp-2 keeps card heights consistent */}
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">
        {post.Title}
      </h3>

      {/* English description — 3-line clamp to keep cards compact */}
      {post.description_en && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-stone-600">
          {post.description_en}
        </p>
      )}

      {/* Optional image — shown below text if the post has one */}
      {post.all_images?.length > 0 && (
        <div className="mt-3">
          <ProgressiveImage
            src={post.all_images[0]}
            alt={post.Title || "Post image"}
            className="aspect-[16/9] w-full rounded-md"
          />
        </div>
      )}

      {/* Footer: author + district */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {post.author_avatar ? (
            <img
              src={post.author_avatar}
              alt={post.original_author}
              className="h-5 w-5 rounded-full bg-stone-100 object-cover"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-xs text-stone-500">
              {post.original_author?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <span className="line-clamp-1 text-xs text-stone-500">
            {post.original_author}
          </span>
        </div>

        {post.district && (
          <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
            {post.district}
          </span>
        )}
      </div>
    </article>
  )
}
