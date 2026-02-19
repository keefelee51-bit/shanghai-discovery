/**
 * PART 4B: Assemble Audio Track from Segments
 *
 * HOW IT WORKS:
 * We have multiple audio segments (segment_0.mp3, segment_1.mp3, etc.) that need
 * to be combined into one continuous audio track that matches the video timeline.
 *
 * THE CHALLENGE:
 * The segments aren't back-to-back — there are gaps/silence between them.
 *
 * Example timeline:
 * 0.0s ──[Segment 0]── 3.2s ~~silence~~ 3.2s ──[Segment 1]── 7.0s ...
 *
 * APPROACH:
 * 1. For each segment, calculate the silence needed before it
 * 2. Generate silence files
 * 3. Concatenate: silence → audio → silence → audio → ...
 * 4. Result: One audio file that matches video duration exactly
 *
 * FFMPEG CONCAT:
 * FFmpeg can concatenate files using a "concat demuxer" with a file list:
 * file 'silence_0.mp3'
 * file 'segment_0.mp3'
 * file 'silence_1.mp3'
 * file 'segment_1.mp3'
 * ...
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

/**
 * Combine audio segments into one track with proper timing/gaps
 *
 * @param {Array} segments - Segments with adjustedAudioPath, start, end
 * @param {string} outputPath - Where to save the combined audio
 * @param {number} videoDuration - Total video duration (to pad end if needed)
 * @returns {Promise<string>} - Path to combined audio file
 */
export async function assembleAudioTrack(segments, outputPath, videoDuration) {
  console.log(`  🎼 Assembling audio track from ${segments.length} segment(s)...`);

  const tempDir = path.join(path.dirname(outputPath), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // ── STEP 1: Create silence files and build concat list ────────────────────
  const concatList = [];
  let currentTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Skip segments without audio
    if (!segment.adjustedAudioPath || !fs.existsSync(segment.adjustedAudioPath)) {
      console.log(`  ⚠️  Segment ${i}: No audio, skipping`);
      continue;
    }

    // Calculate silence needed before this segment
    const silenceBefore = segment.start - currentTime;

    if (silenceBefore > 0.01) {
      // Need silence (more than 10ms gap)
      const silencePath = path.join(tempDir, `silence_${i}.mp3`);
      console.log(`  🔇 Creating ${silenceBefore.toFixed(2)}s silence before segment ${i}...`);

      await generateSilence(silencePath, silenceBefore);
      concatList.push(silencePath);
    }

    // Add the audio segment
    console.log(`  🎵 Adding segment ${i} audio...`);
    concatList.push(segment.adjustedAudioPath);

    // Update current time
    currentTime = segment.end;
  }

  // Add final silence to match video duration
  const finalSilence = videoDuration - currentTime;
  if (finalSilence > 0.01) {
    const silencePath = path.join(tempDir, 'silence_final.mp3');
    console.log(`  🔇 Adding ${finalSilence.toFixed(2)}s silence at end...`);
    await generateSilence(silencePath, finalSilence);
    concatList.push(silencePath);
  }

  // ── STEP 2: Create concat file list ───────────────────────────────────────
  const concatListPath = path.join(tempDir, 'concat_list.txt');
  const concatContent = concatList
    .map(filePath => `file '${filePath.replace(/\\/g, '/')}'`) // Convert backslashes for FFmpeg
    .join('\n');
    
  fs.writeFileSync(concatListPath, concatContent);
  console.log(`  📝 Created concat list with ${concatList.length} files`);

  // ── STEP 3: Concatenate all audio files ───────────────────────────────────
  console.log(`  🔗 Concatenating audio files...`);
  await concatenateAudio(concatListPath, outputPath);

  // ── STEP 4: Clean up temp files ───────────────────────────────────────────
  console.log(`  🧹 Cleaning up temp files...`);
  concatList.forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
  if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

  const stats = fs.statSync(outputPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  ✅ Audio track assembled: ${path.basename(outputPath)} (${sizeMB} MB)`);

  return outputPath;
}

/**
 * Generate a silence audio file of specified duration
 */
async function generateSilence(outputPath, duration) {
  return new Promise((resolve, reject) => {
    // Use execFile to guarantee argument order:
    // ffmpeg -f lavfi -i anullsrc ... (the -f MUST come before -i)
    // fluent-ffmpeg sometimes reorders flags, which breaks lavfi
    const args = [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=mono',
      '-t', duration.toFixed(3),
      '-acodec', 'libmp3lame',
      '-b:a', '128k',
      '-y',
      outputPath,
    ];

    execFile('ffmpeg', args, (error) => {
      if (error) {
        reject(new Error(`Silence generation failed: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Concatenate audio files using FFmpeg's concat demuxer
 */
async function concatenateAudio(concatListPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Concatenation failed: ${err.message}`)))
      .run();
  });
}
