import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
});

/**
 * Analyzes an image with Claude Vision API to detect and translate text overlays
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} - Analysis result with overlays array
 */
export async function analyzeImageText(imagePath) {
  try {
    // Read and encode image
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // Detect actual MIME type from file header (magic bytes)
    let mimeType = 'image/jpeg'; // default
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      mimeType = 'image/png';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
      mimeType = 'image/webp';
    }

    console.log(`  🔍 Analyzing image with Claude Vision...`);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Analyze this image THOROUGHLY and identify EVERY SINGLE text overlay that the post author added digitally (NOT scene text like restaurant signs or menus).

CRITICAL: You must find ALL overlays. Look carefully at the ENTIRE image for ANY digitally-added text.

IDENTIFY TWO TYPES OF TEXT:

1. AUTHOR OVERLAYS (translate these - find ALL of them):
   - Text boxes/bubbles with ANY colored background (yellow, white, black, red, blue, gray, green, pink, orange, etc.)
   - Digital captions/reviews added by the post creator
   - Text that's clearly overlaid on top of the photo
   - Small text overlays in corners or edges
   - Title text, headers, decorative text
   - Text with emojis or icons next to it
   - Event details, dates, locations, instructions in colored boxes
   - Any text that's NOT part of the actual photograph

2. SCENE TEXT (keep these unchanged):
   - Restaurant signs, menus, food packaging
   - Text that's part of the actual photo/scene (embedded in the physical environment)
   - Street signs, storefronts
   - Text on buildings, walls, or products in the photo

For EACH author overlay you find, provide:
1. The exact Chinese text
2. Natural, authentic English translation (as a foreigner would say it)
3. Whether it's an author overlay (true) or scene text (false)
4. APPROXIMATE position as percentage from top-left corner - ESTIMATE if you can
5. APPROXIMATE size as percentage of image dimensions - ESTIMATE if you can

Return VALID JSON (no trailing commas, proper escaping):
{
  "overlays": [
    {
      "chinese": "温州朋友带我来的",
      "english": "My Wenzhou friend brought me here",
      "isAuthorOverlay": true,
      "position": { "x_percent": 10, "y_percent": 5 },
      "size": { "width_percent": 40, "height_percent": 8 }
    }
  ]
}

If you cannot estimate position/size, omit those fields. Always return valid JSON.

If there are NO author-added text overlays, return: {"overlays": []}

Be accurate - these translations and positions will be used to edit the image.`,
            },
          ],
        },
      ],
    });

    // Extract the JSON from Claude's response
    let responseText = message.content[0].text.trim();

    // Strip markdown code fences if present
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Try to extract JSON from the response
    let jsonMatch = responseText.match(/\{[\s\S]*"overlays"[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, assume no overlays
      console.log('  ℹ️  No text overlays detected in image');
      return { overlays: [] };
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      // JSON parsing failed - try to clean it up
      console.log(`  ⚠️  JSON parse error, trying to clean up...`);
      let cleanedJson = jsonMatch[0]
        .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
        .replace(/:\s*'/g, ': "')        // Replace single quotes
        .replace(/'\s*,/g, '",')
        .replace(/'\s*}/g, '"}');

      try {
        analysis = JSON.parse(cleanedJson);
      } catch (secondError) {
        // Last resort: try to fix truncated JSON by closing open brackets
        console.log(`  ⚠️  Attempting truncated JSON recovery...`);
        try {
          // Find where valid JSON ends and close the structure
          let truncated = cleanedJson;
          // Remove any trailing incomplete object (after last complete },)
          truncated = truncated.replace(/,\s*\{[^}]*$/, '');
          // Count open/close brackets and close any remaining
          const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
          const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
          truncated += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
          analysis = JSON.parse(truncated);
          console.log(`  ✅ Recovered truncated JSON successfully`);
        } catch (thirdError) {
          console.log(`  ⚠️  Could not parse JSON, assuming no overlays`);
          return { overlays: [] };
        }
      }
    }

    // Filter to only author overlays
    const authorOverlays = analysis.overlays.filter(o => o.isAuthorOverlay);

    console.log(`  ✅ Found ${authorOverlays.length} author overlay(s)`);
    authorOverlays.forEach((overlay, i) => {
      console.log(`    ${i + 1}. "${overlay.chinese}" → "${overlay.english}"`);
    });

    return { overlays: authorOverlays };

  } catch (error) {
    console.error('  ❌ Claude Vision analysis failed:', error.message);
    // Return empty overlays on error - continue processing without text translation
    return { overlays: [] };
  }
}
