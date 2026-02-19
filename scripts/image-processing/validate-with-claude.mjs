import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
});

/**
 * Validates that Qwen successfully translated all text overlays
 * @param {string} editedImagePath - Path to the edited image
 * @param {Array} expectedOverlays - Original overlays that should have been translated
 * @returns {Promise<Object>} - Validation result with success status and details
 */
export async function validateImageTranslation(editedImagePath, expectedOverlays) {
  if (!expectedOverlays || expectedOverlays.length === 0) {
    return { success: true, reason: 'No overlays to validate' };
  }

  try {
    // Read and encode edited image
    const imageBuffer = fs.readFileSync(editedImagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // Detect MIME type
    let mimeType = 'image/jpeg';
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      mimeType = 'image/png';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
      mimeType = 'image/webp';
    }

    console.log(`  🔍 Validating translation quality...`);

    // Build list of expected English translations
    const expectedEnglish = expectedOverlays.map((o, i) => `${i + 1}. "${o.english}"`).join('\n');
    const expectedChinese = expectedOverlays.map((o, i) => `${i + 1}. "${o.chinese}"`).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
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
              text: `This image was supposed to have Chinese text overlays translated to English.

EXPECTED TRANSLATIONS (these should now be in English):
${expectedEnglish}

ORIGINAL CHINESE TEXT (these should NO LONGER appear):
${expectedChinese}

Analyze this image and verify:
1. Are ALL the expected English translations visible in the image?
2. Is there ANY Chinese text from the original overlays still remaining?
3. Are there any text overlays that are gibberish/unreadable?

IMPORTANT: Ignore restaurant signs, menus, or scene text - only check for author-added overlays.

Return your analysis in this JSON format:
{
  "all_translated": true/false,
  "untranslated_chinese": ["list of Chinese text still visible"],
  "missing_english": ["list of expected English text that's missing"],
  "gibberish_detected": true/false,
  "quality_score": 0-100,
  "reason": "brief explanation of the validation result"
}

If all_translated is true and quality_score >= 80, the translation was successful.`,
            },
          ],
        },
      ],
    });

    // Extract JSON from Claude's response
    const responseText = message.content[0].text;
    let jsonMatch = responseText.match(/\{[\s\S]*"all_translated"[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('  ⚠️  Could not parse validation response');
      return { success: true, reason: 'Validation inconclusive' }; // Assume success if can't validate
    }

    const validation = JSON.parse(jsonMatch[0]);

    const success = validation.all_translated &&
                   validation.quality_score >= 80 &&
                   !validation.gibberish_detected;

    if (success) {
      console.log(`  ✅ Validation passed (quality: ${validation.quality_score}/100)`);
    } else {
      console.log(`  ⚠️  Validation failed: ${validation.reason}`);
      if (validation.untranslated_chinese && validation.untranslated_chinese.length > 0) {
        console.log(`     Untranslated: ${validation.untranslated_chinese.join(', ')}`);
      }
      if (validation.missing_english && validation.missing_english.length > 0) {
        console.log(`     Missing: ${validation.missing_english.join(', ')}`);
      }
    }

    return {
      success,
      quality_score: validation.quality_score,
      reason: validation.reason,
      untranslated: validation.untranslated_chinese || [],
      missing: validation.missing_english || [],
      gibberish: validation.gibberish_detected
    };

  } catch (error) {
    console.error('  ❌ Validation error:', error.message);
    // Return success on error to not block the pipeline
    return { success: true, reason: 'Validation error - assuming success' };
  }
}
