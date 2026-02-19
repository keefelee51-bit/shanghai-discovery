import vision from '@google-cloud/vision';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Google Vision client with explicit credentials from .env
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Minimum text block size (percentage of image) — skip tiny text
const MIN_WIDTH_PERCENT = 2;
const MIN_HEIGHT_PERCENT = 1.5;

/**
 * Call Haiku to filter and translate a set of text blocks
 * Returns parsed overlays object or null if JSON parsing fails
 */
async function callHaikuForOverlays(textBlocks, base64Image, mimeType) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: `I detected ${textBlocks.length} text blocks in this image. Your task:

1. **Filter** - Identify which are AUTHOR-ADDED overlays (not scene text)
2. **Translate** - Provide natural English translations. Handle Chinese internet slang naturally (e.g. "绝绝子" → "absolutely amazing", "yyds" → "the GOAT", "种草" → "must-try").

**AUTHOR-ADDED TEXT** (include these):
- Text labels, captions, commentary added BY THE POST AUTHOR
- Decorative text, stickers, or graphics overlaid on the photo
- Handwritten notes or digital text added after the photo

**SCENE TEXT** (exclude these):
- Restaurant signs, menus, food packaging
- Text that's part of the actual photo/scene
- Street signs, storefronts, product labels
- Very small watermarks or timestamps
- Emoji-only or symbol-only blocks (④, ●, ☆, ◎, 🕐) with no meaningful text

**Detected text blocks:**
${textBlocks.map(t => `[${t.index}] "${t.text}" at (${t.x}, ${t.y}, ${t.width}x${t.height})`).join('\n')}

For each author overlay, return: {"index": N, "chinese": "original text", "english": "translation"}
Return ONLY author overlay indices with translations as valid JSON. No markdown, no explanation.
Return {"overlays": []} if no author overlays found.`,
          },
        ],
      },
      {
        role: 'assistant',
        content: '{"overlays": ['
      },
    ],
  });

  if (message.stop_reason === 'max_tokens') {
    console.log(`  ⚠️  Haiku response was TRUNCATED (hit max_tokens)`);
  }

  const responseText = message.content[0].text;
  const fullJson = '{"overlays": [' + responseText;

  try {
    return JSON.parse(fullJson);
  } catch (parseError) {
    // Try cleanup (trailing commas, single quotes)
    let cleanedJson = fullJson
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/:\s*'/g, ': "')
      .replace(/'\s*,/g, '",')
      .replace(/'\s*}/g, '"}');

    try {
      return JSON.parse(cleanedJson);
    } catch (secondError) {
      // Try truncation recovery (close open brackets)
      try {
        let truncated = cleanedJson.replace(/,\s*\{[^}]*$/, '');
        const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
        const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
        truncated += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
        const recovered = JSON.parse(truncated);
        console.log(`  ✅ Recovered truncated JSON`);
        return recovered;
      } catch (thirdError) {
        console.log(`  ⚠️  JSON parse failed for ${textBlocks.length} text blocks`);
        return null;
      }
    }
  }
}

/**
 * Analyze image with Google Cloud Vision documentTextDetection to get paragraph-level text blocks
 * Then use Claude Haiku to filter author overlays and translate
 *
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} - Analysis with overlays array
 */
export async function analyzeImageWithGoogle(imagePath) {
  try {
    // STEP 1: Google Vision Document Text Detection — returns paragraphs/blocks, not individual words
    const [result] = await visionClient.documentTextDetection(imagePath);
    const fullAnnotation = result.fullTextAnnotation;

    if (!fullAnnotation || !fullAnnotation.pages || fullAnnotation.pages.length === 0) {
      console.log('  ℹ️  No text detected by Google Vision');
      return { overlays: [] };
    }

    // Get image dimensions for percentage calculations
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imagePath).metadata();
    const { width: imgWidth, height: imgHeight } = metadata;

    // Extract paragraph-level text blocks with bounding boxes
    const textBlocks = [];
    for (const page of fullAnnotation.pages) {
      for (const block of page.blocks) {
        for (const paragraph of block.paragraphs) {
          // Combine all words in the paragraph into one text string
          const text = paragraph.words
            .map(word => word.symbols.map(s => s.text).join(''))
            .join('');

          // Get bounding box from paragraph vertices
          const vertices = paragraph.boundingBox.vertices;
          const x = vertices[0].x || 0;
          const y = vertices[0].y || 0;
          const x2 = vertices[2].x || 0;
          const y2 = vertices[2].y || 0;
          const width = x2 - x;
          const height = y2 - y;

          // Calculate percentages
          const width_percent = (width / imgWidth) * 100;
          const height_percent = (height / imgHeight) * 100;

          // Skip tiny text (scene text like small signs, watermarks, etc.)
          if (width_percent < MIN_WIDTH_PERCENT && height_percent < MIN_HEIGHT_PERCENT) {
            continue;
          }

          textBlocks.push({
            index: textBlocks.length,
            text,
            x, y, width, height,
            x_percent: (x / imgWidth) * 100,
            y_percent: (y / imgHeight) * 100,
            width_percent,
            height_percent
          });
        }
      }
    }

    if (textBlocks.length === 0) {
      console.log('  ℹ️  No significant text blocks detected');
      return { overlays: [] };
    }

    console.log(`  🔍 Google Vision detected ${textBlocks.length} paragraph-level text block(s)`);

    // STEP 2: Claude Haiku - Filter author overlays and translate
    // Read image for Claude analysis
    const fs = await import('fs');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Detect MIME type from actual file bytes (not file extension)
    let mimeType = 'image/jpeg';
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      mimeType = 'image/png';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
      mimeType = 'image/webp';
    }

    // Try single Haiku call first, fall back to batched calls if JSON parse fails
    let filteredOverlays = await callHaikuForOverlays(textBlocks, base64Image, mimeType);

    if (!filteredOverlays) {
      // Batched fallback: split text blocks into smaller groups
      const BATCH_SIZE = 15;
      console.log(`  🔄 Retrying with batched analysis (${BATCH_SIZE} blocks per batch)...`);
      const allOverlays = [];

      for (let start = 0; start < textBlocks.length; start += BATCH_SIZE) {
        const batch = textBlocks.slice(start, start + BATCH_SIZE);
        const batchResult = await callHaikuForOverlays(batch, base64Image, mimeType);
        if (batchResult) {
          allOverlays.push(...batchResult.overlays);
        }
      }

      filteredOverlays = { overlays: allOverlays };
    }

    // STEP 3: Map back to full overlay objects with bounding boxes
    const overlays = filteredOverlays.overlays.map(overlay => {
      const textBlock = textBlocks[overlay.index];
      if (!textBlock) return null;

      // Use Google Vision's text as Chinese source (reliable), normalize Haiku's translation field
      const chinese = overlay.chinese || overlay.text || overlay.original || textBlock.text;
      const english = overlay.english || overlay.translation || overlay.translated || chinese;

      return {
        chinese,
        english,
        isAuthorOverlay: true,
        position: { x_percent: textBlock.x_percent, y_percent: textBlock.y_percent },
        size: { width_percent: textBlock.width_percent, height_percent: textBlock.height_percent }
      };
    }).filter(Boolean);

    console.log(`  ✅ Found ${overlays.length} author overlay(s)`);
    overlays.forEach((overlay, i) => {
      console.log(`    ${i + 1}. "${overlay.chinese}" → "${overlay.english}"`);
    });

    return { overlays };

  } catch (error) {
    console.error('  ❌ Google Vision analysis failed:', error.message);
    return { overlays: [] };
  }
}
