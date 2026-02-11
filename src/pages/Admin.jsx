import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DISTRICTS = ['Jing\'an', 'Xuhui', 'Huangpu', 'Pudong', 'Yangpu', 'Minhang', 'Changning']
const CATEGORIES = ['concerts', 'food', 'nightlife', 'art', 'markets', 'activities']
const TYPES = ['event', 'place']

const initialForm = {
  title: '',
  description_cn: '',
  description_en: '',
  xiaohongshu_url: '',
  image: null,
  location_name: '',
  location_address: '',
  location_lat: '',
  location_lng: '',
  district: '',
  category: '',
  type: '',
  event_date: '',
  price_range: '',
  practical_tips: '',
  original_author: '',
}

export default function Admin() {
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      set('image', file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleTranslate = async () => {
    if (!form.description_cn.trim()) return
    setTranslating(true)
    try {
      // Placeholder: In production, call a translation API
      // For now, just copy the Chinese text with a note
      set('description_en', `[Auto-translate placeholder] ${form.description_cn}`)
    } finally {
      setTranslating(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validation
    if (!form.title.trim()) return setMessage({ type: 'error', text: 'Title is required' })
    if (!form.category) return setMessage({ type: 'error', text: 'Category is required' })

    setSubmitting(true)
    setMessage(null)

    try {
      let image_url = null

      // Upload image if provided
      if (form.image) {
        const fileExt = form.image.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(fileName, form.image)

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('post-images')
          .getPublicUrl(fileName)

        image_url = urlData.publicUrl
      }

      // Insert post
      const { error: insertError } = await supabase.from('Post').insert({
        Title: form.title.trim(),
        description_cn: form.description_cn.trim() || null,
        description_en: form.description_en.trim() || null,
        xiaohongshu_url: form.xiaohongshu_url.trim() || null,
        image_url,
        location_name: form.location_name.trim() || null,
        location_address: form.location_address.trim() || null,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : null,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : null,
        district: form.district || null,
        category: form.category,
        type: form.type || null,
        event_date: form.event_date || null,
        price_range: form.price_range.trim() || null,
        practical_tips: form.practical_tips.trim() || null,
        original_author: form.original_author.trim() || null,
      })

      if (insertError) {
        console.error('Insert error details:', JSON.stringify(insertError, null, 2))
        throw insertError
      }

      setMessage({ type: 'success', text: 'Post added successfully!' })
      setForm(initialForm)
      setImagePreview(null)
      // Reset file input
      const fileInput = document.getElementById('image-upload')
      if (fileInput) fileInput.value = ''
    } catch (err) {
      setMessage({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">
              Back to Feed
            </Link>
          </div>
          <p className="mt-1 text-gray-600 text-sm">Add curated posts from Xiaohongshu</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Add New Post</h2>

          {/* Title */}
          <div>
            <label className={labelClass}>Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={inputClass}
              placeholder="e.g., Underground Jazz Night at Yuyintang"
            />
          </div>

          {/* Description CN */}
          <div>
            <label className={labelClass}>Description (Chinese)</label>
            <textarea
              value={form.description_cn}
              onChange={e => set('description_cn', e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="Paste the Chinese caption from Xiaohongshu"
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating || !form.description_cn.trim()}
              className="mt-2 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {translating ? 'Translating...' : 'Translate to English'}
            </button>
          </div>

          {/* Description EN */}
          <div>
            <label className={labelClass}>Description (English)</label>
            <textarea
              value={form.description_en}
              onChange={e => set('description_en', e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="English description (auto-filled or manual)"
            />
          </div>

          {/* Xiaohongshu URL */}
          <div>
            <label className={labelClass}>Xiaohongshu URL</label>
            <input
              type="url"
              value={form.xiaohongshu_url}
              onChange={e => set('xiaohongshu_url', e.target.value)}
              className={inputClass}
              placeholder="https://www.xiaohongshu.com/..."
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className={labelClass}>Image</label>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {imagePreview && (
              <img src={imagePreview} alt="Preview" className="mt-2 h-32 rounded-md object-cover" />
            )}
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Location Name</label>
              <input
                type="text"
                value={form.location_name}
                onChange={e => set('location_name', e.target.value)}
                className={inputClass}
                placeholder="e.g., Yuyintang 愚音堂"
              />
            </div>
            <div>
              <label className={labelClass}>Location Address</label>
              <input
                type="text"
                value={form.location_address}
                onChange={e => set('location_address', e.target.value)}
                className={inputClass}
                placeholder="Full address"
              />
            </div>
          </div>

          {/* Lat/Lng */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Latitude</label>
              <input
                type="number"
                step="any"
                value={form.location_lat}
                onChange={e => set('location_lat', e.target.value)}
                className={inputClass}
                placeholder="31.2304"
              />
            </div>
            <div>
              <label className={labelClass}>Longitude</label>
              <input
                type="number"
                step="any"
                value={form.location_lng}
                onChange={e => set('location_lng', e.target.value)}
                className={inputClass}
                placeholder="121.4737"
              />
            </div>
          </div>

          {/* District / Category / Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>District</label>
              <select
                value={form.district}
                onChange={e => set('district', e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Category *</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Event Date / Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Event Date</label>
              <input
                type="date"
                value={form.event_date}
                onChange={e => set('event_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Price Range</label>
              <input
                type="text"
                value={form.price_range}
                onChange={e => set('price_range', e.target.value)}
                className={inputClass}
                placeholder="e.g., ¥80 cover"
              />
            </div>
          </div>

          {/* Practical Tips */}
          <div>
            <label className={labelClass}>Practical Tips</label>
            <textarea
              value={form.practical_tips}
              onChange={e => set('practical_tips', e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Any tips for visitors..."
            />
          </div>

          {/* Original Author */}
          <div>
            <label className={labelClass}>Original Author</label>
            <input
              type="text"
              value={form.original_author}
              onChange={e => set('original_author', e.target.value)}
              className={inputClass}
              placeholder="Xiaohongshu username"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Adding Post...' : 'Add Post'}
          </button>
        </form>
      </main>
    </div>
  )
}
