/**
 * PART 2: Translate Chinese Speech Segments to English
 *
 * HOW IT WORKS:
 * Takes the Chinese transcription from Part 1 (Whisper) and translates each
 * segment to natural, conversational English suitable for video dubbing.
 *
 * WHY GPT-4o-mini?
 * - 20x cheaper than Claude ($0.15/MTok input vs $3/MTok)
 * - Excellent at translation (specialized task, doesn't need advanced reasoning)
 * - Fast responses (~1s per segment)
 * - Same OpenAI account as Whisper (consistency)
 *
 * TRANSLATION CHALLENGES:
 * 1. Cultural references: "打卡" → "must-visit" (not literal "check-in")
 * 2. Timing constraints: English must fit roughly same duration as Chinese
 * 3. Natural speech: Casual tone, not formal written translation
 * 4. Shanghai-specific terms: Keep local flavor (e.g., "The Bund" not "外滩")
 *
 * Cost per video (6 segments):
 * - Input: ~500 tokens/segment × 6 = 3000 tokens = $0.00045
 * - Output: ~50 tokens/segment × 6 = 300 tokens = $0.00018
 * - Total: ~$0.0006 per video (basically free!)
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '..', '.env') });

/**
 * Translate an array of Chinese speech segments to English
 *
 * @param {Array} segments - Segments from Whisper with {text, start, end}
 * @returns {Promise<Array>} - Segments with chinese, english, start, end, duration
 */
export async function translateSegments(segments) {
  // ── STEP 1: Validate ─────────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in .env file');
  }

  if (!segments || segments.length === 0) {
    console.log('  ℹ️  No segments to translate');
    return [];
  }

  console.log(`  🌐 Translating ${segments.length} segment(s) to English...`);

  // ── STEP 2: Initialize OpenAI client ──────────────────────────────────────
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ── STEP 3: Translate each segment ────────────────────────────────────────
  const translated = [];
  let totalCost = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const duration = segment.end - segment.start;

    console.log(`  [${i + 1}/${segments.length}] Translating: "${segment.text.substring(0, 30)}..."`);

    try {
      const english = await translateSegment(openai, segment.text, duration);

      translated.push({
        chinese: segment.text,
        english,
        start: segment.start,
        end: segment.end,
        duration,
      });

      // Track cost (rough estimate)
      // Input: ~100 tokens (prompt) + Chinese text (~20 tokens/segment)
      // Output: ~50 tokens/segment
      const inputTokens = 100 + (segment.text.length / 2); // Rough Chinese token estimate
      const outputTokens = english.length / 4; // Rough English token estimate
      const segmentCost = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;
      totalCost += segmentCost;

      // Rate limiting — be nice to the API (though GPT-4o-mini is fast)
      if (i < segments.length - 1) {
        await sleep(500); // 0.5s between calls
      }

    } catch (error) {
      console.error(`  ❌ Translation failed for segment ${i + 1}: ${error.message}`);
      // Fallback: use original Chinese text if translation fails
      translated.push({
        chinese: segment.text,
        english: segment.text, // Fallback to Chinese
        start: segment.start,
        end: segment.end,
        duration,
      });
    }
  }

  console.log(`  ✅ Translation complete`);
  console.log(`  💰 Estimated cost: $${totalCost.toFixed(6)}`);

  return translated;
}

/**
 * Translate a single Chinese segment to natural English
 * Handles cultural references and timing constraints
 */
async function translateSegment(openai, chineseText, duration) {
  // ── Build the translation prompt ──────────────────────────────────────────
  // This prompt is carefully designed to:
  // 1. Produce natural, conversational English (not formal/stiff)
  // 2. Handle Chinese internet slang and cultural terms
  // 3. Keep translations concise (important for dubbing timing)
  // 4. Return ONLY the translation (no extra text)

  // Calculate word count target based on duration.
  // English dubbing with ElevenLabs runs at roughly 2.5 words/second.
  // Example: 3.0s segment → max 8 words, 5.0s segment → max 12 words.
  // We set this as a hard cap so the TTS audio fits inside the original slot.
  const maxWords = Math.round(duration * 2.5);

  const prompt = `Translate this Chinese speech segment to natural, conversational English for video dubbing.

CRITICAL CONSTRAINTS:
1. MAXIMUM ${maxWords} WORDS — this is a hard limit, do not exceed it
   (The original is ${duration.toFixed(1)}s, English TTS speaks ~2.5 words/sec)
2. Prefer shorter over complete — cut filler words, drop redundancy
   Bad:  "This place is really amazing and you absolutely must come visit"
   Good: "This place is amazing, you have to visit"
3. Use casual, natural speech (not formal written translation)
4. Handle cultural references naturally:
   - "打卡" → "check out" or "visit" (not literal "check-in")
   - "网红" → "popular" or "trending" (not "internet famous")
   - "好吃" → "Delicious!" or "So good!" (casual, enthusiastic)
   - "外滩" → "The Bund" (keep English name)
   - Keep place names in English if commonly known
5. Match the tone and energy of the original

Original Chinese: "${chineseText}"
Duration: ${duration.toFixed(1)}s | Max words: ${maxWords}

Give ONLY the English translation, nothing else. No quotes, no explanation.`;

  // ── Call GPT-4o-mini ──────────────────────────────────────────────────────
  // Model: gpt-4o-mini
  // - Optimized for translation and simple tasks
  // - Much cheaper than gpt-4o ($0.15/$0.60 vs $2.50/$10 per MTok)
  // - Very fast (usually <1s response time)
  //
  // Temperature: 0.3
  // - Lower temperature = more consistent, less creative
  // - For translation, we want consistency, not creativity
  //
  // max_tokens: 100
  // - Most segments translate to <50 tokens
  // - Capping at 100 saves cost and ensures conciseness

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator specializing in Chinese-to-English video dubbing. You produce natural, conversational translations that match the speaking duration and cultural context.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 100,
  });

  // ── Extract translation ───────────────────────────────────────────────────
  const translation = response.choices[0].message.content.trim();

  // Remove quotes if GPT added them (sometimes it does despite instructions)
  const cleaned = translation.replace(/^["']|["']$/g, '');

  return cleaned;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
