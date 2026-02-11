export default function PostCard({ post }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <img
        src={post.imageUrl}
        alt={post.title}
        className="w-full h-48 object-cover"
      />
      <div className="p-4">
        <h3 className="font-semibold text-gray-900">{post.title}</h3>
        <p className="text-sm text-gray-600 mt-1">{post.description}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>{post.location}</span>
          <span className="bg-gray-100 px-2 py-1 rounded">{post.category}</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          via {post.attribution}
        </p>
      </div>
    </div>
  )
}
