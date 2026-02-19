import sharp from 'sharp';
import { createCanvas } from 'canvas';

/**
 * Overlays translated English text on image with semi-transparent backgrounds
 * Similar to Apple Translate's image translation feature
 *
 * @param {string} imagePath - Path to the original image
 * @param {Array} overlays - Array of overlay objects with chinese, english, position, size
 * @param {string} outputPath - Path to save the output image
 * @returns {Promise<string>} - Path to the output image
 */
export async function overlayTranslatedText(imagePath, overlays, outputPath) {
  try {
    // Validate inputs
    if (!imagePath) {
      throw new Error('imagePath is required');
    }
    if (!outputPath) {
      throw new Error('outputPath is required');
    }
    if (!overlays || overlays.length === 0) {
      throw new Error('overlays array is required and must not be empty');
    }

    // Load image and get dimensions
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    console.log(`  📝 Creating text overlay for ${overlays.length} text blocks...`);

    // Create transparent canvas for text overlays
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw each overlay
    overlays.forEach((overlay, index) => {
      // Use defaults if position/size missing
      const defaultPosition = {
        x_percent: 10,
        y_percent: 10 + (index * 15)  // Stack vertically if no position
      };
      const defaultSize = {
        width_percent: 80,
        height_percent: 10
      };

      const position = overlay.position || defaultPosition;
      const size = overlay.size || defaultSize;

      // Convert percentages to pixels
      const x = Math.floor((position.x_percent / 100) * width);
      const y = Math.floor((position.y_percent / 100) * height);
      const boxWidth = Math.floor((size.width_percent / 100) * width);
      const boxHeight = Math.floor((size.height_percent / 100) * height);

      // Skip if dimensions are invalid
      if (boxWidth <= 0 || boxHeight <= 0) {
        console.log(`  ⚠️  Overlay ${index + 1} has invalid dimensions, skipping`);
        return;
      }

      // Draw semi-transparent background (dark for readability)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x, y, boxWidth, boxHeight);

      // Font auto-shrink to fit box
      const text = overlay.english;
      const padding = 8;
      const maxWidth = boxWidth - (padding * 2);
      const MIN_FONT = 10;
      let fontSize = Math.max(MIN_FONT, Math.floor(boxHeight * 0.5));

      function wordWrap(size) {
        ctx.font = `bold ${size}px Arial, sans-serif`;
        const words = text.split(' ');
        const wrapped = [];
        let cur = '';
        words.forEach(w => {
          const test = cur ? `${cur} ${w}` : w;
          if (ctx.measureText(test).width > maxWidth && cur) {
            wrapped.push(cur);
            cur = w;
          } else {
            cur = test;
          }
        });
        if (cur) wrapped.push(cur);
        return wrapped;
      }

      let lines = wordWrap(fontSize);
      let lineHeight = fontSize * 1.2;
      while (lines.length * lineHeight > boxHeight && fontSize > MIN_FONT) {
        fontSize--;
        lines = wordWrap(fontSize);
        lineHeight = fontSize * 1.2;
      }

      ctx.fillStyle = 'white';
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const totalTextHeight = lines.length * lineHeight;
      const startY = y + (boxHeight - totalTextHeight) / 2;

      lines.forEach((line, lineIndex) => {
        ctx.fillText(
          line,
          x + padding,
          startY + (lineIndex * lineHeight),
          maxWidth
        );
      });
    });

    // Convert canvas to buffer
    const textLayerBuffer = canvas.toBuffer('image/png');

    // Composite text layer onto original image
    // NOTE: Must create fresh Sharp instance because metadata() consumed the stream
    const outputImage = sharp(imagePath);
    await outputImage
      .composite([{
        input: textLayerBuffer,
        blend: 'over' // Overlay on top
      }])
      .toFile(outputPath);

    console.log(`  ✅ Text overlay complete (${overlays.length} overlays)`);
    return outputPath;

  } catch (error) {
    console.error(`  ❌ Text overlay failed:`, error.message);
    // Return original image path on failure
    return imagePath;
  }
}
