/**
 * Video Dubbing Pipeline — Exportable Function
 *
 * Takes a local video file and produces a dubbed English version.
 * Runs all pipeline steps in sequence:
 *
 *   Part 1:  Extract audio (16kHz mono for Whisper)
 *   Part 1B: Extract HQ audio (44.1kHz stereo) → Demucs background separation (optional)
 *   Part 2:  Transcribe Chinese with Whisper
 *   Part 3:  Translate to English with GPT-4o-mini
 *   Part 4:  Generate English TTS with ElevenLabs (Rachel voice)
 *   Part 5:  Sync audio timing to original segments
 *   Part 6:  Assemble full dubbed audio track
 *   Part 7:  Mix dubbed audio (+ background if Demucs available) into video
 *
 * Usage:
 *   import { dubVideo } from './video-processing/dub-video.mjs'
 *   const dubbedPath = await dubVideo(videoPath, outputDir)
 */

import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

import { extractAudio, extractHighQualityAudio } from './extract-audio.mjs';
import { separateAudio } from './separate-audio.mjs';
import { transcribeAudio } from './transcribe.mjs';
import { translateSegments } from './translate-segments.mjs';
import { generateAllSegments } from './text-to-speech.mjs';
import { syncAudioTiming } from './sync-audio.mjs';
import { assembleAudioTrack } from './assemble-audio.mjs';
import { replaceAudioTrack } from './replace-audio.mjs';

const VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel (ElevenLabs premade voice)

/**
 * Check if Demucs is installed
 */
function isDemucsInstalled() {
  return new Promise((resolve) => {
    exec('python -m demucs --help', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Dub a video file from Chinese to English.
 *
 * @param {string} videoPath - Path to the input video file (.mp4)
 * @param {string} outputDir - Directory for all intermediate and output files
 * @returns {Promise<{ dubbedVideoPath: string, cost: number, duration: number, segments: number }>}
 */
export async function dubVideo(videoPath, outputDir) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const audioDir      = path.join(outputDir, 'audio-segments');
  const syncedDir     = path.join(outputDir, 'synced-audio');
  const demucsDir     = path.join(outputDir, 'demucs');
  const finalDir      = path.join(outputDir, 'final');

  [audioDir, syncedDir, demucsDir, finalDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

  let totalCost = 0;
  let accompanimentPath = null;

  // ── Part 1: Extract audio for Whisper ─────────────────────────────────────
  const whisperAudioPath = path.join(outputDir, 'audio-whisper.mp3');
  const { audioPath, duration: videoDuration } = await extractAudio(videoPath, whisperAudioPath);

  // ── Part 1B: Demucs background separation (optional) ──────────────────────
  const demucsAvailable = await isDemucsInstalled();
  if (demucsAvailable) {
    const hqAudioPath = path.join(outputDir, 'audio-hq.wav');
    await extractHighQualityAudio(videoPath, hqAudioPath);
    accompanimentPath = await separateAudio(hqAudioPath, demucsDir);
  }

  // ── Part 2: Transcribe ────────────────────────────────────────────────────
  const { segments: transcribedSegments, cost: whisperCost } = await transcribeAudio(audioPath);
  totalCost += whisperCost;

  if (transcribedSegments.length === 0) {
    throw new Error('No speech segments found in video — may be a silent or music-only video');
  }

  // ── Part 3: Translate ─────────────────────────────────────────────────────
  const translatedSegments = await translateSegments(transcribedSegments);

  // ── Part 4: Generate TTS ──────────────────────────────────────────────────
  const audioSegments = await generateAllSegments(translatedSegments, audioDir, VOICE);

  const totalChars = translatedSegments.reduce((sum, seg) => sum + seg.english.length, 0);
  totalCost += totalChars * 0.0001; // ElevenLabs estimated cost

  // ── Part 5: Sync timing ───────────────────────────────────────────────────
  const syncedSegments = await syncAudioTiming(audioSegments, syncedDir);

  // ── Part 6: Assemble audio track ──────────────────────────────────────────
  const assembledAudioPath = path.join(outputDir, 'dubbed-audio.mp3');
  await assembleAudioTrack(syncedSegments, assembledAudioPath, videoDuration);

  // ── Part 7: Mix into video ────────────────────────────────────────────────
  const dubbedVideoPath = path.join(finalDir, 'dubbed-video.mp4');
  await replaceAudioTrack(videoPath, assembledAudioPath, dubbedVideoPath, accompanimentPath);

  return {
    dubbedVideoPath,
    cost: totalCost,
    duration: videoDuration,
    segments: transcribedSegments.length,
    backgroundAudio: !!accompanimentPath,
  };
}
