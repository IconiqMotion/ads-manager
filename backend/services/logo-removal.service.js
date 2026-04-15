const OpenAI = require('openai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { log } = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEDIA_DIR = path.join(__dirname, '../data/media');

// Grid overlay settings — gives GPT-4o spatial anchors for accurate localization
const GRID_COLS = 10;
const GRID_ROWS = 10;

function fetchRemoteImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getOriginalPath(localImage) {
  return localImage.replace(/_nologo(\.[^.]+)$/, '$1').replace(/_nologo/g, '');
}

async function getImageBuffer(ad) {
  if (ad.local_image) {
    const orig = path.join(MEDIA_DIR, getOriginalPath(ad.local_image));
    if (fs.existsSync(orig)) return { buffer: fs.readFileSync(orig), sourcePath: getOriginalPath(ad.local_image) };
    const cur = path.join(MEDIA_DIR, ad.local_image);
    if (fs.existsSync(cur)) return { buffer: fs.readFileSync(cur), sourcePath: ad.local_image };
  }
  if (ad.image_url) return { buffer: await fetchRemoteImage(ad.image_url), sourcePath: null };
  throw new Error('No image available');
}

function toDataUrl(buffer) {
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}


/**
 * Create a "difference" image: highlights overlaid elements (logos, watermarks, text)
 * by comparing the original with a heavily blurred version.
 * Overlaid elements appear bright, background stays dark.
 */
async function createDifferenceMap(imageBuffer, imgW, imgH) {
  // Heavy blur removes all text/logos, keeps only the background
  const blurRadius = Math.max(15, Math.round(Math.min(imgW, imgH) * 0.03));
  const blurred = await sharp(imageBuffer)
    .blur(blurRadius)
    .raw()
    .toBuffer();

  const original = await sharp(imageBuffer)
    .raw()
    .toBuffer();

  // Compute absolute difference per pixel
  const diff = Buffer.alloc(original.length);
  for (let i = 0; i < original.length; i++) {
    diff[i] = Math.min(255, Math.abs(original[i] - blurred[i]) * 3); // amplify
  }

  const meta = await sharp(imageBuffer).metadata();
  const channels = meta.channels || 3;

  return sharp(diff, { raw: { width: imgW, height: imgH, channels } })
    .normalize() // maximize contrast
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Create a high-contrast edge-detection view using Laplacian-like sharpening.
 * Makes text and logo outlines pop against backgrounds.
 */
async function createEdgeMap(imageBuffer, imgW, imgH) {
  return sharp(imageBuffer)
    .greyscale()
    .sharpen({ sigma: 3, m1: 10, m2: 5 })
    .normalize()
    .jpeg({ quality: 85 })
    .toBuffer();
}


/**
 * Draw a labeled grid overlay so GPT-4o can reference exact cells instead of guessing percentages.
 * Each cell is labeled "row,col" (e.g. "0,0" = top-left, "9,9" = bottom-right).
 */
async function drawGrid(imageBuffer, imgW, imgH) {
  const cellW = Math.floor(imgW / GRID_COLS);
  const cellH = Math.floor(imgH / GRID_ROWS);

  const lines = [];
  for (let c = 1; c < GRID_COLS; c++) {
    const x = c * cellW;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${imgH}" stroke="rgba(255,0,0,0.5)" stroke-width="2"/>`);
  }
  for (let r = 1; r < GRID_ROWS; r++) {
    const y = r * cellH;
    lines.push(`<line x1="0" y1="${y}" x2="${imgW}" y2="${y}" stroke="rgba(255,0,0,0.5)" stroke-width="2"/>`);
  }
  const fontSize = Math.max(12, Math.min(cellW, cellH) * 0.25);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const x = c * cellW + cellW * 0.1;
      const y = r * cellH + fontSize + cellH * 0.05;
      lines.push(`<text x="${x}" y="${y}" font-size="${fontSize}" fill="red" font-weight="bold" font-family="Arial">${r},${c}</text>`);
    }
  }

  const svgOverlay = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`
  );

  const gridBuffer = await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: gridBuffer, cellW, cellH };
}

/**
 * Step 1: Grid-overlaid image → GPT-4o identifies which grid cells contain the logo.
 * Uses JSON mode for reliable parsing.
 */
async function step1GridDetect(gridImageBuffer, diffMapBuffer) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You find advertiser brand logos/watermarks in ad images. The image has a red grid overlay with labels "row,col" (${GRID_ROWS}x${GRID_COLS}, 0,0=top-left).

LOGO/WATERMARK IS:
- A small brand identity element: company name + icon/symbol
- Camera icon, seal, stamp, emblem, monogram
- Photography/business watermark overlaid on the image
- Usually SMALL (1-4 grid cells), often semi-transparent or styled
- Usually in a corner or center of the image

THESE ARE NOT LOGOS — DO NOT REPORT THEM:
- Headlines / offer text (large bold text)
- Prices (numbers like "1799", "2,400", etc.)
- CTA buttons ("order now", "book", etc.)
- Product names or feature descriptions

Return ALL potential logo candidates found. For each, specify why you think it's a logo vs. other text.
Return JSON only.`
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: toDataUrl(gridImageBuffer), detail: 'high' } },
          { type: 'text', text: 'Difference map (logos/watermarks appear bright):' },
          { type: 'image_url', image_url: { url: toDataUrl(diffMapBuffer || gridImageBuffer), detail: 'low' } },
          {
            type: 'text',
            text: `Scan this ad image carefully. Use the difference map to spot the logo — it will glow bright. Find the advertiser's logo or watermark.

STEP BY STEP:
1. List ALL text/graphic elements you see and their grid positions
2. For each element, classify it: "headline", "price", "cta", "description", "logo/watermark", "other"
3. Pick ONLY the element classified as "logo/watermark"
4. A logo usually has an ICON (camera, lightning bolt, seal, etc.) along with a small company name

Return the logo candidate:
{"found": true, "candidates": [{"description": "camera icon with 'Art Vision' text", "shape": "rectangular", "startRow": 4, "startCol": 2, "endRow": 5, "endCol": 4, "confidence": "high", "reason": "has camera icon + business name, small size"}], "rejected": [{"description": "price 1799", "reason": "price text, not a logo"}, {"description": "headline text", "reason": "large headline"}]}

No logo: {"found": false}`
          }
        ]
      }
    ],
    max_tokens: 400
  });

  const text = res.choices[0].message.content.trim();
  log('DEBUG', 'logo-removal', '[step1-grid] response', { text });

  try {
    const parsed = JSON.parse(text);
    if (!parsed.found || !parsed.candidates || parsed.candidates.length === 0) return null;

    // Pick the best candidate: prefer ones with icons, small size, high confidence
    let best = parsed.candidates[0];
    for (const c of parsed.candidates) {
      const hasIcon = /icon|camera|seal|stamp|emblem|symbol|watermark/i.test(c.description || '');
      const bestHasIcon = /icon|camera|seal|stamp|emblem|symbol|watermark/i.test(best.description || '');
      const cSize = (c.endRow - c.startRow + 1) * (c.endCol - c.startCol + 1);
      const bestSize = (best.endRow - best.startRow + 1) * (best.endCol - best.startCol + 1);

      // Prefer candidates with icons, then smaller ones
      if (hasIcon && !bestHasIcon) best = c;
      else if (hasIcon === bestHasIcon && cSize < bestSize) best = c;
    }

    if (typeof best.startRow !== 'number') return null;

    // Reject if it spans too many cells (probably a headline)
    const cells = (best.endRow - best.startRow + 1) * (best.endCol - best.startCol + 1);
    if (cells > 16) {
      log('WARN', 'logo-removal', '[step1] best candidate too large, skipping', { cells, desc: best.description });
      return null;
    }

    const shape = (best.shape || 'rectangular').toLowerCase();
    best.isRound = shape.includes('oval') || shape.includes('circular') || shape.includes('round') || shape.includes('badge');

    log('DEBUG', 'logo-removal', '[step1] selected candidate', best);
    return best;
  } catch {
    return null;
  }
}

/**
 * Step 2: Crop from ORIGINAL image (no grid) → precise margin refinement.
 */
/**
 * Use the difference map to find exact logo boundaries within a crop region.
 * The diff map highlights overlaid elements. We find the bounding box of
 * the brightest connected region (the logo).
 */
async function findLogoBoundsInCrop(imageBuffer, cropLeft, cropTop, cropW, cropH, imgW, imgH, expectedCenterX, expectedCenterY) {
  // Create diff map of the crop
  const cropBuf = await sharp(imageBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .toBuffer();

  const blurR = Math.max(5, Math.round(Math.min(cropW, cropH) * 0.05));
  const blurredRaw = await sharp(cropBuf).blur(blurR).greyscale().raw().toBuffer();
  const originalRaw = await sharp(cropBuf).greyscale().raw().toBuffer();

  // Compute difference
  const diffData = Buffer.alloc(cropW * cropH);
  for (let i = 0; i < cropW * cropH; i++) {
    diffData[i] = Math.min(255, Math.abs(originalRaw[i] - blurredRaw[i]) * 3);
  }

  // Find connected clusters of bright pixels using flood fill
  const threshold = 30;
  const visited = new Uint8Array(cropW * cropH);
  const clusters = [];

  function floodFill(startX, startY) {
    const stack = [[startX, startY]];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let count = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * cropW + x;
      if (x < 0 || x >= cropW || y < 0 || y >= cropH) continue;
      if (visited[idx]) continue;
      if (diffData[idx] < threshold) continue;

      visited[idx] = 1;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 4-connected neighbors + skip for speed
      stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
      stack.push([x+2, y], [x-2, y], [x, y+2], [x, y-2]);
    }

    return { minX, minY, maxX, maxY, count, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  for (let y = 0; y < cropH; y += 2) {
    for (let x = 0; x < cropW; x += 2) {
      const idx = y * cropW + x;
      if (visited[idx] || diffData[idx] < threshold) continue;
      const cluster = floodFill(x, y);
      if (cluster.count > 30) { // minimum cluster size
        clusters.push(cluster);
      }
    }
  }

  if (clusters.length === 0) return null;

  log('DEBUG', 'logo-removal', '[diffBounds] found clusters', {
    count: clusters.length,
    sizes: clusters.map(c => ({ w: c.w, h: c.h, pixels: c.count, cx: cropLeft + (c.minX + c.maxX)/2, cy: cropTop + (c.minY + c.maxY)/2 }))
  });

  // Score clusters: prefer ones close to the expected center and of reasonable size
  const expRelX = expectedCenterX ? expectedCenterX - cropLeft : cropW / 2;
  const expRelY = expectedCenterY ? expectedCenterY - cropTop : cropH / 2;

  // Filter: logo clusters should be reasonably small (< 20% of crop area each dim)
  const candidates = clusters.filter(c =>
    c.w < cropW * 0.4 && c.h < cropH * 0.4 && c.w > 10 && c.h > 10
  );

  if (candidates.length === 0) return null;

  // Score by distance to expected center
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    const dist = Math.sqrt((cx - expRelX) ** 2 + (cy - expRelY) ** 2);
    // Penalize very large clusters
    const sizePenalty = (c.w * c.h) / (cropW * cropH) * 500;
    const score = dist + sizePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // Merge nearby clusters that might be parts of the same logo (icon + text)
  const mergeDist = Math.max(best.w, best.h) * 1.5;
  let merged = { ...best };
  for (const c of candidates) {
    if (c === best) continue;
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    const bx = (merged.minX + merged.maxX) / 2;
    const by = (merged.minY + merged.maxY) / 2;
    if (Math.abs(cx - bx) < mergeDist && Math.abs(cy - by) < mergeDist) {
      merged.minX = Math.min(merged.minX, c.minX);
      merged.minY = Math.min(merged.minY, c.minY);
      merged.maxX = Math.max(merged.maxX, c.maxX);
      merged.maxY = Math.max(merged.maxY, c.maxY);
    }
  }

  const pad = Math.round(Math.min(merged.maxX - merged.minX, merged.maxY - merged.minY) * 0.15);
  const finalLeft = cropLeft + Math.max(0, merged.minX - pad);
  const finalTop = cropTop + Math.max(0, merged.minY - pad);
  const finalW = Math.min(imgW - finalLeft, merged.maxX - merged.minX + 1 + pad * 2);
  const finalH = Math.min(imgH - finalTop, merged.maxY - merged.minY + 1 + pad * 2);

  log('DEBUG', 'logo-removal', '[diffBounds] best cluster', {
    merged: { minX: merged.minX, minY: merged.minY, w: merged.maxX - merged.minX, h: merged.maxY - merged.minY },
    final: { finalLeft, finalTop, finalW, finalH }
  });

  return { left: finalLeft, top: finalTop, width: finalW, height: finalH };
}


async function step2Refine(cropBuffer) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: toDataUrl(cropBuffer), detail: 'high' } },
          {
            type: 'text',
            text: `This crop should contain a brand logo. Describe ALL elements of the logo block (icon, main text, subtitle, tagline, frame).

1. What is the shape of the logo? (rectangular, oval, circular, badge, irregular)
2. Estimate the empty space (margin) around the logo block as % of this cropped image:
   - top: % of height ABOVE the topmost logo element
   - bottom: % of height BELOW the bottommost logo element
   - left: % of width LEFT of the leftmost logo element
   - right: % of width RIGHT of the rightmost logo element

JSON: {"found": true, "shape": "oval", "top": 5, "bottom": 10, "left": 20, "right": 5}
No logo: {"found": false}`
          }
        ]
      }
    ],
    max_tokens: 200
  });

  const text = res.choices[0].message.content.trim();
  log('DEBUG', 'logo-removal', '[step2] margins response', { text });

  try {
    const margins = JSON.parse(text);
    if (!margins.found || typeof margins.top !== 'number') return null;
    const shape = (margins.shape || 'rectangular').toLowerCase();
    const isRound = shape.includes('oval') || shape.includes('circular') || shape.includes('round') || shape.includes('badge');
    return {
      x1: Math.max(0, margins.left - 2),
      y1: Math.max(0, margins.top - 2),
      x2: Math.min(100, 100 - margins.right + 2),
      y2: Math.min(100, 100 - margins.bottom + 2),
      shape: isRound ? 'ellipse' : 'rect'
    };
  } catch {
    return null;
  }
}

/**
 * Step 3: Verify that the final crop actually contains a logo (guards against false positives).
 */
async function verifyLogo(cropBuffer) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: toDataUrl(cropBuffer), detail: 'high' } },
          {
            type: 'text',
            text: `Does this cropped image contain an advertiser's brand logo or brand identity block?
A logo IS any of these: a small icon/symbol with company name, a brand name with decorative styling, a business name in a badge/circle/frame, a seal/emblem/stamp, a small brand mark with subtitle text.
A logo is NOT: the main large headline of the ad, a price, a CTA button, or body/description text.
Key distinction: if this is a SMALL branding element (even if it has Hebrew/Arabic text), it is a logo. If it is the LARGE main message of the ad, it is not.
JSON: {"is_logo": true} or {"is_logo": false}`
          }
        ]
      }
    ],
    max_tokens: 30
  });

  try {
    return JSON.parse(res.choices[0].message.content.trim()).is_logo === true;
  } catch {
    return false;
  }
}

/**
 * Quadrant scan fallback: split image into 4 quadrants, run grid detect on each.
 * This catches logos that are too small for the full-image grid to resolve.
 */
async function quadrantScan(imageBuffer, imgW, imgH) {
  const halfW = Math.floor(imgW / 2);
  const halfH = Math.floor(imgH / 2);

  const quadrants = [
    { label: 'top-left',     left: 0,     top: 0,     width: halfW, height: halfH },
    { label: 'top-right',    left: halfW, top: 0,     width: imgW - halfW, height: halfH },
    { label: 'bottom-left',  left: 0,     top: halfH, width: halfW, height: imgH - halfH },
    { label: 'bottom-right', left: halfW, top: halfH, width: imgW - halfW, height: imgH - halfH },
  ];

  const results = await Promise.all(quadrants.map(async (q) => {
    const qBuf = await sharp(imageBuffer)
      .extract({ left: q.left, top: q.top, width: q.width, height: q.height })
      .jpeg({ quality: 90 })
      .toBuffer();

    const { buffer: gridBuf, cellW, cellH } = await drawGrid(qBuf, q.width, q.height);
    const detection = await step1GridDetect(gridBuf, null);
    if (!detection) return null;

    const localLeft = detection.startCol * cellW;
    const localTop = detection.startRow * cellH;
    const localW = (detection.endCol - detection.startCol + 1) * cellW;
    const localH = (detection.endRow - detection.startRow + 1) * cellH;

    return {
      left: q.left + localLeft,
      top: q.top + localTop,
      width: localW,
      height: localH,
      quadrant: q.label
    };
  }));

  for (const candidate of results.filter(Boolean)) {
    const cLeft = Math.max(0, candidate.left);
    const cTop = Math.max(0, candidate.top);
    const cW = Math.min(imgW - cLeft, candidate.width);
    const cH = Math.min(imgH - cTop, candidate.height);
    if (cW <= 0 || cH <= 0) continue;

    const cropBuf = await sharp(imageBuffer)
      .extract({ left: cLeft, top: cTop, width: cW, height: cH })
      .jpeg({ quality: 90 })
      .toBuffer();

    if (await verifyLogo(cropBuf)) {
      log('DEBUG', 'logo-removal', '[quadrant] verified in', candidate.quadrant);
      return { left: cLeft, top: cTop, width: cW, height: cH };
    }
  }

  return null;
}

/**
 * Full logo detection pipeline:
 *   1. Grid overlay on full image → cell-based detection (no more % guessing)
 *   2. Crop from original (no grid) → margin refinement
 *   3. Verify the final crop is actually a logo
 *   4. Fallback: quadrant scan if full-image detection fails or doesn't verify
 */
/**
 * Phase 1: Send clean image + difference/edge maps to identify what the logo IS.
 * Returns description and approximate position.
 */
async function identifyLogo(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  const diffMap = await createDifferenceMap(imageBuffer, imgW, imgH);

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'IMAGE 1 - Original ad:' },
          { type: 'image_url', image_url: { url: toDataUrl(imageBuffer), detail: 'high' } },
          { type: 'text', text: 'IMAGE 2 - Difference map (overlaid elements glow bright):' },
          { type: 'image_url', image_url: { url: toDataUrl(diffMap), detail: 'high' } },
          {
            type: 'text',
            text: `Using BOTH images, find the advertiser's brand LOGO or WATERMARK.

In the DIFFERENCE MAP, the logo/watermark glows bright because it's overlaid on the photo.

A logo/watermark:
- Has an ICON or SYMBOL (camera, seal, lightning bolt, emblem)
- Has a small company/brand name next to the icon
- Is SMALL — much smaller than the headline text
- May be semi-transparent in the original but BRIGHT in the difference map

NOT a logo (ignore completely):
- Large headline text
- Prices (1799, 2400, etc.)
- CTA buttons
- Description text
- Decorative letters on objects in the photo (like "A", "B", "Y" on blocks/cubes)

Which bright element in the difference map has an ICON shape? That's the logo.
Give the approximate CENTER position as percentage of image width and height.

JSON: {"found": true, "description": "camera icon with cursive Art Vision text", "position": "center-left", "has_icon": true, "approximate_percent": {"x": 30, "y": 50}}
No logo: {"found": false}`
          }
        ]
      }
    ],
    max_tokens: 250
  });

  const text = res.choices[0].message.content.trim();
  log('INFO', 'logo-removal', '[phase1] GPT4o says', { text });

  try {
    const parsed = JSON.parse(text);
    if (!parsed.found) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function detectLogo(imageBuffer, imgW, imgH) {
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (!geminiKey) {
    log('WARN', 'logo-removal', 'No GOOGLE_AI_API_KEY');
    return null;
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');

  // Create contrast-enhanced version for better detection
  const blurredRaw = await sharp(imageBuffer).blur(20).raw().toBuffer();
  const origRaw = await sharp(imageBuffer).raw().toBuffer();
  const meta = await sharp(imageBuffer).metadata();
  const ch = meta.channels || 3;
  const enhanced = Buffer.alloc(origRaw.length);
  for (let i = 0; i < origRaw.length; i++) {
    enhanced[i] = Math.max(0, Math.min(255, 128 + (origRaw[i] - blurredRaw[i]) * 4));
  }
  const enhJpg = await sharp(enhanced, { raw: { width: imgW, height: imgH, channels: ch } })
    .normalize().jpeg({ quality: 85 }).toBuffer();

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Send BOTH original + enhanced so logos on flat backgrounds are also detected
  const origJpg = await sharp(imageBuffer).jpeg({ quality: 85 }).toBuffer();

  // Use Gemini native bbox format [ymin, xmin, ymax, xmax] on 0-1000 scale
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: origJpg.toString('base64') } },
    { inlineData: { mimeType: 'image/jpeg', data: enhJpg.toString('base64') } },
    'You have two versions of the same ad image: the original and a contrast-enhanced version. Detect the advertiser/brand LOGO ONLY. A logo is a SMALL brand identity mark — typically an icon/symbol with the company name directly next to or below it. The logo is usually compact and located in a corner or along an edge of the image. CRITICAL RULES: 1) The bounding box must TIGHTLY wrap ONLY the logo mark itself (icon + brand name). 2) Do NOT include any large headline text, offer text, or promotional text that appears BELOW or NEAR the logo — that is NOT part of the logo. 3) If there is a big bold headline under the logo, STOP the bounding box ABOVE that headline. 4) The logo height should typically be less than 15% of the total image height. Return the bounding box (based on the ORIGINAL image) as [ymin, xmin, ymax, xmax] with coordinates normalized to 0-1000 scale. Return ONLY the JSON array. If no logo found return: []'
  ]);

  const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
  log('INFO', 'logo-removal', '[gemini-native] response', { text });

  let bbox;
  try {
    const parsed = JSON.parse(text);
    const b = Array.isArray(parsed[0]?.box_2d) ? parsed[0].box_2d : parsed;
    if (!Array.isArray(b) || b.length !== 4) throw new Error('Invalid bbox format');
    bbox = b;
  } catch (e) {
    log('ERROR', 'logo-removal', '[gemini-native] parse failed', { text, err: e.message });
    return null;
  }

  // Convert from 0-1000 to pixels + asymmetric padding (more top for icon, less bottom to avoid text)
  const rawLeft = Math.round(bbox[1] / 1000 * imgW);
  const rawTop = Math.round(bbox[0] / 1000 * imgH);
  const rawW = Math.round((bbox[3] - bbox[1]) / 1000 * imgW);
  const rawH = Math.round((bbox[2] - bbox[0]) / 1000 * imgH);

  // Height guard: if bbox is taller than 20% of image, it likely includes headline text
  // Trim from bottom to keep only the top portion (where the logo icon/name is)
  let adjRawH = rawH;
  let adjRawW = rawW;
  if (rawH > imgH * 0.12) {
    log('WARN', 'logo-removal', '[gemini] bbox too tall, trimming', { rawH, maxH: Math.round(imgH * 0.10) });
    adjRawH = Math.round(imgH * 0.10);
  }
  if (rawW > imgW * 0.45) {
    log('WARN', 'logo-removal', '[gemini] bbox too wide, trimming', { rawW, maxW: Math.round(imgW * 0.40) });
    adjRawW = Math.round(imgW * 0.40);
    // Center the trimmed width on original center
    // rawLeft stays, we just reduce width
  }

  // Only do dynamic expansion if raw bbox is very small (likely missed the icon)
  // If the raw bbox is already substantial, just add a small margin
  const rawArea = (adjRawW * adjRawH) / (imgW * imgH);
  const isSmallDetection = rawArea < 0.015 && adjRawH < imgH * 0.08;

  if (!isSmallDetection) {
    // Raw bbox is already a reasonable size — just add small margin
    // Position-aware padding: protect nearby elements (headline below top logo, CTA above bottom logo)
    const padSide = Math.round(Math.max(adjRawW, adjRawH) * 0.05);
    const isTopHalf = rawTop < imgH * 0.5;
    const padTop = isTopHalf ? Math.round(adjRawH * 0.1) : Math.round(adjRawH * 0.03);
    const padBottom = isTopHalf ? Math.round(adjRawH * 0.03) : Math.round(adjRawH * 0.1);
    const finalLeft2 = Math.max(0, rawLeft - padSide);
    const finalTop2 = Math.max(0, rawTop - padTop);
    const finalW2 = Math.min(imgW - finalLeft2, adjRawW + padSide * 2);
    const finalH2 = Math.min(imgH - finalTop2, adjRawH + padTop + padBottom);
    const areaRatio2 = (finalW2 * finalH2) / (imgW * imgH);
    if (areaRatio2 > 0.15) {
      log('WARN', 'logo-removal', '[gemini] bbox too large', { areaRatio: areaRatio2.toFixed(2) });
      return null;
    }
    log('INFO', 'logo-removal', '[gemini] final bbox (no expansion needed)', { raw: { rawLeft, rawTop, rawW, rawH }, final: { finalLeft: finalLeft2, finalTop: finalTop2, finalW: finalW2, finalH: finalH2 } });

    // Verify
    try {
      const cropBuf2 = await sharp(imageBuffer).extract({ left: finalLeft2, top: finalTop2, width: finalW2, height: finalH2 }).jpeg({ quality: 90 }).toBuffer();
      const isLogo2 = await verifyLogo(cropBuf2);
      if (!isLogo2) { log('WARN', 'logo-removal', '[gemini] verification FAILED'); return null; }
      log('INFO', 'logo-removal', '[gemini] verification passed');
    } catch (e) { log('WARN', 'logo-removal', '[gemini] verify error', { err: e.message }); }

    return { type: 'logo', left: finalLeft2, top: finalTop2, width: finalW2, height: finalH2, blurShape: 'rect' };
  }

  // Small detection — scan for connected elements (icon above text, subtitle below, etc.)
  const scanPad = Math.round(Math.max(rawW, rawH) * 1.5);
  const scanLeft = Math.max(0, rawLeft - scanPad);
  const scanTop = Math.max(0, rawTop - scanPad);
  const scanRight = Math.min(imgW, rawLeft + rawW + scanPad);
  const scanBottom = Math.min(imgH, rawTop + rawH + scanPad);
  const scanW = scanRight - scanLeft;
  const scanH = scanBottom - scanTop;

  let finalLeft, finalTop, finalW, finalH;

  try {
    // Create difference map of scan area to find overlaid elements
    const scanBuf = await sharp(imageBuffer)
      .extract({ left: scanLeft, top: scanTop, width: scanW, height: scanH })
      .toBuffer();
    const blurR = Math.max(5, Math.round(Math.min(scanW, scanH) * 0.04));
    const scanBlurred = await sharp(scanBuf).blur(blurR).greyscale().raw().toBuffer();
    const scanOrig = await sharp(scanBuf).greyscale().raw().toBuffer();

    // Difference map
    const diffData = Buffer.alloc(scanW * scanH);
    for (let i = 0; i < scanW * scanH; i++) {
      diffData[i] = Math.min(255, Math.abs(scanOrig[i] - scanBlurred[i]) * 3);
    }

    // Find bright pixels near the detected bbox center
    const bboxCenterX = (rawLeft - scanLeft) + rawW / 2;
    const bboxCenterY = (rawTop - scanTop) + rawH / 2;
    const searchRadius = Math.max(rawW, rawH) * 1.5;
    const threshold = 25;

    let minX = (rawLeft - scanLeft), maxX = minX + rawW;
    let minY = (rawTop - scanTop), maxY = minY + rawH;

    // Expand bounds to include bright pixels within search radius of bbox center
    for (let y = 0; y < scanH; y++) {
      for (let x = 0; x < scanW; x++) {
        if (diffData[y * scanW + x] < threshold) continue;
        const dx = x - bboxCenterX;
        const dy = y - bboxCenterY;
        if (Math.sqrt(dx * dx + dy * dy) > searchRadius) continue;

        // Only expand if this pixel is roughly aligned (same column range or same row range)
        const inColRange = x >= minX - rawW * 0.3 && x <= maxX + rawW * 0.3;
        const inRowRange = y >= minY - rawH * 0.3 && y <= maxY + rawH * 0.3;
        if (inColRange || inRowRange) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Cap expansion: don't expand more than 3x original size in any dimension
    const expandedW = maxX - minX;
    const expandedH = maxY - minY;
    const maxExpW = rawW * 3;
    const maxExpH = rawH * 3;
    if (expandedW > maxExpW) {
      const centerX = (minX + maxX) / 2;
      minX = Math.round(centerX - maxExpW / 2);
      maxX = Math.round(centerX + maxExpW / 2);
      log('INFO', 'logo-removal', '[gemini] capped width expansion', { expandedW, maxExpW });
    }
    if (expandedH > maxExpH) {
      const centerY = (minY + maxY) / 2;
      minY = Math.round(centerY - maxExpH / 2);
      maxY = Math.round(centerY + maxExpH / 2);
      log('INFO', 'logo-removal', '[gemini] capped height expansion', { expandedH, maxExpH });
    }

    // Add small margin
    const margin = Math.round(Math.max(maxX - minX, maxY - minY) * 0.08);
    finalLeft = Math.max(0, scanLeft + minX - margin);
    finalTop = Math.max(0, scanTop + minY - margin);
    finalW = Math.min(imgW - finalLeft, (maxX - minX) + margin * 2);
    finalH = Math.min(imgH - finalTop, (maxY - minY) + margin * 2);

    log('INFO', 'logo-removal', '[gemini] dynamic expand', {
      raw: { rawLeft, rawTop, rawW, rawH },
      expanded: { finalLeft, finalTop, finalW, finalH }
    });
  } catch (expandErr) {
    // Fallback to simple padding if dynamic scan fails
    log('WARN', 'logo-removal', '[gemini] dynamic expand failed, using simple pad', { err: expandErr.message });
    const pad = Math.round(Math.max(rawW, rawH) * 0.15);
    finalLeft = Math.max(0, rawLeft - pad);
    finalTop = Math.max(0, rawTop - pad);
    finalW = Math.min(imgW - finalLeft, rawW + pad * 2);
    finalH = Math.min(imgH - finalTop, rawH + pad * 2);
  }

  // Area guard
  const areaRatio = (finalW * finalH) / (imgW * imgH);
  if (areaRatio > 0.15) {
    log('WARN', 'logo-removal', '[gemini] bbox too large', { areaRatio: areaRatio.toFixed(2), finalLeft, finalTop, finalW, finalH });
    return null;
  }

  log('INFO', 'logo-removal', '[gemini] final bbox', { raw: { rawLeft, rawTop, rawW, rawH }, final: { finalLeft, finalTop, finalW, finalH } });

  // Verify using the RAW detection bbox (not expanded) — the raw crop shows the actual logo clearly
  try {
    const verifyPad = Math.round(Math.max(rawW, rawH) * 0.15);
    const vLeft = Math.max(0, rawLeft - verifyPad);
    const vTop = Math.max(0, rawTop - verifyPad);
    const vW = Math.min(imgW - vLeft, rawW + verifyPad * 2);
    const vH = Math.min(imgH - vTop, rawH + verifyPad * 2);
    const cropBuf = await sharp(imageBuffer)
      .extract({ left: vLeft, top: vTop, width: vW, height: vH })
      .jpeg({ quality: 90 })
      .toBuffer();
    const isLogo = await verifyLogo(cropBuf);
    if (!isLogo) {
      log('WARN', 'logo-removal', '[gemini] verification FAILED — not a logo', { vLeft, vTop, vW, vH });
      return null;
    }
    log('INFO', 'logo-removal', '[gemini] verification passed');
  } catch (verifyErr) {
    log('WARN', 'logo-removal', '[gemini] verification error', { err: verifyErr.message });
  }

  return { type: 'logo', left: finalLeft, top: finalTop, width: finalW, height: finalH, blurShape: 'rect' };
}


function formatLogoResult(scanResult, imgW, imgH) {
  if (!scanResult) return null;
  if (scanResult.width > imgW * 0.5 && scanResult.height > imgH * 0.5) {
    log('WARN', 'logo-removal', '[fallback] too large, skip');
    return null;
  }
  return { type: 'logo', left: scanResult.left, top: scanResult.top, width: scanResult.width, height: scanResult.height, blurShape: scanResult.blurShape || 'rect' };
}

async function detectContact(imageBuffer, imgW, imgH) {
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (!geminiKey) return null;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an OCR specialist. Look at this advertisement image carefully.

Your task: Find any PHONE NUMBER visible in the image.

Israeli phone numbers look like:
- 10 digits starting with 05: 0525169333, 052-5169333, 052-516-9333
- Landline: 03-1234567, 09-1234567
- Toll-free: 1-800-123-456, 1800123456
- Short service: *1234, *6789
- Any string of 7-10 digits that could be a phone number

The phone number may appear ANYWHERE in the image — top, bottom, sides, overlaid on graphics.
It might be small text, colored text, or partially obscured.

DO NOT report these as phone numbers:
- Prices (₪1799, 2400 שח, etc.)
- Percentages (10%, 50%)
- Year numbers (2024, 2025)
- Numbers with fewer than 7 digits that are NOT preceded by * or 1-800

If you find a phone number, return its bounding box as JSON: [ymin, xmin, ymax, xmax] where values are 0-1000 scale.
If no phone number found, return exactly: []

Return ONLY the raw JSON array, no markdown, no explanation.`;

  // Pass 1: Full image
  const origJpg = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();

  let bbox = null;

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: origJpg.toString('base64') } },
      prompt
    ]);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    log('INFO', 'logo-removal', '[contact-detect] full-image response', { text });
    bbox = parseContactBbox(text);
  } catch (e) {
    log('WARN', 'logo-removal', '[contact-detect] full-image error', { err: e.message });
  }

  // Pass 2: If full image didn't find it, try bottom 50% cropped
  if (!bbox) {
    try {
      const cropTop = Math.round(imgH * 0.5);
      const cropH = imgH - cropTop;
      const croppedJpg = await sharp(imageBuffer)
        .extract({ left: 0, top: cropTop, width: imgW, height: cropH })
        .jpeg({ quality: 90 })
        .toBuffer();

      const result2 = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: croppedJpg.toString('base64') } },
        prompt
      ]);
      const text2 = result2.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      log('INFO', 'logo-removal', '[contact-detect] bottom-crop response', { text2 });

      const cropBbox = parseContactBbox(text2);
      if (cropBbox) {
        // Remap coordinates from cropped image back to full image
        const scaleY = cropH / imgH;
        bbox = [
          Math.round(cropBbox[0] * scaleY + 500),
          cropBbox[1],
          Math.round(cropBbox[2] * scaleY + 500),
          cropBbox[3]
        ];
        log('INFO', 'logo-removal', '[contact-detect] remapped from bottom crop', { original: cropBbox, remapped: bbox });
      }
    } catch (e) {
      log('WARN', 'logo-removal', '[contact-detect] bottom-crop error', { err: e.message });
    }
  }

  if (!bbox) return null;

  const rawLeft = Math.round(bbox[1] / 1000 * imgW);
  const rawTop = Math.round(bbox[0] / 1000 * imgH);
  const rawW = Math.round((bbox[3] - bbox[1]) / 1000 * imgW);
  const rawH = Math.round((bbox[2] - bbox[0]) / 1000 * imgH);

  if (rawW <= 0 || rawH <= 0) return null;

  // Small padding
  const pad = Math.round(Math.max(rawW, rawH) * 0.15);
  const finalLeft = Math.max(0, rawLeft - pad);
  const finalTop = Math.max(0, rawTop - pad);
  const finalW = Math.min(imgW - finalLeft, rawW + pad * 2);
  const finalH = Math.min(imgH - finalTop, rawH + pad * 2);

  // Area guard — phone numbers are small
  const areaRatio = (finalW * finalH) / (imgW * imgH);
  if (areaRatio > 0.08) {
    log('WARN', 'logo-removal', '[contact] bbox too large', { areaRatio: areaRatio.toFixed(2) });
    return null;
  }

  log('INFO', 'logo-removal', '[contact] detected', { finalLeft, finalTop, finalW, finalH });
  return { type: 'contact', left: finalLeft, top: finalTop, width: finalW, height: finalH, blurShape: 'rect' };
}

function parseContactBbox(text) {
  try {
    const parsed = JSON.parse(text);
    // Handle [{box_2d: [...]}, ...] format
    if (Array.isArray(parsed) && parsed[0]?.box_2d) {
      const b = parsed[0].box_2d;
      if (Array.isArray(b) && b.length === 4) return b;
    }
    // Handle [[ymin, xmin, ymax, xmax]] format
    if (Array.isArray(parsed) && Array.isArray(parsed[0]) && parsed[0].length === 4) {
      return parsed[0];
    }
    // Handle [ymin, xmin, ymax, xmax] format
    if (Array.isArray(parsed) && parsed.length === 4 && typeof parsed[0] === 'number') {
      return parsed;
    }
    // Empty array = not found
    if (Array.isArray(parsed) && parsed.length === 0) return null;
    return null;
  } catch {
    return null;
  }
}

/**
 * Sample edge colors around a region to understand the surrounding background.
 * Returns average color for each edge (top, bottom, left, right).
 */
async function sampleEdgeColors(imageBuffer, left, top, width, height, imgW, imgH) {
  const sampleDepth = Math.max(3, Math.round(Math.min(width, height) * 0.08));

  async function avgColor(l, t, w, h) {
    const cl = Math.max(0, l);
    const ct = Math.max(0, t);
    const cw = Math.min(w, imgW - cl);
    const ch = Math.min(h, imgH - ct);
    if (cw <= 0 || ch <= 0) return { r: 255, g: 255, b: 255 };
    const stats = await sharp(imageBuffer).extract({ left: cl, top: ct, width: cw, height: ch }).stats();
    return {
      r: Math.round(stats.channels[0].mean),
      g: Math.round(stats.channels[1].mean),
      b: Math.round(stats.channels[2].mean)
    };
  }

  return {
    top:    await avgColor(left, Math.max(0, top - sampleDepth), width, sampleDepth),
    bottom: await avgColor(left, top + height, width, sampleDepth),
    left:   await avgColor(Math.max(0, left - sampleDepth), top, sampleDepth, height),
    right:  await avgColor(left + width, top, sampleDepth, height)
  };
}

/**
 * Content-Aware Fill by stretching edge pixels inward.
 * Takes thin strips of pixels from each edge of the logo area,
 * stretches them to fill the gap, blends with distance weighting,
 * and feathers the edges for a seamless result.
 */
async function contentAwareFill(imageBuffer, bbox, imgW, imgH) {
  const { left, top, width, height, blurShape } = bbox;

  // Aggressively expand the area to cover the full logo + any bleed
  // The detection bbox often misses parts of the logo (e.g. taglines below icons)
  const expandX = Math.round(width * 0.4);
  const expandY = Math.round(height * 0.5);  // extra expansion downward for text below icons
  const fLeft = Math.max(0, left - expandX);
  const fTop = Math.max(0, top - expandY);
  const fRight = Math.min(imgW, left + width + expandX);
  const fBottom = Math.min(imgH, top + height + expandY);
  const fW = fRight - fLeft;
  const fH = fBottom - fTop;

  log('DEBUG', 'logo-removal', 'contentAwareFill', { original: { left, top, width, height }, expanded: { fLeft, fTop, fW, fH } });

  // Sample TRUE background from outside the expanded region
  const ringW = Math.max(10, Math.round(Math.min(width, height) * 0.4));
  const origRaw = await sharp(imageBuffer).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const imgCh = 3;

  function collectEdge(x1, y1, x2, y2) {
    const px = [];
    for (let y = Math.max(0, y1); y <= Math.min(imgH-1, y2); y += 2)
      for (let x = Math.max(0, x1); x <= Math.min(imgW-1, x2); x += 2) {
        const i = (y * imgW + x) * imgCh;
        px.push({ r: origRaw[i], g: origRaw[i+1], b: origRaw[i+2], bright: origRaw[i]+origRaw[i+1]+origRaw[i+2] });
      }
    return px;
  }

  const allEdge = [
    ...collectEdge(fLeft, fTop - ringW, fRight, fTop - 1),
    ...collectEdge(fLeft, fBottom + 1, fRight, fBottom + ringW),
    ...collectEdge(fLeft - ringW, fTop, fLeft - 1, fBottom),
    ...collectEdge(fRight + 1, fTop, fRight + ringW, fBottom)
  ];

  if (!allEdge.length) throw new Error('No edge samples');

  // P80 brightness — watermarks darken, so brighter = true background
  allEdge.sort((a, b) => a.bright - b.bright);
  const bg = allEdge[Math.min(allEdge.length - 1, Math.floor(allEdge.length * 0.80))];

  log('DEBUG', 'logo-removal', 'Fill color (P80)', { r: bg.r, g: bg.g, b: bg.b });

  // Create solid fill patch with feathered edges
  const feather = Math.max(5, Math.round(Math.min(fW, fH) * 0.1));

  // Extract original patch for per-pixel blending
  const patchRaw = await sharp(imageBuffer)
    .extract({ left: fLeft, top: fTop, width: fW, height: fH })
    .removeAlpha().toColourspace('srgb').raw().toBuffer();

  const resultRaw = Buffer.from(patchRaw);

  for (let y = 0; y < fH; y++) {
    for (let x = 0; x < fW; x++) {
      // Distance from edge (positive = inside, negative = outside)
      const dx = Math.min(x, fW - 1 - x);
      const dy = Math.min(y, fH - 1 - y);
      const dist = Math.min(dx, dy);

      let alpha;
      if (dist >= feather) {
        alpha = 1.0;
      } else {
        alpha = dist / feather;
        alpha = alpha * alpha * (3 - 2 * alpha); // smoothstep
      }

      const idx = (y * fW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const fillVal = c === 0 ? bg.r : c === 1 ? bg.g : bg.b;
        resultRaw[idx + c] = Math.round(patchRaw[idx + c] * (1 - alpha) + fillVal * alpha);
      }
    }
  }

  const finalBuffer = await sharp(resultRaw, { raw: { width: fW, height: fH, channels: 3 } })
    .blur(2)
    .jpeg({ quality: 95 }).toBuffer();

  log('DEBUG', 'logo-removal', 'Fill complete', { fLeft, fTop, fW, fH, fill: [bg.r, bg.g, bg.b] });
  return { buffer: finalBuffer, left: fLeft, top: fTop };
}

 
async function apiInpaint(imageBuffer, bbox, imgW, imgH) {
  const { left, top, width, height, blurShape } = bbox;

  // dall-e-2 needs square images. Create a square context region around the logo.
  const maxDim = Math.max(width, height);
  const pad = Math.round(maxDim * 0.8); // balanced context
  const size = Math.max(256, maxDim + pad * 2);

  const centerX = left + Math.round(width / 2);
  const centerY = top + Math.round(height / 2);
  const halfSize = Math.round(size / 2);

  const ctxLeft   = Math.max(0, centerX - halfSize);
  const ctxTop    = Math.max(0, centerY - halfSize);
  const ctxRight  = Math.min(imgW, centerX + halfSize);
  const ctxBottom = Math.min(imgH, centerY + halfSize);
  const ctxW = ctxRight - ctxLeft;
  const ctxH = ctxBottom - ctxTop;

  // Extract and resize to 512x512 square
  const targetSize = 512;
  const contextRgba = await sharp(imageBuffer)
    .extract({ left: ctxLeft, top: ctxTop, width: ctxW, height: ctxH })
    .resize(targetSize, targetSize, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Calculate logo position in the resized square
  const scaleX = targetSize / ctxW;
  const scaleY = targetSize / ctxH;
  const relLeft = Math.round((left - ctxLeft) * scaleX);
  const relTop = Math.round((top - ctxTop) * scaleY);
  const relW = Math.round(width * scaleX);
  const relH = Math.round(height * scaleY);

  // Create shape mask in the resized coordinates
  // Expand mask slightly to fully cover logo edges
  const maskPad = Math.round(Math.max(relW, relH) * 0.15);
  const mLeft = Math.max(0, relLeft - maskPad);
  const mTop = Math.max(0, relTop - maskPad);
  const mW = Math.min(targetSize - mLeft, relW + maskPad * 2);
  const mH = Math.min(targetSize - mTop, relH + maskPad * 2);

  const isEllipse = blurShape === 'ellipse';
  let shapeSvg;
  if (isEllipse) {
    const cx = mLeft + Math.round(mW / 2);
    const cy = mTop + Math.round(mH / 2);
    const rx = Math.round(mW / 2);
    const ry = Math.round(mH / 2);
    shapeSvg = `<svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`;
  } else {
    const r = Math.round(Math.min(mW, mH) * 0.1);
    shapeSvg = `<svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg"><rect x="${mLeft}" y="${mTop}" width="${mW}" height="${mH}" rx="${r}" ry="${r}" fill="white"/></svg>`;
  }

  const maskGray = await sharp(Buffer.from(shapeSvg))
    .resize(targetSize, targetSize)
    .grayscale()
    .raw()
    .toBuffer();

  // Punch transparent hole in the image where the logo is
  for (let i = 0; i < targetSize * targetSize; i++) {
    if (maskGray[i] > 128) {
      contextRgba[i * 4 + 3] = 0; // transparent = area to fill
    }
  }

  const maskedPng = await sharp(contextRgba, { raw: { width: targetSize, height: targetSize, channels: 4 } })
    .png()
    .toBuffer();

  const tmpDir = path.join(MEDIA_DIR, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, 'inpaint_' + Date.now() + '.png');
  fs.writeFileSync(tmpFile, maskedPng);

  try {
    log('DEBUG', 'logo-removal', 'Calling dall-e-2 edit', { ctxW, ctxH, targetSize, relLeft, relTop, relW, relH });

    const response = await openai.images.edit({
      model: 'dall-e-2',
      image: new File([fs.readFileSync(tmpFile)], 'image.png', { type: 'image/png' }),
      prompt: 'Fill this area with a smooth, clean continuation of the surrounding background. Match the exact colors and gradients visible around the edges. Generate ONLY plain background — no text, no letters, no words, no symbols, no shapes, no patterns. Just smooth solid or gradient color matching the surroundings.',
      size: '512x512',
    });

    let resultBuffer;
    const result = response.data[0];
    if (result.b64_json) {
      resultBuffer = Buffer.from(result.b64_json, 'base64');
    } else if (result.url) {
      resultBuffer = await fetchRemoteImage(result.url);
    } else {
      throw new Error('Unexpected response format');
    }

    // Resize back to original context dimensions
    const resized = await sharp(resultBuffer)
      .resize(ctxW, ctxH, { fit: 'fill' })
      .jpeg({ quality: 95 })
      .toBuffer();

    log('INFO', 'logo-removal', 'dall-e-2 inpaint success');
    return { buffer: resized, left: ctxLeft, top: ctxTop };
  } catch (err) {
    log('ERROR', 'logo-removal', 'dall-e-2 inpaint failed', { error: err.message, status: err.status });
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}


/**
 * Gemini crop-based inpaint: crops tight area around logo, asks Gemini to remove it,
 * extracts only the logo bbox area from the result and composites back.
 */
async function geminiCropInpaint(imageBuffer, bbox, imgW, imgH, bboxOnly = true) {
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (!geminiKey) return null;

  // Crop a small region around the logo
  const contextPad = Math.round(Math.max(bbox.width, bbox.height) * 0.5);
  const cropLeft = Math.max(0, bbox.left - contextPad);
  const cropTop = Math.max(0, bbox.top - contextPad);
  const cropRight = Math.min(imgW, bbox.left + bbox.width + contextPad);
  const cropBottom = Math.min(imgH, bbox.top + bbox.height + contextPad);
  const cropW = cropRight - cropLeft;
  const cropH = cropBottom - cropTop;

  const cropJpg = await sharp(imageBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .jpeg({ quality: 90 })
    .toBuffer();

  log('INFO', 'logo-removal', '[gemini-crop-inpaint] calling', { cropLeft, cropTop, cropW, cropH });

  // Use REST API directly — SDK doesn't support responseModalities IMAGE
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + geminiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cropJpg.toString('base64') } },
        { text: 'Remove the company logo/brand mark from the CENTER of this image. Replace ONLY the logo area with a smooth continuation of the surrounding background color. Keep everything else exactly as it is — do NOT remove or alter any other text, headlines, or elements that may be visible at the edges of this crop.' }
      ]}],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    })
  });

  const data = await res.json();
  if (data.error) {
    log('WARN', 'logo-removal', '[gemini-crop-inpaint] API error', { error: data.error.message });
    return null;
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  let imageData = null;
  for (const part of parts) {
    if (part.inlineData) {
      imageData = part.inlineData.data;
      break;
    }
  }

  if (!imageData) {
    log('WARN', 'logo-removal', '[gemini-crop-inpaint] no image returned');
    return null;
  }

  const patchBuffer = Buffer.from(imageData, 'base64');

  // Resize Gemini result to match crop
  const resizedPatch = await sharp(patchBuffer)
    .resize(cropW, cropH, { fit: 'fill' })
    .toBuffer();

  let result;
  if (bboxOnly) {
    // For contacts: extract ONLY the bbox area to avoid damaging nearby text
    const relLeft = bbox.left - cropLeft;
    const relTop = bbox.top - cropTop;
    const exW = Math.min(bbox.width, cropW - relLeft);
    const exH = Math.min(bbox.height, cropH - relTop);
    if (exW <= 0 || exH <= 0) return null;
    const bboxPatch = await sharp(resizedPatch)
      .extract({ left: relLeft, top: relTop, width: exW, height: exH })
      .jpeg({ quality: 95 }).toBuffer();
    result = await sharp(imageBuffer)
      .composite([{ input: bboxPatch, left: bbox.left, top: bbox.top }])
      .jpeg({ quality: 92 }).toBuffer();
  } else {
    // For logos: use full crop (catches text/icons outside tight bbox)
    const cropPatch = await sharp(resizedPatch).jpeg({ quality: 95 }).toBuffer();
    result = await sharp(imageBuffer)
      .composite([{ input: cropPatch, left: cropLeft, top: cropTop }])
      .jpeg({ quality: 92 }).toBuffer();
  }

  log('INFO', 'logo-removal', '[gemini-crop-inpaint] success');
  return result;
}

/**
 * Measure how well a patch matches the surrounding area.
 * Lower = better match. Compares inner patch color to a ring outside it.
 */
async function measurePatchMatch(fullImage, patchLeft, patchTop, patchW, patchH) {
  const meta = await sharp(fullImage).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  const innerStats = await sharp(fullImage)
    .extract({ left: patchLeft, top: patchTop, width: patchW, height: patchH })
    .stats();

  // Sample 4 strips OUTSIDE the patch (not overlapping) to get true surrounding color
  const stripW = Math.max(10, Math.round(Math.min(patchW, patchH) * 0.3));
  const strips = [
    // top strip
    { l: patchLeft, t: Math.max(0, patchTop - stripW), w: patchW, h: Math.min(stripW, patchTop) },
    // bottom strip
    { l: patchLeft, t: patchTop + patchH, w: patchW, h: Math.min(stripW, imgH - patchTop - patchH) },
    // left strip
    { l: Math.max(0, patchLeft - stripW), t: patchTop, w: Math.min(stripW, patchLeft), h: patchH },
    // right strip
    { l: patchLeft + patchW, t: patchTop, w: Math.min(stripW, imgW - patchLeft - patchW), h: patchH },
  ].filter(s => s.w > 0 && s.h > 0);

  if (strips.length === 0) return 0;

  let rSum = 0, gSum = 0, bSum = 0;
  for (const s of strips) {
    const st = await sharp(fullImage).extract({ left: s.l, top: s.t, width: s.w, height: s.h }).stats();
    rSum += st.channels[0].mean;
    gSum += st.channels[1].mean;
    bSum += st.channels[2].mean;
  }
  const n = strips.length;

  return Math.abs(innerStats.channels[0].mean - rSum / n) +
    Math.abs(innerStats.channels[1].mean - gSum / n) +
    Math.abs(innerStats.channels[2].mean - bSum / n);
}

/**
 * Create a gradient fill by interpolating edge colors from all 4 sides.
 * Much better than blurring the logo (which keeps logo color artifacts).
 */
async function gradientFill(imageBuffer, fLeft, fTop, fW, fH, imgW, imgH) {
  const sampleDepth = Math.max(5, Math.round(Math.min(fW, fH) * 0.15));

  async function sampleStrip(l, t, w, h) {
    const cl = Math.max(0, l), ct = Math.max(0, t);
    const cw = Math.min(w, imgW - cl), ch = Math.min(h, imgH - ct);
    if (cw <= 0 || ch <= 0) return null;
    return sharp(imageBuffer).extract({ left: cl, top: ct, width: cw, height: ch })
      .removeAlpha().toColourspace('srgb').raw().toBuffer()
      .then(raw => ({ raw, w: cw, h: ch }));
  }

  const [topStrip, bottomStrip, leftStrip, rightStrip] = await Promise.all([
    sampleStrip(fLeft, Math.max(0, fTop - sampleDepth), fW, sampleDepth),
    sampleStrip(fLeft, fTop + fH, fW, sampleDepth),
    sampleStrip(Math.max(0, fLeft - sampleDepth), fTop, sampleDepth, fH),
    sampleStrip(fLeft + fW, fTop, sampleDepth, fH),
  ]);

  function avgFromStrip(strip) {
    if (!strip) return null;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < strip.raw.length; i += 3) {
      r += strip.raw[i]; g += strip.raw[i+1]; b += strip.raw[i+2]; n++;
    }
    return n > 0 ? { r: r/n, g: g/n, b: b/n } : null;
  }

  function colorsPerCol(strip, cols) {
    if (!strip) return null;
    const colors = [];
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(Math.floor(x / cols * strip.w), strip.w - 1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < strip.h; y++) {
        const i = (y * strip.w + sx) * 3;
        r += strip.raw[i]; g += strip.raw[i+1]; b += strip.raw[i+2]; n++;
      }
      colors.push(n > 0 ? { r: r/n, g: g/n, b: b/n } : null);
    }
    return colors;
  }

  function colorsPerRow(strip, rows) {
    if (!strip) return null;
    const colors = [];
    for (let y = 0; y < rows; y++) {
      const sy = Math.min(Math.floor(y / rows * strip.h), strip.h - 1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let x = 0; x < strip.w; x++) {
        const i = (sy * strip.w + x) * 3;
        r += strip.raw[i]; g += strip.raw[i+1]; b += strip.raw[i+2]; n++;
      }
      colors.push(n > 0 ? { r: r/n, g: g/n, b: b/n } : null);
    }
    return colors;
  }

  const topColors = colorsPerCol(topStrip, fW);
  const bottomColors = colorsPerCol(bottomStrip, fW);
  const leftColors = colorsPerRow(leftStrip, fH);
  const rightColors = colorsPerRow(rightStrip, fH);

  const fallback = avgFromStrip(topStrip) || avgFromStrip(bottomStrip) ||
                   avgFromStrip(leftStrip) || avgFromStrip(rightStrip) ||
                   { r: 200, g: 200, b: 200 };

  // Bilinear interpolation from all 4 edges
  const resultRaw = Buffer.alloc(fW * fH * 3);
  for (let y = 0; y < fH; y++) {
    const ty = y / Math.max(1, fH - 1);
    for (let x = 0; x < fW; x++) {
      const tx = x / Math.max(1, fW - 1);

      const tC = topColors?.[x] || fallback;
      const bC = bottomColors?.[x] || fallback;
      const lC = leftColors?.[y] || fallback;
      const rC = rightColors?.[y] || fallback;

      const wT = Math.max(0.001, 1 - ty);
      const wB = Math.max(0.001, ty);
      const wL = Math.max(0.001, 1 - tx);
      const wR = Math.max(0.001, tx);
      const wSum = wT + wB + wL + wR;

      const idx = (y * fW + x) * 3;
      resultRaw[idx]     = Math.round((tC.r * wT + bC.r * wB + lC.r * wL + rC.r * wR) / wSum);
      resultRaw[idx + 1] = Math.round((tC.g * wT + bC.g * wB + lC.g * wL + rC.g * wR) / wSum);
      resultRaw[idx + 2] = Math.round((tC.b * wT + bC.b * wB + lC.b * wL + rC.b * wR) / wSum);
    }
  }

  return sharp(resultRaw, { raw: { width: fW, height: fH, channels: 3 } })
    .blur(Math.max(3, Math.round(Math.min(fW, fH) * 0.05)))
    .jpeg({ quality: 95 }).toBuffer();
}

/**
 * Remove detected regions — best-of-3 DALL-E with pre-validation + gradient fill fallback.
 * 1. Run 3 DALL-E attempts in parallel
 * 2. Score each by colorDiff, pick best
 * 3. Only apply if colorDiff < threshold
 * 4. If all fail → gradient fill from surrounding edge colors (no logo blur artifacts)
 */
async function removeRegions(imageBuffer, bboxes) {
  let current = imageBuffer;
  const meta = await sharp(current).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  for (const bbox of bboxes) {
    // No extra padding — detectLogo already adds proportional padding
    const fLeft = Math.max(0, bbox.left);
    const fTop = Math.max(0, bbox.top);
    const fW = Math.min(imgW - fLeft, bbox.width);
    const fH = Math.min(imgH - fTop, bbox.height);

    log('INFO', 'logo-removal', 'Removing region', { fLeft, fTop, fW, fH, type: bbox.type });

    let filled = false;
    const DALLE_THRESHOLD = 40;

    // Try Gemini inpaint first (crop-based, better quality)
    try {
      const geminiResult = await geminiCropInpaint(current, bbox, imgW, imgH, bbox.type === 'contact');
      if (geminiResult) {
        current = geminiResult;
        filled = true;
        log('INFO', 'logo-removal', 'Gemini crop inpaint applied');
      }
    } catch (err) {
      log('WARN', 'logo-removal', 'Gemini inpaint failed', { err: err.message });
    }

    // Fallback: Run 3 DALL-E attempts in parallel, pick the best one
    if (!filled) try {
      const attempts = await Promise.allSettled([
        apiInpaint(current, { ...bbox, blurShape: bbox.blurShape || 'rect' }, imgW, imgH),
        apiInpaint(current, { ...bbox, blurShape: bbox.blurShape || 'rect' }, imgW, imgH),
        apiInpaint(current, { ...bbox, blurShape: bbox.blurShape || 'rect' }, imgW, imgH),
      ]);

      const candidates = [];

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        if (attempt.status !== 'fulfilled' || !attempt.value) continue;

        const inpaintResult = attempt.value;
        try {
          const ctxMeta = await sharp(inpaintResult.buffer).metadata();
          const relLeft = Math.max(0, fLeft - inpaintResult.left);
          const relTop = Math.max(0, fTop - inpaintResult.top);
          const extractW = Math.min(ctxMeta.width - relLeft, fW);
          const extractH = Math.min(ctxMeta.height - relTop, fH);

          if (extractW <= 0 || extractH <= 0) continue;

          const bboxPatch = await sharp(inpaintResult.buffer)
            .extract({ left: relLeft, top: relTop, width: extractW, height: extractH })
            .jpeg({ quality: 95 })
            .toBuffer();

          // Test composite to measure color match BEFORE applying
          const testImage = await sharp(current)
            .composite([{ input: bboxPatch, left: fLeft, top: fTop }])
            .jpeg({ quality: 92 })
            .toBuffer();

          const colorDiff = await measurePatchMatch(testImage, fLeft, fTop, fW, fH);

          log('INFO', 'logo-removal', `DALL-E attempt ${i+1} colorDiff`, { colorDiff: colorDiff.toFixed(1) });
          candidates.push({ testImage, colorDiff, index: i });
        } catch (err) {
          log('WARN', 'logo-removal', `DALL-E attempt ${i+1} extract failed`, { err: err.message });
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.colorDiff - b.colorDiff);
        const best = candidates[0];
        log('INFO', 'logo-removal', 'Best DALL-E candidate', {
          index: best.index + 1,
          colorDiff: best.colorDiff.toFixed(1),
          totalCandidates: candidates.length,
          accepted: best.colorDiff < DALLE_THRESHOLD
        });

        if (best.colorDiff < DALLE_THRESHOLD) {
          current = best.testImage;
          filled = true;
          log('INFO', 'logo-removal', 'DALL-E best-of-3 applied');
        }
      }
    } catch (err) {
      log('WARN', 'logo-removal', 'DALL-E parallel attempts failed', { err: err.message });
    }

    // Fallback: gradient fill from surrounding edge colors
    if (!filled) {
      log('INFO', 'logo-removal', 'Using gradient fill fallback (edge interpolation)');

      const gradientPatch = await gradientFill(current, fLeft, fTop, fW, fH, imgW, imgH);

      const origPatchRaw = await sharp(current)
        .extract({ left: fLeft, top: fTop, width: fW, height: fH })
        .removeAlpha().toColourspace('srgb').raw().toBuffer();

      const gradientRaw = await sharp(gradientPatch)
        .resize(fW, fH, { fit: 'fill' })
        .removeAlpha().toColourspace('srgb').raw().toBuffer();

      // Feathered blend: smoothstep from edges inward
      const feather = Math.max(10, Math.round(Math.min(fW, fH) * 0.25));
      const resultRaw = Buffer.from(origPatchRaw);

      for (let y = 0; y < fH; y++) {
        for (let x = 0; x < fW; x++) {
          const dx = Math.min(x, fW - 1 - x);
          const dy = Math.min(y, fH - 1 - y);
          const dist = Math.min(dx, dy);
          let alpha;
          if (dist >= feather) {
            alpha = 1.0;
          } else {
            const t = dist / feather;
            alpha = t * t * (3 - 2 * t); // smoothstep
          }
          const idx = (y * fW + x) * 3;
          for (let c = 0; c < 3; c++) {
            resultRaw[idx + c] = Math.round(origPatchRaw[idx + c] * (1 - alpha) + gradientRaw[idx + c] * alpha);
          }
        }
      }

      const featheredPatch = await sharp(resultRaw, { raw: { width: fW, height: fH, channels: 3 } })
        .jpeg({ quality: 95 }).toBuffer();

      current = await sharp(current)
        .composite([{ input: featheredPatch, left: fLeft, top: fTop }])
        .jpeg({ quality: 92 })
        .toBuffer();
      log('INFO', 'logo-removal', 'Gradient fill with feathered edges applied');
    }
  }

  return current;
}


async function detectAllElements(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width;
  const imgH = meta.height;

  // Detect logo and phone number in parallel
  const [logoBbox, contactBbox] = await Promise.all([
    detectLogo(imageBuffer, imgW, imgH),
    detectContact(imageBuffer, imgW, imgH),
  ]);

  log('INFO', 'logo-removal', 'Detection complete', { logoBbox, contactBbox });
  return [logoBbox, contactBbox].filter(Boolean);
}

async function removeLogo(ad) {
  log('INFO', 'logo-removal', 'Starting removal', { adId: ad.id });
  const { buffer: imageBuffer, sourcePath } = await getImageBuffer(ad);
  const bboxes = await detectAllElements(imageBuffer);
  log('INFO', 'logo-removal', 'Regions', { adId: ad.id, bboxes });

  if (!bboxes.length) return { found: false, message: 'No logo, phone, or email detected' };

  const resultBuffer = await removeRegions(imageBuffer, bboxes);

  const baseSource = sourcePath || ad.local_image;
  let outputPath;
  if (baseSource) {
    const parsed = path.parse(getOriginalPath(baseSource));
    const outRel = path.join(parsed.dir, `${parsed.name}_nologo${parsed.ext}`);
    const outAbs = path.join(MEDIA_DIR, outRel);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, resultBuffer);
    outputPath = outRel;
  } else {
    const dir = path.join(MEDIA_DIR, 'processed');
    fs.mkdirSync(dir, { recursive: true });
    outputPath = `processed/${ad.id}_nologo.jpg`;
    fs.writeFileSync(path.join(MEDIA_DIR, outputPath), resultBuffer);
  }

  log('INFO', 'logo-removal', 'Saved', { adId: ad.id, outputPath });

  // QA: Programmatic color check + Gemini visual check
  // Use ORIGINAL imageBuffer for retries (not the already-modified result)
  let finalBuffer = resultBuffer;
  let finalOutputPath = outputPath;
  const geminiKey = process.env.GOOGLE_AI_API_KEY;

  for (let attempt = 1; attempt <= 2; attempt++) {
    log('INFO', 'logo-removal', 'QA check', { attempt, adId: ad.id });

    try {
      const b = bboxes[0];
      const pad = 30;
      const qaMeta = await sharp(finalBuffer).metadata();
      const qaLeft = Math.max(0, b.left - pad);
      const qaTop = Math.max(0, b.top - pad);
      const qaW = Math.min(qaMeta.width - qaLeft, b.width + pad * 2);
      const qaH = Math.min(qaMeta.height - qaTop, b.height + pad * 2);

      // --- Programmatic check: compare filled area color vs surrounding strips ---
      const colorDiff = await measurePatchMatch(finalBuffer, 
        Math.max(0, b.left), Math.max(0, b.top),
        Math.min(b.width, qaMeta.width - Math.max(0, b.left)),
        Math.min(b.height, qaMeta.height - Math.max(0, b.top)));

      log('INFO', 'logo-removal', 'QA color check', { colorDiff: colorDiff.toFixed(1), attempt });

      let isClean = colorDiff < 25;

      // --- Gemini visual check (if programmatic passed, double-check for text artifacts) ---
      if (isClean && geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const qaModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const qaCrop = await sharp(finalBuffer)
          .extract({ left: qaLeft, top: qaTop, width: qaW, height: qaH })
          .jpeg({ quality: 85 })
          .toBuffer();

        const qaResult = await qaModel.generateContent([
          { inlineData: { mimeType: 'image/jpeg', data: qaCrop.toString('base64') } },
          'This area had a logo removed. Does it contain ANY remaining text, letters, symbols, logos, or visible rectangular patches? Answer ONLY JSON: {"clean": true} or {"clean": false, "issue": "description"}'
        ]);

        const qaText = qaResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        log('INFO', 'logo-removal', 'QA Gemini result', { qaText, attempt });

        try {
          const qa = JSON.parse(qaText);
          if (!qa.clean) isClean = false;
        } catch {}
      } else if (!isClean) {
        log('WARN', 'logo-removal', 'QA FAILED — color mismatch detected', { colorDiff: colorDiff.toFixed(1), attempt });
      }

      if (isClean) {
        log('INFO', 'logo-removal', 'QA passed', { adId: ad.id, attempt });
        break;
      }

      // Retry: first attempt retries DALL-E, second attempt uses solid color fill
      log('WARN', 'logo-removal', 'QA failed, retrying removal from original image', { attempt });
      if (attempt === 1) {
        finalBuffer = await removeRegions(imageBuffer, bboxes);
      } else {
        // QA failed twice — try Gemini crop inpaint as final fallback
        log('INFO', 'logo-removal', 'QA failed twice, trying Gemini inpaint as final fallback');
        try {
          const fallbackMeta2 = await sharp(imageBuffer).metadata();
          const gemFallback = await geminiCropInpaint(imageBuffer, bboxes[0], fallbackMeta2.width, fallbackMeta2.height);
          if (gemFallback) {
            finalBuffer = gemFallback;
            const outAbs2 = path.join(MEDIA_DIR, finalOutputPath);
            fs.writeFileSync(outAbs2, finalBuffer);
            log('INFO', 'logo-removal', 'Gemini fallback applied, accepting result');
            break;
          }
        } catch (gemErr) {
          log('WARN', 'logo-removal', 'Gemini fallback failed', { err: gemErr.message });
        }
        // Last resort: gradient fill
        log('INFO', 'logo-removal', 'Using gradient fill as last resort');
        const fallbackMeta = await sharp(imageBuffer).metadata();
        let fb = imageBuffer;
        for (const bbox of bboxes) {
          const fLeft = Math.max(0, bbox.left);
          const fTop = Math.max(0, bbox.top);
          const fW = Math.min(fallbackMeta.width - fLeft, bbox.width);
          const fH = Math.min(fallbackMeta.height - fTop, bbox.height);

          const gPatch = await gradientFill(fb, fLeft, fTop, fW, fH, fallbackMeta.width, fallbackMeta.height);

          // Feathered blend
          const origRaw = await sharp(fb)
            .extract({ left: fLeft, top: fTop, width: fW, height: fH })
            .removeAlpha().toColourspace('srgb').raw().toBuffer();
          const gRaw = await sharp(gPatch)
            .resize(fW, fH, { fit: 'fill' })
            .removeAlpha().toColourspace('srgb').raw().toBuffer();
          const feather = Math.max(8, Math.round(Math.min(fW, fH) * 0.2));
          const rBuf = Buffer.from(origRaw);
          for (let y = 0; y < fH; y++) {
            for (let x = 0; x < fW; x++) {
              const dx = Math.min(x, fW - 1 - x);
              const dy = Math.min(y, fH - 1 - y);
              const dist = Math.min(dx, dy);
              let a = dist >= feather ? 1.0 : (() => { const t = dist / feather; return t * t * (3 - 2 * t); })();
              const idx = (y * fW + x) * 3;
              for (let c = 0; c < 3; c++) rBuf[idx+c] = Math.round(origRaw[idx+c] * (1-a) + gRaw[idx+c] * a);
            }
          }
          const patch = await sharp(rBuf, { raw: { width: fW, height: fH, channels: 3 } })
            .jpeg({ quality: 95 }).toBuffer();
          fb = await sharp(fb).composite([{ input: patch, left: fLeft, top: fTop }])
            .jpeg({ quality: 92 }).toBuffer();
        }
        finalBuffer = fb;
      }

      const outAbs = path.join(MEDIA_DIR, finalOutputPath);
      fs.writeFileSync(outAbs, finalBuffer);
      log('INFO', 'logo-removal', 'Re-saved after QA retry', { adId: ad.id, attempt });
    } catch (qaErr) {
      log('WARN', 'logo-removal', 'QA error, skipping', { err: qaErr.message });
      break;
    }
  }

  return { found: true, elements: bboxes.map(b => b.type), bboxes, outputPath: finalOutputPath, message: `Removed: ${bboxes.map(b => b.type).join(', ')}` };
}

module.exports = { removeLogo, detectAllElements };
