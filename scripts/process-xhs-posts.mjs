// process-xhs-posts.mjs
// Pipeline: Scraped XHS JSON → Claude API (filter + translate) → Supabase-ready JSON
//
// Usage: node scripts/process-xhs-posts.mjs [path-to-scraped-json]
// Example: node scripts/process-xhs-posts.mjs ../projects/xiaohongshu-scraper-test/data/xhs/json/search_contents_2026-02-09.json

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Load .env from project root
dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') })

const anthropic = new Anthropic({ apiKey: process.env.VITE_ANTHROPIC_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// ─── FILTERING KNOWLEDGE ─────────────────────────────────────────────
const FILTERING_KNOWLEDGE = `
You are filtering Xiaohongshu posts for "Shanghai Discovery" - helping foreigners discover LOCAL Shanghai experiences.

TARGET AUDIENCE:
- Foreigners living in/visiting Shanghai
- Want AUTHENTIC local experiences (not generic expat stuff)
- Language barriers are OK - authenticity > convenience
- Interested in where locals actually go

INCLUDE (relevant posts):
✅ New restaurant/cafe/bar openings (<3 months)
✅ Upcoming events (concerts, markets, festivals, pop-ups)
✅ Trending local spots (where Shanghai locals love)
✅ Hidden gems (小巷里, back alleys, local neighborhoods)
✅ Seasonal activities & limited-time events
✅ Underground/indie culture (art spaces, live music)
✅ Traditional local food spots (even if no English!)
✅ Even tourist spots IF they have new/seasonal events

EXCLUDE (spam/irrelevant):
❌ Generic tourist guides ("外滩一日游", "豫园攻略")
❌ Ads/spam/promotions asking for DMs
❌ Personal lifestyle content (OOTD, makeup, vlogs)
❌ Product reviews unrelated to experiences
❌ Expat bubble Western chains (Starbucks, McDonald's)
❌ Resellers/group buys (团购/代购)
❌ Posts with "加微信" for discounts

PRIORITY DISTRICTS:
- Jing'an (静安) - trendy, artsy
- Xuhui (徐汇) - French Concession, culture
- Huangpu (黄浦) - central (but needs specific event/reason)
- Yangpu (杨浦) - university, indie scene
- Changning (长宁) - residential, authentic local

RED FLAGS (spam):
- "加微信" + phone number
- "团购" / "代购"
- "私信我" for discounts
- Excessive promotional emojis (>10)

GREEN FLAGS (high value):
- "本地人推荐" (local recommendation)
- "新开" (newly opened)
- "爆火" / "最近很火" (trending)
- "藏在小巷" (hidden in alley)
- "只有本地人知道" (only locals know)
- "不用排队" (no tourist crowds)
- Specific street addresses (路/街/弄/号)
- "老味道" (traditional/authentic taste)

NOTE ON LANGUAGE:
- English-speaking staff is a BONUS, not required
- Don't penalize posts for lack of English

NOTE ON LOCATION:
- Check BOTH location field AND caption text for addresses
- Caption might say: "在永福路45号" or "地址：南京西路123号"
- Text address = as good as GPS coordinates

NOTE ON TOURIST SPOTS:
- Tourist spots are usually boring
- BUT include them IF they have new seasonal events, exhibitions, installations, pop-ups
- "外滩" alone = boring, "外滩圣诞集市" = interesting

SCORING SYSTEM (0-100):

Base caption relevance: 0-40 points
+ Engagement: 0-20 points (100-500 likes=5, 500-1000=10, 1000-2000=15, 2000+=20)
+ Recency: 0-15 points (<7 days=15, 7-14=10, 14-30=5, >30=0)
+ Location: 0-15 points (specific address in location OR caption=10, priority district=5)
+ Visual quality: 0-10 points (3+ images=10, 1-2=5, none=0)

EDGE CASE - Trending but vague caption:
If 1000+ likes, multiple images, recent, has location → still score 60+, mark as "trending_investigate"
`

// ─── HELPER: Parse JSON from Claude (strips markdown code fences) ────
function parseJsonResponse(text) {
  let clean = text.trim()
  // Strip ```json ... ``` or ``` ... ```
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  return JSON.parse(clean)
}

// ─── STEP 1: FILTER + SCORE ──────────────────────────────────────────
async function filterPost(post) {
  const imageCount = post.image_list ? post.image_list.split(',').filter(Boolean).length : 0
  const publishDate = new Date(post.time)



  const prompt = `
Analyze this Xiaohongshu post and decide if it's relevant for Shanghai Discovery.

POST DATA:
- Title: ${post.title}
- Description: ${post.desc}
- Tags: ${post.tag_list}
- Likes: ${post.liked_count}
- Collects: ${post.collected_count}
- Comments: ${post.comment_count}
- Location (IP): ${post.ip_location}
- Published: ${publishDate.toISOString()}
- Image count: ${imageCount}
- Author: ${post.nickname}

${FILTERING_KNOWLEDGE}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "relevant": true/false,
  "score": 0-100,
  "category": "events|food|nightlife|art|trending|none",
  "reason": "brief explanation",
  "red_flags": [],
  "green_flags": [],
  "location_source": "field|caption|comment|none",
  "extracted_address": "address found in text or null",
  "extracted_district": "district name or null",
  "location_needs_verification": true/false,
  "requires_manual_review": true/false
}
`
 
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = message.content[0].text.trim()
  return parseJsonResponse(text)
}

// ─── STEP 2: TRANSLATE TO ENGLISH ────────────────────────────────────
async function translatePost(post, filterResult) {
  const prompt = `
Translate this Chinese Xiaohongshu post for English-speaking foreigners in Shanghai.

TITLE: ${post.title}
DESCRIPTION: ${post.desc}
CATEGORY: ${filterResult.category}

Respond with ONLY valid JSON (no markdown):
{
  "title_en": "Catchy English title (short, engaging)/ or it could also be the original title if it works well in English(try to keep originality more since ai sometimes makes it to scripted(avoid too scripted)",
  "description_en": "Natural English translation of the description. Keep street names in pinyin. Keep specific Chinese names as-is with English explanation. Make it feel like a local tip, not a textbook translation.",
  "practical_tips": "1-2 practical tips for foreigners (how to get there, what to order, any language tips)"
}
`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  })

  return parseJsonResponse(message.content[0].text.trim())
}

// ─── STEP 2.5: READ LOCAL IMAGES & UPLOAD ALL TO SUPABASE STORAGE ────────
async function uploadAllImagesToSupabase(noteId) {
  try {
    // Path to MediaCrawler's downloaded images
    const imageFolderPath = path.resolve('C:/Users/Lenovo/projects/xiaohongshu-scraper-test/data/xhs/images', noteId)

    // Check if folder exists
    if (!fs.existsSync(imageFolderPath)) {
      throw new Error(`Image folder not found: ${imageFolderPath}`)
    }

    // Get all image files in the folder
    const imageFiles = fs.readdirSync(imageFolderPath)
      .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .sort()  // Sort to maintain consistent order

    if (imageFiles.length === 0) {
      throw new Error('No image files found in folder')
    }

    console.log(`  → Found ${imageFiles.length} image(s), uploading all...`)

    // Upload ALL images
    const uploadedUrls = []
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i]
      const localImagePath = path.join(imageFolderPath, imageFile)
      const buffer = fs.readFileSync(localImagePath)

      // Generate unique filename with index to preserve order
      const fileExt = path.extname(imageFile).slice(1) || 'jpg'
      const fileName = `${noteId}-${i}-${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('post-images')
        .upload(fileName, buffer, {
          contentType: `image/${fileExt}`,
          upsert: false
        })

      if (error) {
        console.warn(`  ⚠️  Failed to upload image ${i + 1}/${imageFiles.length}: ${error.message}`)
        continue  // Skip this image but continue with others
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName)

      uploadedUrls.push(publicUrl)
    }

    if (uploadedUrls.length === 0) {
      throw new Error('All image uploads failed')
    }

    console.log(`  → Successfully uploaded ${uploadedUrls.length}/${imageFiles.length} image(s)`)
    return uploadedUrls  // Return array of URLs

  } catch (err) {
    console.error(`  ⚠️  Image upload failed: ${err.message}`)
    return []  // Return empty array on failure
  }
}

// ─── STEP 3: BUILD SUPABASE RECORD ──────────────────────────────────
function buildSupabaseRecord(post, filterResult, translation, hostedImageUrls) {
  return {
    Title: translation.title_en,
    description_en: translation.description_en,
    description_cn: post.desc,
    image_url: hostedImageUrls[0] || null,  // First image for backwards compatibility
    all_images: hostedImageUrls,  // Array of all image URLs
    xiaohongshu_url: post.note_url,
    location_name: filterResult.extracted_address || post.ip_location || null,
    location_address: filterResult.extracted_address || null,
    district: filterResult.extracted_district || null,
    category: filterResult.category,
    type: post.type === 'video' ? 'video' : 'image',
    practical_tips: translation.practical_tips,
    original_author: post.nickname,
  }
}

// ─── MAIN PIPELINE ──────────────────────────────────────────────────
async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: node scripts/process-xhs-posts.mjs <path-to-scraped-json>')
    console.error('Example: node scripts/process-xhs-posts.mjs ../projects/xiaohongshu-scraper-test/data/xhs/json/search_contents_2026-02-09.json')
    process.exit(1)
  }

  const resolvedPath = path.resolve(inputPath)
  console.log(`\nReading scraped data from: ${resolvedPath}`)

  const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
  const posts = Array.isArray(raw) ? raw : [raw]
  console.log(`Found ${posts.length} posts to process\n`)

  const results = { accepted: [], rejected: [], errors: [] }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    const label = `[${i + 1}/${posts.length}]`

    try {
      // Step 1: Filter
      console.log(`${label} Filtering: "${post.title.slice(0, 40)}..."`)
      const filterResult = await filterPost(post)
      console.log(`  → Score: ${filterResult.score}, Relevant: ${filterResult.relevant}, Category: ${filterResult.category}`)
      console.log(`  → Reason: ${filterResult.reason}`)

      if (!filterResult.relevant || filterResult.score < 40) {
        console.log(`  ✗ Rejected\n`)
        results.rejected.push({ note_id: post.note_id, title: post.title, ...filterResult })
        continue
      }

      // Step 2: Translate
      console.log(`  → Translating...`)
      const translation = await translatePost(post, filterResult)
      console.log(`  → EN Title: "${translation.title_en}"`)

      // Step 2.5: Upload ALL local images to Supabase
      let hostedImageUrls = []
      const images = post.image_list ? post.image_list.split(',').filter(Boolean) : []
      if (images.length > 0) {
        hostedImageUrls = await uploadAllImagesToSupabase(post.note_id)
      }

      // Step 3: Build record
      const record = buildSupabaseRecord(post, filterResult, translation, hostedImageUrls)
      results.accepted.push({
        record,
        score: filterResult.score,
        filter: filterResult,
        original: { note_id: post.note_id, title: post.title }
      })
      console.log(`  ✓ Accepted (score: ${filterResult.score})\n`)

      // Rate limit: ~1 second between posts to avoid API throttling
      if (i < posts.length - 1) await sleep(1000)

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}\n`)
      results.errors.push({ note_id: post.note_id, title: post.title, error: err.message })
    }
  }

  // ─── Summary ───────────────────────────────────────────────────
  console.log('═'.repeat(60))
  console.log(`PIPELINE COMPLETE`)
  console.log(`  Accepted: ${results.accepted.length}`)
  console.log(`  Rejected: ${results.rejected.length}`)
  console.log(`  Errors:   ${results.errors.length}`)
  console.log('═'.repeat(60))

  if (results.accepted.length === 0) {
    console.log('\nNo posts passed filtering. Nothing to upload.')
    return
  }

  // Sort by score (highest first)
  results.accepted.sort((a, b) => b.score - a.score)

  // Show preview before uploading
  console.log('\nPosts ready to upload:')
  results.accepted.forEach((item, i) => {
    console.log(`  ${i + 1}. [${item.score}] ${item.record.Title} (${item.record.category})`)
  })

  // Save full results to file for reference
  const outputPath = path.resolve(import.meta.dirname, '..', 'data', 'pipeline-output.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nFull results saved to: ${outputPath}`)

  // Ask user to confirm upload
  console.log(`\nTo upload these ${results.accepted.length} posts to Supabase, run:`)
  console.log(`  node scripts/upload-to-supabase.mjs`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})
