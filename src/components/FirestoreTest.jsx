import { useState } from 'react'
import { db } from '../lib/firebase'
import { collection, addDoc, getDocs } from 'firebase/firestore'

export default function FirestoreTest() {
  const [status, setStatus] = useState('')
  const [posts, setPosts] = useState([])

  const testWrite = async () => {
    setStatus('Writing...')
    try {
      const docRef = await addDoc(collection(db, 'posts'), {
        title: 'Test Post',
        description: 'A delicious xiaolongbao spot in Jing\'an',
        location: 'Jing\'an District',
        category: 'Food',
        imageUrl: 'https://example.com/image.jpg',
        attribution: '@shanghai_foodie',
        createdAt: new Date()
      })
      setStatus(`Written! Doc ID: ${docRef.id}`)
    } catch (error) {
      setStatus(`Error: ${error.message}`)
    }
  }

  const testRead = async () => {
    setStatus('Reading...')
    try {
      const querySnapshot = await getDocs(collection(db, 'posts'))
      const fetchedPosts = []
      querySnapshot.forEach((doc) => {
        fetchedPosts.push({ id: doc.id, ...doc.data() })
      })
      setPosts(fetchedPosts)
      setStatus(`Read ${fetchedPosts.length} posts`)
    } catch (error) {
      setStatus(`Error: ${error.message}`)
    }
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
      <h3 className="font-semibold text-yellow-800 mb-2">Firestore Test</h3>
      <p className="text-sm text-yellow-700 mb-3">
        Configure your Firebase credentials in /src/lib/firebase.js first
      </p>
      <div className="flex gap-2 mb-3">
        <button
          onClick={testWrite}
          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
        >
          Write Test Data
        </button>
        <button
          onClick={testRead}
          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
        >
          Read Data
        </button>
      </div>
      {status && (
        <p className="text-sm text-yellow-800 font-mono">{status}</p>
      )}
      {posts.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-yellow-800">Posts:</p>
          <ul className="mt-1 space-y-1">
            {posts.map((post) => (
              <li key={post.id} className="text-yellow-700">
                {post.title} - {post.location}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
