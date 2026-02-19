import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_API_BASE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/**
 * Edits an image using Qwen API with specific translation instructions from Claude
 * @param {string} imagePath - Path to the input image
 * @param {Array} overlays - Array of overlay objects from Claude analysis
 * @param {string} outputPath - Path to save the edited image
 * @returns {Promise<string>} - Path to the edited image
 */
export async function editImageWithQwen(imagePath, overlays, outputPath) {
  if (!QWEN_API_KEY || QWEN_API_KEY.startsWith('your-')) {
    console.log('  ⚠️  QWEN_API_KEY not set - skipping image text translation');
    return imagePath; // Return original image
  }

  if (!overlays || overlays.length === 0) {
    console.log('  ℹ️  No text overlays to translate - using original image');
    return imagePath; // Return original image
  }

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

    const imageDataUri = `data:${mimeType};base64,${imageBase64}`;

    console.log(`  🎨 Editing image with Qwen (${overlays.length} overlay(s))...`);

    // Build specific instructions from Claude's analysis
    let instructions = 'Edit this image by REPLACING Chinese text overlays with English translations.\n\n';
    instructions += 'CRITICAL: You must REMOVE the original Chinese text completely and replace it with English. Do NOT keep both languages.\n\n';

    overlays.forEach((overlay, i) => {
      instructions += `${i + 1}. REMOVE "${overlay.chinese}" and REPLACE with "${overlay.english}" (${overlay.location})\n`;
    });

    instructions += `\nIMPORTANT RULES:
1. REMOVE the original Chinese text completely - do not keep it
2. REPLACE with the English translation in the exact same position
3. Match the EXACT styling of the original text (font, color, size, position, rotation)
4. Keep the background boxes and styling exactly the same
5. The result should have ONLY English text, NO Chinese text
6. DO NOT translate or modify restaurant signs, menus, or scene text (those stay in Chinese)
7. The English translations MUST be clear and readable (not gibberish)

CRITICAL: The final image must have ONLY the English translation, NOT both Chinese and English together.
Make the image look natural, as if it was originally created with English text.`;

    // Submit to Qwen API
    const submitResponse = await axios.post(
      QWEN_API_BASE,
      {
        model: 'qwen-image-edit-max',
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { image: imageDataUri },
                { text: instructions }
              ]
            }
          ]
        },
        parameters: {
          n: 1,
          size: '1024*1024'
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${QWEN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 120 second timeout for complex edits
      }
    );

    const result = submitResponse.data.output;

    if (!result || !result.choices || result.choices.length === 0) {
      console.error('  ❌ Qwen returned no results');
      return imagePath; // Return original on error
    }

    // Extract edited image URL
    const imageUrl = result.choices[0].message?.content?.find(c => c.image)?.image;

    if (!imageUrl) {
      console.error('  ❌ No image URL in Qwen response');
      return imagePath; // Return original on error
    }

    // Download the edited image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 120000, // 120 second timeout for large images
    });
    const imageData = Buffer.from(imageResponse.data);

    // Save edited image
    fs.writeFileSync(outputPath, imageData);

    const sizeMB = (imageData.length / 1024 / 1024).toFixed(2);
    console.log(`  ✅ Image edited successfully (${sizeMB} MB)`);

    return outputPath;

  } catch (error) {
    console.error('  ❌ Qwen image editing failed:', error.message);
    if (error.response?.data) {
      console.error('  ❌ Qwen error details:', JSON.stringify(error.response.data));
    }

    // Return original image on error - don't break the pipeline
    return imagePath;
  }
}
