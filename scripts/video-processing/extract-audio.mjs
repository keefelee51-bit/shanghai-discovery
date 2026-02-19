/**
 * PART 1A: Audio Extraction using FFmpeg
 *
 * HOW IT WORKS:
 * FFmpeg is a command-line tool that can convert between any audio/video formats.
 * We use the fluent-ffmpeg library which wraps FFmpeg in a nice Node.js API.
 *
 * What happens under the hood:
 * 1. FFmpeg opens the video file (MP4, MOV, etc.)
 * 2. It reads the audio stream (videos have separate audio + video streams)
 * 3. It re-encodes the audio to MP3 format
 * 4. It saves just the audio, discarding the video stream
 *
 * Think of it like extracting the soundtrack from a movie — same audio, no picture.
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Extract audio from a video file and save as MP3
 *
 * @param {string} videoPath - Path to the input video file
 * @param {string} outputPath - Path to save the extracted audio (should end in .mp3)
 * @returns {Promise<{audioPath: string, duration: number}>} - Path to audio + duration in seconds
 */
export async function extractAudio(videoPath, outputPath) {
  // ── STEP 1: Validate inputs ──────────────────────────────────────────────
  // Before doing anything, make sure the video file actually exists.
  // This prevents confusing FFmpeg errors later.
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Make sure the output directory exists (create it if it doesn't)
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`  📁 Created output directory: ${outputDir}`);
  }

  console.log(`  🎬 Extracting audio from: ${path.basename(videoPath)}`);

  // ── STEP 2: Get video info (duration, codecs, etc.) ──────────────────────
  // ffprobe reads the video's metadata without actually processing it.
  // We use this to know how long the video is and log useful info.
  const videoInfo = await getVideoInfo(videoPath);
  console.log(`  ℹ️  Video duration: ${videoInfo.duration.toFixed(1)}s`);
  console.log(`  ℹ️  Audio codec: ${videoInfo.audioCodec || 'unknown'}`);

  // ── STEP 3: Extract audio using FFmpeg ───────────────────────────────────
  // This is where the actual conversion happens.
  //
  // FFmpeg options explained:
  // - noVideo()    → Don't include the video stream in output
  // - audioCodec('libmp3lame') → Encode audio as MP3 (lame is the MP3 encoder)
  // - audioBitrate('128k')     → 128kbps quality (good balance of size vs quality)
  // - audioChannels(1)         → Mono (1 channel) — speech doesn't need stereo,
  //                               and mono is half the file size + Whisper works fine with it
  // - audioFrequency(16000)    → 16kHz sample rate — Whisper's native rate,
  //                               sending higher rates wastes bandwidth with no quality gain
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(16000)
      .output(outputPath)
      .on('start', (cmd) => {
        // This logs the actual FFmpeg command being run — useful for debugging
        console.log(`  ⚙️  FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        // FFmpeg reports progress as it processes the file
        // progress.percent can be undefined for some formats, so we check
        if (progress.percent) {
          process.stdout.write(`\r  ⏳ Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`\n  ✅ Audio extracted: ${path.basename(outputPath)}`);

        // Log file size for reference
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ℹ️  Audio file size: ${sizeMB} MB`);

        resolve({
          audioPath: outputPath,
          duration: videoInfo.duration,
        });
      })
      .on('error', (err) => {
        console.error(`\n  ❌ FFmpeg error: ${err.message}`);

        // Clean up partial output file if extraction failed
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log(`  🧹 Cleaned up partial output file`);
        }

        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Extract high-quality audio from a video file for source separation (Demucs).
 * Uses stereo + 44.1kHz instead of the Whisper-optimized mono 16kHz.
 *
 * @param {string} videoPath - Path to the input video file
 * @param {string} outputPath - Path to save the extracted audio (should end in .wav)
 * @returns {Promise<string>} - Path to audio file
 */
export async function extractHighQualityAudio(videoPath, outputPath) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`  🎬 Extracting high-quality audio for Demucs...`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le') // Uncompressed WAV — best quality for Demucs
      .audioChannels(2)        // Stereo
      .audioFrequency(44100)   // 44.1kHz CD quality
      .output(outputPath)
      .on('end', () => {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  ✅ High-quality audio extracted: ${path.basename(outputPath)} (${sizeMB} MB)`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(new Error(`High-quality audio extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Get video metadata using ffprobe
 * ffprobe is FFmpeg's companion tool that reads file info without processing it
 *
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<{duration: number, audioCodec: string}>}
 */
function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Could not read video info: ${err.message}`));
        return;
      }

      // metadata.format contains overall file info
      const duration = metadata.format.duration || 0;

      // Find the audio stream (videos can have multiple streams: video, audio, subtitles)
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      const audioCodec = audioStream ? audioStream.codec_name : null;

      if (!audioStream) {
        reject(new Error('No audio stream found in video — is this a silent video?'));
        return;
      }

      resolve({ duration, audioCodec });
    });
  });
}
