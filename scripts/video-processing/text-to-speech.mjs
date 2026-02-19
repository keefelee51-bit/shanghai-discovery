/**
 * PART 3: Generate English Speech Audio with ElevenLabs
 *
 * HOW IT WORKS:
 * Takes English translations from Part 2 and converts them to natural-sounding
 * speech audio using ElevenLabs' high-quality TTS (Text-to-Speech) API.
 *
 * WHY ELEVENLABS?
 * - Much more natural and expressive than generic TTS
 * - Great for social media / casual content (matches Xiaohongshu vibe)
 * - Handles emotion, emphasis, and pacing well
 * - Still affordable (~$0.05 per video vs $0.003 with OpenAI)
 *
 * VOICES AVAILABLE (use voice_id, not name):
 * - "21m00Tcm4TlvDq8ikWAM" - Rachel (calm American female, good for travel tips)
 * - "AZnzlk1XvdvUeBnXmlld" - Domi (energetic American female, good for food reviews)
 * - "EXAVITQu4vr4xnSDxMaL" - Bella (soft American female, storytelling)
 * - "ErXwobaYiN019PkySvjV" - Antoni (well-rounded American male)
 * - "TxGEqnHWrfWFTfGW9XjX" - Josh (deep American male, narrator style)
 *
 * For Shanghai Discovery app, Rachel (21m00Tcm4TlvDq8ikWAM) works best.
 *
 * COST:
 * - Free tier: 10,000 characters/month (~10 videos)
 * - Per video (29 seconds, ~500 characters): ~$0.05
 */

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { exec } from 'child_process';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '..', '.env') });

/**
 * Generate speech audio for all segments using ElevenLabs TTS
 *
 * @param {Array} segments - Translated segments with {chinese, english, start, end, duration}
 * @param {string} outputDir - Directory to save audio files
 * @param {string} voiceId - ElevenLabs voice ID (default: "Rachel")
 * @returns {Promise<Array>} - Segments with audioPath and audioDuration added
 */
export async function generateAllSegments(segments, outputDir, voiceId = 'Rachel') {
  // ── STEP 1: Validate ─────────────────────────────────────────────────────
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      'ELEVENLABS_API_KEY not found in .env file.\n' +
      'Get your key at: https://elevenlabs.io/app/settings/api-keys\n' +
      'Then add to .env: ELEVENLABS_API_KEY=sk_...'
    );
  }

  if (!segments || segments.length === 0) {
    console.log('  ℹ️  No segments to generate speech for');
    return [];
  }

  // Make sure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`  🎙️  Generating speech for ${segments.length} segment(s) using voice: ${voiceId}...`);

  // ── STEP 2: Initialize ElevenLabs client ──────────────────────────────────
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });

  // ── STEP 3: Generate audio for each segment ───────────────────────────────
  const results = [];
  let totalCharacters = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputPath = path.join(outputDir, `segment_${i}.mp3`);

    console.log(`  [${i + 1}/${segments.length}] "${segment.english.substring(0, 40)}..."`);

    try {
      // Generate audio with ElevenLabs
      const audio = await generateSpeech(client, segment.english, voiceId);

      // Save audio to file
      await saveAudioToFile(audio, outputPath);

      // Get actual audio duration
      const audioDuration = await getAudioDuration(outputPath);

      // Track characters for cost calculation
      totalCharacters += segment.english.length;

      results.push({
        ...segment,
        audioPath: outputPath,
        audioDuration,
      });

      console.log(`  ✓ Generated: ${path.basename(outputPath)} (${audioDuration.toFixed(1)}s)`);

      // Rate limiting — ElevenLabs free tier: 3 requests/second
      // Be conservative to avoid rate limit errors
      if (i < segments.length - 1) {
        await sleep(400); // 0.4s between calls = ~2.5 req/s
      }

    } catch (error) {
      console.error(`  ❌ Failed to generate segment ${i + 1}: ${error.message}`);

      // Fallback: copy segment without audio
      results.push({
        ...segment,
        audioPath: null,
        audioDuration: segment.duration,
        error: error.message,
      });
    }
  }

  // ── STEP 4: Calculate cost ────────────────────────────────────────────────
  // ElevenLabs pricing (as of 2024):
  // - Free tier: 10,000 characters/month
  // - Starter ($5/month): 30,000 characters
  // - Creator ($22/month): 100,000 characters
  // - Independent ($99/month): 500,000 characters
  //
  // Cost per character: ~$0.0001 (based on Creator tier)
  const estimatedCost = totalCharacters * 0.0001;

  console.log(`  ✅ Speech generation complete`);
  console.log(`  ℹ️  Total characters: ${totalCharacters}`);
  console.log(`  💰 Estimated cost: $${estimatedCost.toFixed(4)}`);

  return results;
}

/**
 * Generate speech for a single text using ElevenLabs API
 */
async function generateSpeech(client, text, voiceId) {
  // ── Call ElevenLabs Text-to-Speech API ────────────────────────────────────
  // Model: "eleven_turbo_v2_5"
  // - Fastest model with good quality
  // - Optimized for low latency
  // - Supports multiple languages (English, Spanish, French, etc.)
  //
  // Alternative models:
  // - "eleven_multilingual_v2" - Better for non-English (slower)
  // - "eleven_monolingual_v1" - English only, high quality (slower)
  //
  // Voice settings:
  // - stability: 0.5 (0 = very variable, 1 = very stable)
  // - similarity_boost: 0.75 (0 = less like training voice, 1 = more like it)
  // - style: 0.0 (only for eleven_multilingual_v2)
  // - use_speaker_boost: true (enhances similarity to training voice)

  const audioStream = await client.textToSpeech.convert(voiceId, {
    model_id: 'eleven_turbo_v2_5',
    text: text,
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.8,
      use_speaker_boost: true,
    },
  });

  return audioStream;
}

/**
 * Save audio stream to file
 */
async function saveAudioToFile(audioStream, outputPath) {
  const writeStream = fs.createWriteStream(outputPath);

  // Convert the audio stream to a Node.js Readable stream
  const readableStream = Readable.from(audioStream);

  // Pipe to file
  readableStream.pipe(writeStream);

  // Wait for the write to finish
  await finished(writeStream);
}

/**
 * Get audio file duration in seconds using ffprobe
 */
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg's companion tool ffprobe to get audio metadata
    const command = `ffprobe -v quiet -print_format json -show_format "${audioPath}"`;

    exec(command, (error, stdout) => {
      if (error) {
        reject(new Error(`Could not get audio duration: ${error.message}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdout);
        const duration = parseFloat(metadata.format.duration) || 0;
        resolve(duration);
      } catch (parseError) {
        reject(new Error(`Could not parse ffprobe output: ${parseError.message}`));
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
