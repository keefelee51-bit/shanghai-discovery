/**
 * PART 4C: Replace Video Audio Track
 *
 * HOW IT WORKS:
 * Take the original video file and replace its audio track with our new
 * English dubbed audio, keeping the video stream unchanged.
 *
 * TWO MODES:
 *
 * Mode A — Simple replace (no accompaniment):
 *   Uses only the dubbed audio. Gaps between speech are silent.
 *   ffmpeg -i video.mp4 -i dubbed.mp3 -c:v copy -map 0:v:0 -map 1:a:0
 *
 * Mode B — Mix with background (with accompaniment from Demucs/Spleeter):
 *   Mixes dubbed speech + background music separated from the original.
 *   During speech:  English voice (100%) + background (70%) → natural feel
 *   During silence: Background only (70%) → no dead silence in gaps
 *
 *   ffmpeg -i video.mp4 -i accompaniment.wav -i dubbed.mp3
 *     -filter_complex "[1:a]volume=0.7[bg];[2:a]volume=1.0[fg];[bg][fg]amix=..."
 *     -map 0:v:0 -map [out] -c:v copy -c:a aac
 *
 * WHY "-c:v copy"?
 * Re-encoding video is SLOW (minutes) and loses quality.
 * Copying the video stream is FAST (seconds) and perfect quality.
 * We only change the audio, video stays exactly the same.
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Replace video's audio track with dubbed audio.
 * If accompanimentPath is provided, mix dubbed speech with background music.
 *
 * @param {string} videoPath - Original video file
 * @param {string} audioPath - Dubbed audio file (speech + silence gaps)
 * @param {string} outputPath - Output video with new audio
 * @param {string|null} accompanimentPath - Background music from Spleeter (optional)
 * @returns {Promise<string>} - Path to output video
 */
export async function replaceAudioTrack(videoPath, audioPath, outputPath, accompanimentPath = null) {
  if (accompanimentPath) {
    console.log(`  🎬 Mixing dubbed audio with background music...`);
  } else {
    console.log(`  🎬 Replacing audio track in video...`);
  }

  // Validate inputs
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  if (accompanimentPath && !fs.existsSync(accompanimentPath)) {
    throw new Error(`Accompaniment file not found: ${accompanimentPath}`);
  }

  // Make sure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(videoPath);           // Input 0: Original video (video stream only)

    if (accompanimentPath) {
      // ── Mode B: Mix dubbed speech + background music ─────────────────────
      // Input 1: background music (from Spleeter accompaniment)
      // Input 2: dubbed speech (with silence in gaps)
      //
      // filter_complex:
      //   [1:a]volume=0.7[bg]  → background at 70% volume
      //   [2:a]volume=1.0[fg]  → dubbed speech at 100% volume
      //   [bg][fg]amix=inputs=2:duration=longest[out]
      //     → mix both, use the longer one's duration
      //
      // Result:
      //   During speech:  English voice + soft background
      //   During gaps:    Background music only (no dead silence)

      command
        .input(accompanimentPath)  // Input 1: Background music
        .input(audioPath)          // Input 2: Dubbed speech
        .outputOptions([
          '-filter_complex [1:a]volume=0.5[bg];[2:a]volume=1.0[fg];[bg][fg]amix=inputs=2:duration=longest[out]',
          '-map 0:v:0',            // Video from input 0 (original)
          '-map [out]',            // Mixed audio output
          '-c:v copy',             // Copy video (no re-encoding)
          '-c:a aac',              // Encode audio as AAC
          '-b:a 128k',             // Audio quality
        ]);

    } else {
      // ── Mode A: Simple replace (no background mixing) ────────────────────
      // Gaps between speech will be silent.
      // Use this if Spleeter is not installed.

      command
        .input(audioPath)          // Input 1: Dubbed speech
        .videoCodec('copy')        // Copy video stream (no re-encoding)
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
          '-map 0:v:0',            // Video from input 0
          '-map 1:a:0',            // Audio from input 1
          '-shortest',
        ]);
    }

    command
      .output(outputPath)
      .on('start', (cmd) => {
        console.log(`  ⚙️  FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r  ⏳ Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`\n  ✅ Video created`);

        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ℹ️  Output file: ${path.basename(outputPath)} (${sizeMB} MB)`);

        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`\n  ❌ FFmpeg error: ${err.message}`);
        reject(new Error(`Audio replacement failed: ${err.message}`));
      })
      .run();
  });
}
