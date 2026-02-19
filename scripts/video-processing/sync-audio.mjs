/**
 * PART 4A: Audio Timing Synchronization
 *
 * HOW IT WORKS:
 * After generating English audio with ElevenLabs, we need to make sure it fits
 * the original video timing. If the English audio is longer or shorter than
 * the original Chinese, we adjust it.
 *
 * TIMING ADJUSTMENT STRATEGIES:
 *
 * 1. Slightly too long (ratio 1.05-1.5x):
 *    → Speed up audio using ffmpeg's atempo filter
 *    Example: 3.8s audio needs to fit 3.2s slot → speed up 1.19x
 *
 * 2. Much too long (ratio >1.5x):
 *    → Speed up capped at 1.5x + flag with warning
 *    The translation prompt already targets a word count limit to prevent
 *    this, so ratio >1.5x should be rare in practice.
 *
 * 3. Too short (ratio <0.95x):
 *    → Add silence padding at the end
 *    Keeps natural speaking pace, fills time with silence
 *
 * WHY THESE THRESHOLDS?
 * - 1.0-1.5x speedup: Still sounds natural, barely noticeable at <1.3x
 * - >1.5x speedup: Starts sounding rushed — cap here and log a warning
 * - <0.95x: No need to slow down, silence is better than stretched audio
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Adjust timing for all audio segments to match original video timing
 *
 * @param {Array} segments - Segments with audioPath and audioDuration
 * @param {string} outputDir - Directory to save adjusted audio
 * @returns {Promise<Array>} - Segments with adjustedAudioPath
 */
export async function syncAudioTiming(segments, outputDir) {
  console.log(`  🎵 Syncing audio timing for ${segments.length} segment(s)...`);

  // Make sure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];
  let adjustedCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Skip if no audio was generated
    if (!segment.audioPath || !fs.existsSync(segment.audioPath)) {
      console.log(`  ⚠️  Segment ${i + 1}: No audio file, skipping`);
      results.push(segment);
      continue;
    }

    const originalDuration = segment.duration;
    const audioDuration = segment.audioDuration;
    const ratio = audioDuration / originalDuration;

    console.log(`  [${i + 1}/${segments.length}] Ratio: ${ratio.toFixed(2)}x`);

    // Determine adjustment strategy
    if (ratio >= 0.95 && ratio <= 1.05) {
      // Perfect timing — no adjustment needed
      console.log(`  ✓ Perfect timing, no adjustment needed`);
      results.push({
        ...segment,
        adjustedAudioPath: segment.audioPath, // Use original
        speedAdjustment: 1.0,
        adjusted: false,
      });

    } else if (ratio > 1.05 && ratio <= 1.5) {
      // Too long — speed up (1.05-1.5x is still natural-sounding)
      const outputPath = path.join(outputDir, `adjusted_${i}.mp3`);
      const speedFactor = ratio;

      console.log(`  ⚡ Speeding up ${speedFactor.toFixed(2)}x...`);

      await speedUpAudio(segment.audioPath, outputPath, speedFactor);

      adjustedCount++;
      results.push({
        ...segment,
        adjustedAudioPath: outputPath,
        speedAdjustment: speedFactor,
        adjusted: true,
      });

    } else if (ratio > 1.5) {
      // Way too long — cap at 1.5x and log a warning.
      // The translation prompt enforces a word count limit, so this should
      // be rare. If it shows up, the Chinese original was unusually dense.
      console.log(`  ⚠️  Very long (${ratio.toFixed(2)}x)! Capping speed at 1.5x.`);
      console.log(`     Audio may still overrun slot — check this segment manually.`);

      const outputPath = path.join(outputDir, `adjusted_${i}.mp3`);
      const speedFactor = 1.5; // Hard cap

      await speedUpAudio(segment.audioPath, outputPath, speedFactor);

      adjustedCount++;
      results.push({
        ...segment,
        adjustedAudioPath: outputPath,
        speedAdjustment: speedFactor,
        adjusted: true,
        warning: `Ratio was ${ratio.toFixed(2)}x — audio overruns original slot even at 1.5x`,
      });

    } else {
      // Too short — add silence padding
      const silenceDuration = originalDuration - audioDuration;
      const outputPath = path.join(outputDir, `adjusted_${i}.mp3`);

      console.log(`  🔇 Adding ${silenceDuration.toFixed(1)}s silence padding...`);

      await addSilence(segment.audioPath, outputPath, silenceDuration);

      adjustedCount++;
      results.push({
        ...segment,
        adjustedAudioPath: outputPath,
        speedAdjustment: 1.0,
        adjusted: true,
        silencePadding: silenceDuration,
      });
    }
  }

  console.log(`  ✅ Timing sync complete (${adjustedCount} adjusted, ${segments.length - adjustedCount} unchanged)`);

  return results;
}

/**
 * Speed up audio using ffmpeg's atempo filter
 * atempo can only do 0.5x-2.0x, so we chain multiple filters if needed
 */
async function speedUpAudio(inputPath, outputPath, speedFactor) {
  return new Promise((resolve, reject) => {
    // ffmpeg's atempo filter has limits: 0.5 <= atempo <= 2.0
    // For factors outside this range, chain multiple filters
    // Example: 2.5x = atempo=2.0,atempo=1.25

    const filters = [];
    let remaining = speedFactor;

    // atempo max is 2.0x — chain multiple filters for higher speeds
    // e.g. 2.8x = atempo=2.0 then atempo=1.4 (2.0 × 1.4 = 2.8)
    while (remaining > 2.0) {
      filters.push('atempo=2.0');
      remaining /= 2.0;
    }

    filters.push(`atempo=${remaining.toFixed(3)}`);

    const filterString = filters.join(',');

    ffmpeg(inputPath)
      .audioFilters(filterString)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Speed adjustment failed: ${err.message}`)))
      .run();
  });
}

/**
 * Add silence padding to audio using ffmpeg's apad filter
 */
async function addSilence(inputPath, outputPath, silenceDuration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(`apad=pad_dur=${silenceDuration.toFixed(3)}`)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Silence padding failed: ${err.message}`)))
      .run();
  });
}
