// process-xhs-posts.mjs
// Pipeline: Scraped XHS/Weibo JSON → Claude API (filter + translate) → Supabase-ready JSON
//
// Usage: node scripts/process-xhs-posts.mjs <file1.json> [file2.json] [--limits N,M] [--limit N]
// Example (XHS only):       node scripts/process-xhs-posts.mjs ./scraper/data/xhs/json/search_contents_DATE.json --limit 15
// Example (XHS + Weibo):    node scripts/process-xhs-posts.mjs ./scraper/data/xhs/json/search_contents_DATE.json ./scraper/data/weibo/json/search_contents_DATE.json --limits 15,5

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import dotenv from 'dotenv'
import { analyzeImageWithGoogle } from './image-processing/analyze-with-google-vision.mjs'
import { editImageWithQwen } from './image-processing/edit-with-qwen.mjs'
import { validateImageTranslation } from './image-processing/validate-with-claude.mjs'
import { overlayTranslatedText } from './image-processing/simple-text-overlay.mjs'
import { dubVideo } from './video-processing/dub-video.mjs'
import ffmpeg from 'fluent-ffmpeg'

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
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' }
    ]
  })

  return parseJsonResponse('{' + message.content[0].text.trim())
}

// ─── HELPER: Download a video from a URL to a local file ──────────────────────
function downloadVideo(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath)
    const client = url.startsWith('https') ? https : http

    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Video download failed: HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {})
      reject(new Error(`Video download error: ${err.message}`))
    })
  })
}

// ─── HELPER: Get video duration in seconds via ffprobe ────────────────────────
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`))
      resolve(metadata.format.duration || 0)
    })
  })
}

// ─── HELPER: Upload dubbed video to Supabase storage ──────────────────────────
async function uploadVideoToSupabase(videoPath, noteId) {
  const buffer = fs.readFileSync(videoPath)
  const fileName = `${noteId}-${Date.now()}.mp4`

  const { error } = await supabase.storage
    .from('post-videos')
    .upload(fileName, buffer, {
      contentType: 'video/mp4',
      upsert: false
    })

  if (error) throw new Error(`Video upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('post-videos')
    .getPublicUrl(fileName)

  return publicUrl
}

// ─── STEP 2.5: READ LOCAL IMAGES, TRANSLATE TEXT, & UPLOAD TO SUPABASE STORAGE ────────
async function uploadAllImagesToSupabase(noteId, scraperImagesDir) {
  try {
    // scraperImagesDir is derived from the input JSON path (works both locally and on GitHub Actions)
    const imageFolderPath = path.join(scraperImagesDir, noteId)

    // Check if folder exists
    if (!fs.existsSync(imageFolderPath)) {
      throw new Error(`Image folder not found: ${imageFolderPath}`)
    }

    // Get all image files in the folder (exclude edited versions from previous runs)
    const imageFiles = fs.readdirSync(imageFolderPath)
      .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .filter(file => !file.startsWith('edited-') && !file.startsWith('retry-') && !file.startsWith('overlay-'))
      .sort()  // Sort to maintain consistent order

    if (imageFiles.length === 0) {
      throw new Error('No image files found in folder')
    }

    console.log(`  → Found ${imageFiles.length} image(s), processing...`)

    // Upload ALL images (with text translation if needed)
    const uploadedUrls = []
    const OVERLAY_THRESHOLD = 5  // ≤5 → Qwen (aesthetic), >5 → Simple overlay

    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i]
      const localImagePath = path.join(imageFolderPath, imageFile)
      let finalImagePath = localImagePath

      // STEP A: Google Vision OCR + Haiku filter/translate (always, for every image)
      const textAnalysis = await analyzeImageWithGoogle(localImagePath)
      const overlayCount = textAnalysis.overlays ? textAnalysis.overlays.length : 0

      // STEP B: Route based on overlay count
      if (overlayCount > OVERLAY_THRESHOLD) {
        // Dense infographics: Simple text overlay (deterministic, no validation needed)
        console.log(`  📝 Image ${i + 1}/${imageFiles.length}: Simple overlay (${overlayCount} overlays)`)
        const overlayPath = path.join(imageFolderPath, `overlay-${imageFile}`)
        finalImagePath = await overlayTranslatedText(localImagePath, textAnalysis.overlays, overlayPath)

      } else if (overlayCount > 0) {
        // Few overlays: Qwen aesthetic edit + Haiku validation
        console.log(`  🎨 Image ${i + 1}/${imageFiles.length}: Qwen edit (${overlayCount} overlay(s))`)
        const editedPath = path.join(imageFolderPath, `edited-${imageFile}`)

        // First attempt
        let translatedPath = await editImageWithQwen(localImagePath, textAnalysis.overlays, editedPath)

        // Only validate if Qwen actually produced a new file (not the original)
        if (translatedPath !== localImagePath && fs.existsSync(translatedPath)) {
          const validation = await validateImageTranslation(translatedPath, textAnalysis.overlays)

          if (!validation.success) {
            console.log(`  🔄 Retrying Qwen with enhanced instructions...`)
            const retryPath = path.join(imageFolderPath, `retry-${imageFile}`)
            translatedPath = await editImageWithQwen(localImagePath, textAnalysis.overlays, retryPath)

            if (translatedPath !== localImagePath && fs.existsSync(translatedPath)) {
              const retryValidation = await validateImageTranslation(translatedPath, textAnalysis.overlays)
              if (!retryValidation.success) {
                console.log(`  ⚠️  Qwen retry failed validation - falling back to simple overlay`)
                const fallbackPath = path.join(imageFolderPath, `overlay-${imageFile}`)
                translatedPath = await overlayTranslatedText(localImagePath, textAnalysis.overlays, fallbackPath)
              }
            } else {
              // Qwen retry also failed to produce file
              console.log(`  ⚠️  Qwen retry failed - falling back to simple overlay`)
              const fallbackPath = path.join(imageFolderPath, `overlay-${imageFile}`)
              translatedPath = await overlayTranslatedText(localImagePath, textAnalysis.overlays, fallbackPath)
            }
          }
        } else {
          // Qwen failed entirely - fall back to simple overlay
          console.log(`  ⚠️  Qwen failed - falling back to simple overlay`)
          const fallbackPath = path.join(imageFolderPath, `overlay-${imageFile}`)
          translatedPath = await overlayTranslatedText(localImagePath, textAnalysis.overlays, fallbackPath)
        }

        finalImagePath = translatedPath
      } else {
        console.log(`  → Image ${i + 1}/${imageFiles.length}: No text overlays, using original`)
      }

      // STEP C: Upload final image (edited or original) to Supabase
      const buffer = fs.readFileSync(finalImagePath)

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

// ─── HELPER: Normalize Weibo fields → XHS-compatible field names ────
function normalizePost(post, platform) {
  if (platform !== 'weibo') return post
  return {
    ...post,
    title: (post.content || '').substring(0, 50),
    desc: post.content || '',
    type: 'normal',
    time: (post.create_time || 0) * 1000,   // seconds → milliseconds
    comment_count: post.comments_count || '0',
    share_count: post.shared_count || '0',
    image_list: '',     // Weibo store doesn't capture image URLs
    video_url: null,
    tag_list: '',
  }
}

// ─── STEP 3: BUILD SUPABASE RECORD ──────────────────────────────────
function buildSupabaseRecord(post, filterResult, translation, hostedImageUrls, dubbedVideoUrl) {
  return {
    platform: post._platform || 'xiaohongshu',
    author_avatar: post.avatar || null,
    Title: translation.title_en,
    description_en: translation.description_en,
    description_cn: post.desc,
    image_url: hostedImageUrls[0] || null,
    all_images: hostedImageUrls.length > 0 ? hostedImageUrls : null,
    video_url: dubbedVideoUrl || null,
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
  // Collect positional file paths (everything before first --flag)
  const inputPaths = []
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) break
    inputPaths.push(process.argv[i])
  }

  if (inputPaths.length === 0) {
    console.error('Usage: node scripts/process-xhs-posts.mjs <file1.json> [file2.json] [--limits N,M] [--limit N]')
    console.error('Example (XHS only):    node scripts/process-xhs-posts.mjs ./scraper/data/xhs/json/search_contents_DATE.json --limit 15')
    console.error('Example (XHS + Weibo): node scripts/process-xhs-posts.mjs ./scraper/data/xhs/json/FILE.json ./scraper/data/weibo/json/FILE.json --limits 15,5')
    process.exit(1)
  }

  // Parse --limits (per-source, comma-separated) or --limit (global fallback)
  let perSourceLimits = []
  const limitsIdx = process.argv.indexOf('--limits')
  if (limitsIdx !== -1 && process.argv[limitsIdx + 1]) {
    perSourceLimits = process.argv[limitsIdx + 1].split(',').map(n => parseInt(n, 10))
  }

  let globalLimit = null
  const limitIdx = process.argv.indexOf('--limit')
  if (limitIdx !== -1 && process.argv[limitIdx + 1]) {
    globalLimit = parseInt(process.argv[limitIdx + 1], 10)
    if (isNaN(globalLimit) || globalLimit <= 0) globalLimit = null
  }

  // forceIds disabled — define empty set to avoid reference errors
  const forceIds = new Set()

  // Max videos per run (Demucs is slow on CI, cap to avoid timeout)
  const MAX_VIDEOS = process.env.CI ? 7 : Infinity

  // Load all sources, tagging each post with _platform and _scraperImagesDir
  // JSON path: .../data/xhs/json/search_contents_DATE.json  → platform='xiaohongshu'
  // JSON path: .../data/weibo/json/search_contents_DATE.json → platform='weibo'
  const sources = []
  for (const inputPath of inputPaths) {
    const resolvedPath = path.resolve(inputPath)
    const platformFolder = path.basename(path.dirname(path.dirname(resolvedPath)))
    const platform = platformFolder === 'xhs' ? 'xiaohongshu' : platformFolder
    const scraperImagesDir = path.join(path.dirname(path.dirname(resolvedPath)), 'images')

    console.log(`\nReading ${platform} data from: ${resolvedPath}`)
    const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'))
    const posts = (Array.isArray(raw) ? raw : [raw]).map(p => ({
      ...normalizePost(p, platform),
      _platform: platform,
      _scraperImagesDir: scraperImagesDir,
    }))
    console.log(`Found ${posts.length} posts from ${platform}`)
    sources.push({ posts, platform })
  }

  const results = { accepted: [], rejected: [], errors: [] }
  let totalCost = 0
  let videoCount = 0

  for (const [srcIdx, source] of sources.entries()) {
    const { posts, platform } = source
    const sourceLimit = perSourceLimits[srcIdx] ?? globalLimit
    let sourceAccepted = 0

    if (sourceLimit) {
      console.log(`\n⚠️  [${platform}] Limiting to ${sourceLimit} ACCEPTED posts\n`)
    }
    console.log(`\nProcessing ${posts.length} ${platform} posts...\n`)

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]
      const label = `[${platform}][${i + 1}/${posts.length}]`

      // Stop if we've reached the accepted limit for this source
      if (sourceLimit && sourceAccepted >= sourceLimit) {
        console.log(`\n🎯 [${platform}] Reached limit of ${sourceLimit} accepted posts - stopping\n`)
        break
      }

      try {
        console.log(`${label} Checking: "${(post.title || '').slice(0, 40)}..."`)

        // Step 0a: Check for duplicates in database
        const { data: existingPost } = await supabase
          .from('Post')
          .select('id')
          .eq('id', post.note_id)
          .maybeSingle()

        if (existingPost) {
          console.log(`  ⏭️  Already exists in database - skipping\n`)
          results.rejected.push({
            note_id: post.note_id,
            title: post.title,
            reason: 'Duplicate - already in database',
            relevant: false,
            score: 0,
            category: 'duplicate'
          })
          continue
        }

        // Step 1: Filter
        console.log(`  → Filtering...`)
        const filterResult = await filterPost(post)
        console.log(`  → Score: ${filterResult.score}, Relevant: ${filterResult.relevant}, Category: ${filterResult.category}`)
        console.log(`  → Reason: ${filterResult.reason}`)

        if ((!filterResult.relevant || filterResult.score < 40) && !forceIds.has(post.note_id)) {
          console.log(`  ✗ Rejected: ${filterResult.reason}\n`)
          results.rejected.push({ note_id: post.note_id, title: post.title, ...filterResult })
          continue
        }

        if (forceIds.has(post.note_id) && (!filterResult.relevant || filterResult.score < 40)) {
          console.log(`  ⚡ Force-included (would have been rejected: ${filterResult.reason})`)
        }

        // Step 2: Translate
        console.log(`  → Translating...`)
        const translation = await translatePost(post, filterResult)
        console.log(`  → EN Title: "${translation.title_en}"`)

        let record

        if (post.type === 'video' && post._platform !== 'weibo') {
          // ── VIDEO (XHS only): Download → Dub → Upload ─────────────────────
          if (videoCount >= MAX_VIDEOS) {
            console.log(`  ⏭️  Video cap reached (${MAX_VIDEOS}/run on CI) - skipping\n`)
            results.rejected.push({ note_id: post.note_id, title: post.title, reason: 'Video cap reached', score: filterResult.score })
            continue
          }

          console.log(`  🎬 Video post — starting dubbing pipeline...`)

          if (!post.video_url) {
            throw new Error('Video post has no video_url')
          }

          // Download video from CDN
          const tempDir = path.resolve(import.meta.dirname, '..', 'data', 'temp-videos')
          fs.mkdirSync(tempDir, { recursive: true })
          const rawVideoPath = path.join(tempDir, `${post.note_id}.mp4`)
          console.log(`  → Downloading video...`)
          await downloadVideo(post.video_url, rawVideoPath)

          // Skip videos longer than 60 seconds (too slow to dub on CI)
          const videoDuration = await getVideoDuration(rawVideoPath)
          if (videoDuration > 60) {
            console.log(`  ⏭️  Video too long (${videoDuration.toFixed(0)}s > 60s) - skipping\n`)
            fs.unlinkSync(rawVideoPath)
            results.rejected.push({ note_id: post.note_id, title: post.title, reason: `Video too long (${videoDuration.toFixed(0)}s)`, score: filterResult.score })
            continue
          }
          console.log(`  → Duration: ${videoDuration.toFixed(0)}s — OK`)

          // Run dubbing pipeline
          const videoOutputDir = path.resolve(import.meta.dirname, '..', 'data', 'video-processing', post.note_id)
          const { dubbedVideoPath, cost: videoCost } = await dubVideo(rawVideoPath, videoOutputDir)
          totalCost += videoCost

          // Upload dubbed video to Supabase storage
          console.log(`  → Uploading dubbed video to Supabase...`)
          const dubbedVideoUrl = await uploadVideoToSupabase(dubbedVideoPath, post.note_id)
          console.log(`  → Uploaded: ${dubbedVideoUrl}`)

          // Clean up temp raw video
          fs.unlinkSync(rawVideoPath)
          videoCount++

          record = buildSupabaseRecord(post, filterResult, translation, [], dubbedVideoUrl)

        } else {
          // ── IMAGE / TEXT (or Weibo — text only, no media download) ────────
          let hostedImageUrls = []
          const images = post.image_list ? post.image_list.split(',').filter(Boolean) : []
          if (images.length > 0 && post._platform !== 'weibo') {
            hostedImageUrls = await uploadAllImagesToSupabase(post.note_id, post._scraperImagesDir)
          }
          record = buildSupabaseRecord(post, filterResult, translation, hostedImageUrls, null)
        }

        results.accepted.push({
          record,
          score: filterResult.score,
          filter: filterResult,
          original: { note_id: post.note_id, title: post.title }
        })
        sourceAccepted++
        console.log(`  ✓ Accepted (score: ${filterResult.score})\n`)

        // Rate limit: ~1 second between posts to avoid API throttling
        if (i < posts.length - 1) await sleep(1000)

      } catch (err) {
        console.error(`  ✗ Error: ${err.message}\n`)
        results.errors.push({ note_id: post.note_id, title: post.title, error: err.message })
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────
  console.log('═'.repeat(60))
  console.log(`PIPELINE COMPLETE`)
  console.log(`  Accepted: ${results.accepted.length}`)
  console.log(`  Rejected: ${results.rejected.length}`)
  console.log(`  Errors:   ${results.errors.length}`)
  console.log(`  Total cost: $${totalCost.toFixed(4)}`)
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
