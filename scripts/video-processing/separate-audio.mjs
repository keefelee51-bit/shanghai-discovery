/**
 * PART 1B: Audio Source Separation with Demucs
 *
 * HOW IT WORKS:
 * The original video has one mixed audio track: Chinese speech + background music/ambiance.
 * Demucs splits it into two separate tracks:
 *   - vocals.mp3    → the Chinese speech (we discard this)
 *   - no_vocals.mp3 → background music/ambient sounds (we KEEP this)
 *
 * WHY DO WE WANT THE NO_VOCALS TRACK?
 * Without it, the gaps between dubbed speech segments are dead silence.
 * With it, the background music/city ambiance plays naturally throughout,
 * and the English dubbed voice plays on top during speech segments.
 *
 * RESULT:
 *   During speech:  English voice (loud) + background music (soft)
 *   During gaps:    Background music only (natural, no dead silence)
 *
 * DEMUCS SETUP (one-time, free):
 *   pip install demucs
 *   (First run downloads ~80MB model automatically)
 *
 * DEMUCS OUTPUT STRUCTURE:
 *   outputDir/
 *     htdemucs/
 *       extracted-audio/
 *         vocals.mp3    ← Chinese speech (discarded)
 *         no_vocals.mp3 ← Background music (we use this)
 *
 * COST: Free — runs locally, no API calls.
 */

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Separate background music from vocals using Demucs
 *
 * @param {string} audioPath - Path to extracted audio (MP3/WAV)
 * @param {string} outputDir - Directory to save separated tracks
 * @returns {Promise<string>} - Path to no_vocals.wav (background only)
 */
export async function separateAudio(audioPath, outputDir) {
  console.log(`  🎵 Separating background audio from vocals...`);
  console.log(`     (Uses Demucs — first run may take a minute to download model)`);

  // Make sure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ── Run Demucs ────────────────────────────────────────────────────────────
  // --two-stems=vocals → splits into 2 tracks: vocals + no_vocals (background)
  // --mp3              → save as MP3 using lame (avoids torchaudio DLL issues on Windows)
  // -o outputDir       → where to save results
  //
  // Example command:
  //   python -m demucs --two-stems=vocals --mp3 -o ./demucs-output ./extracted-audio.mp3
  //
  // Output structure:
  //   ./demucs-output/htdemucs/extracted-audio/vocals.mp3
  //   ./demucs-output/htdemucs/extracted-audio/no_vocals.mp3

  const command = `python -m demucs --two-stems=vocals --mp3 -o "${outputDir}" "${audioPath}"`;

  await runCommand(command);

  // ── Locate no_vocals file ─────────────────────────────────────────────────
  // Demucs names the output folder: outputDir/htdemucs/<input-filename-without-ext>/
  const baseName = path.basename(audioPath, path.extname(audioPath));
  const accompanimentPath = path.join(outputDir, 'htdemucs', baseName, 'no_vocals.mp3');

  if (!fs.existsSync(accompanimentPath)) {
    throw new Error(
      `Demucs ran but no_vocals.mp3 not found at: ${accompanimentPath}\n` +
      `Check that Demucs is installed: pip install demucs`
    );
  }

  const stats = fs.statSync(accompanimentPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  ✅ Background audio separated: ${path.basename(accompanimentPath)} (${sizeMB} MB)`);

  return accompanimentPath;
}

/**
 * Run a shell command and return a promise
 */
function runCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`  ⚙️  Running: ${command}`);

    exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // Demucs prints progress to stderr (not an error), so check carefully
        if (error.code !== 0) {
          reject(new Error(
            `Demucs failed (exit code ${error.code}).\n` +
            `Make sure Demucs is installed: pip install demucs\n` +
            `Error: ${stderr || error.message}`
          ));
          return;
        }
      }

      resolve();
    });
  });
}
