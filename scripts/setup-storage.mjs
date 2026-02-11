// setup-storage.mjs
// Creates the 'post-images' bucket in Supabase Storage
// Usage: node scripts/setup-storage.mjs

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
  console.log('Creating post-images bucket...\n')

  const { data, error } = await supabase.storage.createBucket('post-images', {
    public: true,  // Images need to be publicly accessible
    fileSizeLimit: 5242880,  // 5MB max
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  })

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Bucket already exists')
    } else {
      console.error('✗ Failed to create bucket:', error.message)
      process.exit(1)
    }
  } else {
    console.log('✓ Bucket created successfully')
  }
}

main().catch(err => {
  console.error('Setup failed:', err)
  process.exit(1)
})
