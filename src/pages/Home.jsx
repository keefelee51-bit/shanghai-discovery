import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImageCarousel from '../components/ImageCarousel'

export default function Home() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('Post')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setPosts(data || [])
    } catch (error) {
      console.error('Error fetching posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const categories = ['all', 'food', 'events', 'nightlife', 'art', 'trending']
  const filteredPosts = selectedCategory === 'all'
    ? posts
    : posts.filter(p => p.category === selectedCategory)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Shanghai Discovery
              </h1>
              <p className="mt-1 text-gray-600">
                Authentic local experiences for foreigners in Shanghai
              </p>
            </div>
            <Link
              to="/admin"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Admin
            </Link>
          </div>

          {/* Category Filter */}
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading posts...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No posts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map(post => (
              <article
                key={post.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Image Carousel */}
                {post.all_images && post.all_images.length > 0 ? (
                  <ImageCarousel images={post.all_images} alt={post.Title} />
                ) : post.image_url ? (
                  <img
                    src={post.image_url}
                    alt={post.Title}
                    className="w-full h-48 object-cover"
                  />
                ) : null}

                {/* Content */}
                <div className="p-4">
                  {/* Category Badge */}
                  <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded mb-2">
                    {post.category}
                  </span>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {post.Title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                    {post.description_en}
                  </p>

                  {/* Location */}
                  {post.location_name && (
                    <p className="text-xs text-gray-500 mb-2">
                      📍 {post.location_name}
                    </p>
                  )}

                  {/* Practical Tips */}
                  {post.practical_tips && (
                    <p className="text-xs text-green-700 bg-green-50 p-2 rounded mb-3">
                      💡 {post.practical_tips}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-3 pt-3 border-t">
                    <span>By {post.original_author}</span>
                    {post.xiaohongshu_url && (
                      <a
                        href={post.xiaohongshu_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View on XHS →
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
