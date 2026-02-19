/**
 * PART 1B: Speech-to-Text using OpenAI Whisper API
 *
 * HOW IT WORKS:
 * Whisper is OpenAI's automatic speech recognition (ASR) model.
 * It can transcribe audio in 50+ languages and auto-detect the language.
 *
 * The flow:
 * 1. We send the MP3 audio file to OpenAI's API
 * 2. Whisper processes the audio and identifies speech segments
 * 3. It returns text with timestamps for each segment
 *
 * WHY "verbose_json" FORMAT?
 * Whisper has several response formats:
 * - "text"         → Just the plain text, no timestamps
 * - "json"         → Text + language, no timestamps
 * - "verbose_json" → Text + language + SEGMENTS with timestamps (what we need!)
 * - "srt"          → Subtitle format (timestamps but harder to parse)
 * - "vtt"          → WebVTT subtitle format
 *
 * We need verbose_json because later we'll need to know WHEN each phrase was
 * spoken so we can sync the English dubbed audio to the right moment in the video.
 *
 * COST:
 * $0.006 per minute of audio. A 60-second video costs less than $0.01.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(import.meta.dirname, '..', '..', '.env') });

/**
 * Transcribe audio file to text with timestamps using Whisper API
 *
 * @param {string} audioPath - Path to the audio file (MP3, WAV, etc.)
 * @returns {Promise<{segments: Array, language: string, duration: number, cost: number}>}
 *
 * Each segment looks like:
 *   { text: "好吃", start: 0.0, end: 0.5 }
 */
export async function transcribeAudio(audioPath) {
  // ── STEP 1: Validate ─────────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY not found in .env file.\n' +
      'Get your key at: https://platform.openai.com/api-keys\n' +
      'Then add to .env: OPENAI_API_KEY=sk-...'
    );
  }

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Check file size — Whisper API has a 25MB limit
  const stats = fs.statSync(audioPath);
  const sizeMB = stats.size / 1024 / 1024;
  if (sizeMB > 25) {
    throw new Error(
      `Audio file is ${sizeMB.toFixed(1)}MB — Whisper API limit is 25MB.\n` +
      'Try extracting audio at a lower bitrate or splitting the file.'
    );
  }

  console.log(`  🎙️  Transcribing: ${path.basename(audioPath)} (${sizeMB.toFixed(2)} MB)`);

  // ── STEP 2: Initialize OpenAI client ──────────────────────────────────────
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ── STEP 3: Call Whisper API ──────────────────────────────────────────────
  // We use verbose_json to get timestamps for each spoken segment.
  //
  // Options explained:
  // - file: The audio file as a readable stream (Node.js way of sending files)
  // - model: 'whisper-1' is the only Whisper model available via API
  // - response_format: 'verbose_json' gives us segments with start/end times
  // - language: 'zh' tells Whisper to expect Chinese — this improves accuracy.
  //   Without it, Whisper auto-detects but can sometimes get confused with
  //   short clips or mixed-language content.
  // - timestamp_granularities: ['segment'] gives sentence-level timestamps.
  //   You can also use ['word'] for word-level, but we don't need that precision.

  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`  🔄 Retry attempt ${attempt}/${MAX_RETRIES}...`);
        // Wait before retrying (exponential backoff: 2s, 4s, 8s)
        await sleep(2000 * Math.pow(2, attempt - 1));
      }

      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'zh',
        timestamp_granularities: ['segment'],
      });

      // ── STEP 4: Parse the response ──────────────────────────────────────
      // The verbose_json response has:
      // - text: Full transcript as one string
      // - language: Detected language (should be "chinese")
      // - duration: Total audio duration in seconds
      // - segments: Array of timed text chunks

      const detectedLanguage = response.language || 'unknown';
      if (detectedLanguage !== 'chinese') {
        console.log(`  ⚠️  Detected language: ${detectedLanguage} (expected Chinese)`);
      }

      const duration = response.duration || 0;

      // Map segments to our simpler format
      // Whisper segments have many fields; we only need text + start + end
      const segments = (response.segments || []).map(seg => ({
        text: seg.text.trim(),
        start: seg.start,
        end: seg.end,
      }));

      // ── STEP 5: Calculate cost ──────────────────────────────────────────
      // Whisper costs $0.006 per minute of audio
      const costPerMinute = 0.006;
      const durationMinutes = duration / 60;
      const cost = durationMinutes * costPerMinute;

      console.log(`  ✅ Transcription complete`);
      console.log(`  ℹ️  Language: ${detectedLanguage}`);
      console.log(`  ℹ️  Duration: ${duration.toFixed(1)}s`);
      console.log(`  ℹ️  Segments: ${segments.length}`);
      console.log(`  💰 Cost: $${cost.toFixed(4)}`);

      return { segments, language: detectedLanguage, duration, cost };

    } catch (error) {
      lastError = error;

      // Don't retry on validation errors (wrong file format, file too big, etc.)
      // These will fail every time regardless of retries
      if (error.status === 400) {
        throw new Error(`Whisper API rejected the audio: ${error.message}`);
      }

      // Rate limit (429) or server error (500+) — worth retrying
      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠️  API error: ${error.message} — will retry...`);
      }
    }
  }

  // If we get here, all retries failed
  throw new Error(`Whisper transcription failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
