const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const MEDIA_BASE = path.join(__dirname, '..', 'data', 'media');
const STORAGE = (process.env.MEDIA_STORAGE || 'local').toLowerCase();
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL;
const S3_PREFIX = (process.env.S3_PREFIX || 'media').replace(/^\/+|\/+$/g, '');

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({ region: S3_REGION });
  return s3Client;
}

async function putObject(relKey, buffer, contentType) {
  if (STORAGE === 's3') {
    if (!S3_BUCKET) throw new Error('S3_BUCKET not set but MEDIA_STORAGE=s3');
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const Key = `${S3_PREFIX}/${relKey}`;
    await getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    log('DEBUG', 'storage', 'S3 put', { key: Key, size: buffer.length });
    return relKey;
  }

  const abs = path.join(MEDIA_BASE, relKey);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer);
  return relKey;
}

async function exists(relKey) {
  if (STORAGE === 's3') {
    if (!S3_BUCKET) return false;
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await getS3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: `${S3_PREFIX}/${relKey}` }));
      return true;
    } catch {
      return false;
    }
  }
  return fs.existsSync(path.join(MEDIA_BASE, relKey));
}

function publicUrl(relKey) {
  if (STORAGE === 's3') {
    if (S3_PUBLIC_BASE) return `${S3_PUBLIC_BASE.replace(/\/+$/, '')}/${S3_PREFIX}/${relKey}`;
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${S3_PREFIX}/${relKey}`;
  }
  return `/media/${relKey}`;
}

async function getSignedReadUrl(relKey, expiresSeconds = 3600) {
  if (STORAGE !== 's3') return publicUrl(relKey);
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: `${S3_PREFIX}/${relKey}` }),
    { expiresIn: expiresSeconds }
  );
}

module.exports = {
  STORAGE,
  MEDIA_BASE,
  putObject,
  exists,
  publicUrl,
  getSignedReadUrl,
  isS3: () => STORAGE === 's3'
};
