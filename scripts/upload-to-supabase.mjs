// upload-to-supabase.mjs
// Uploads accepted posts from pipeline-output.json to Supabase
// Usage: node scripts/upload-to-supabase.mjs

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function main() {
  const outputPath = path.resolve(import.meta.dirname, '..', 'data', 'pipeline-output.json')

  if (!fs.existsSync(outputPath)) {
    console.error('❌ pipeline-output.json not found!')
    console.log('Run process-xhs-posts.mjs first to generate this file.')
    process.exit(1)
  }

  console.log('Reading pipeline results...\n')
  const results = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
  const posts = results.accepted || []

  if (posts.length === 0) {
    console.log('No accepted posts to upload.')
    return
  }

  console.log(`Found ${posts.length} posts to upload\n`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < posts.length; i++) {
    const item = posts[i]
    const record = item.record

    try {
      console.log(`[${i + 1}/${posts.length}] Uploading: "${record.Title}"`)

      const { error } = await supabase
        .from('Post')
        .insert([record])

      if (error) throw error

      console.log(`  ✓ Uploaded successfully\n`)
      successCount++

    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`)
      errorCount++
    }
  }

  console.log('═'.repeat(60))
  console.log('UPLOAD COMPLETE')
  console.log(`  Success: ${successCount}`)
  console.log(`  Errors:  ${errorCount}`)
  console.log('═'.repeat(60))

  if (successCount > 0) {
    console.log('\n✨ Posts are now live! Open your app to see them.')
  }
}

main().catch(err => {
  console.error('Upload failed:', err)
  process.exit(1)
})
