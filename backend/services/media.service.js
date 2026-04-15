const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { log } = require('../utils/logger');
const db = require('../config/db');
const storage = require('./storage.service');

const MEDIA_BASE = storage.MEDIA_BASE;

async function downloadMediaIfNeeded(ad, adAccountId) {
  const startTime = Date.now();
  const imageUrl = ad.image_url || ad.thumbnail_url;

  log('DEBUG', 'media', 'Entry: downloadMediaIfNeeded', { adId: ad.id, adAccountId, imageUrl: imageUrl || null });

  if (!imageUrl) {
    log('DEBUG', 'media', 'Validation: no image URL', { adId: ad.id });
    return { downloaded: false, reason: 'no_url' };
  }

  const originalRel = `images/${adAccountId}/${ad.id}_original.jpg`;
  const thumbRel = `images/${adAccountId}/${ad.id}_thumb.jpg`;

  // Already downloaded?
  if (await storage.exists(originalRel)) {
    log('DEBUG', 'media', 'Already exists, skipping download', { adId: ad.id, key: originalRel });
    return { downloaded: false, reason: 'already_exists' };
  }

  try {
    log('DEBUG', 'media', 'Downloading image', { adId: ad.id });
    const response = await fetch(imageUrl);

    if (!response.ok) {
      log('WARN', 'media', 'Download failed', { adId: ad.id, status: response.status });
      return { downloaded: false, error: `HTTP ${response.status}` };
    }

    // Check content-type
    const contentType = response.headers.get('content-type');
    log('DEBUG', 'media', 'Content-type validation', { adId: ad.id, contentType });

    // Check size (skip > 50MB)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      log('WARN', 'media', 'File too large, skipping', { adId: ad.id, size: contentLength });
      return { downloaded: false, error: 'file_too_large' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      log('WARN', 'media', 'Empty file', { adId: ad.id });
      return { downloaded: false, error: 'empty_file' };
    }

    // Save original
    await storage.putObject(originalRel, buffer, 'image/jpeg');
    log('DEBUG', 'media', 'Original saved', { adId: ad.id, size: buffer.length });

    // Generate thumbnail
    try {
      const thumbBuf = await sharp(buffer).resize(300).jpeg({ quality: 80 }).toBuffer();
      await storage.putObject(thumbRel, thumbBuf, 'image/jpeg');
      log('DEBUG', 'media', 'Thumbnail generated', { adId: ad.id });
    } catch (sharpErr) {
      log('WARN', 'media', 'Thumbnail generation failed', { adId: ad.id, error: sharpErr.message });
    }

    await db('ads').where({ id: ad.id }).update({ local_image: originalRel, updated_at: new Date() });
    log('DEBUG', 'media', 'DB updated', { adId: ad.id, relativePath: originalRel });

    const duration = Date.now() - startTime;
    log('INFO', 'media', 'Exit: downloadMediaIfNeeded', { adId: ad.id, size: buffer.length, path: originalRel, duration });
    return { downloaded: true };

  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'media', 'Download error', { adId: ad.id, adAccountId, imageUrl, error: err.message, stack: err.stack, duration });
    return { downloaded: false, error: err.message };
  }
}

async function downloadVideoIfNeeded(ad, adAccountId) {
  const videoUrl = ad.video_url;
  if (!videoUrl) return { downloaded: false, reason: 'no_url' };

  const videoRel = `videos/${adAccountId}/${ad.id}.mp4`;

  if (await storage.exists(videoRel)) return { downloaded: false, reason: 'already_exists' };

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return { downloaded: false, error: `HTTP ${response.status}` };

    const contentLength = response.headers.get('content-length');
    // Skip videos > 100MB
    if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) {
      return { downloaded: false, error: 'file_too_large' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return { downloaded: false, error: 'empty_file' };

    await storage.putObject(videoRel, buffer, 'video/mp4');
    await db('ads').where({ id: ad.id }).update({ local_video: videoRel, updated_at: new Date() });

    log('INFO', 'media', 'Video downloaded', { adId: ad.id, size: buffer.length, path: videoRel });
    return { downloaded: true };
  } catch (err) {
    log('ERROR', 'media', 'Video download error', { adId: ad.id, error: err.message });
    return { downloaded: false, error: err.message };
  }
}

module.exports = { downloadMediaIfNeeded, downloadVideoIfNeeded };
