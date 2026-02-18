// setup-storage.mjs
// Creates the 'post-images' bucket in Supabase Storage
// Usage: node scripts/setup-storage.mjs

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function createBucket(name, options) {
  const { error } = await supabase.storage.createBucket(name, options)
  if (error) {
    if (error.message.includes('already exists')) {
      console.log(`✓ ${name}: already exists`)
    } else {
      console.error(`✗ ${name}: failed — ${error.message}`)
    }
  } else {
    console.log(`✓ ${name}: created`)
  }
}

async function main() {
  console.log('Setting up Supabase storage buckets...\n')

  await createBucket('post-images', {
    public: true,
    fileSizeLimit: 5242880,  // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  })

  await createBucket('post-videos', {
    public: true,
    fileSizeLimit: 104857600,  // 100MB
    allowedMimeTypes: ['video/mp4', 'video/webm']
  })

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Setup failed:', err)
  process.exit(1)
})
