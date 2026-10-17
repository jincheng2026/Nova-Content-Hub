import { createHash } from 'node:crypto';

export class ImageValidationError extends Error {
  constructor(code, message, cause) { super(message, cause ? { cause } : undefined); this.name = 'ImageValidationError'; this.code = code; }
}

// Decode the original bounded bytes fully; metadata alone cannot detect truncated pixel data.
export async function validateImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 64 * 1024 * 1024) throw new ImageValidationError('INVALID_IMAGE', 'Image must contain 1 byte to 64 MiB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!png && !jpeg && !webp) throw new ImageValidationError('INVALID_IMAGE', 'Only static PNG, JPEG and WebP raster bytes are accepted');
  // libvips may expose only the first APNG frame; reject animation at the container boundary.
  if (png || webp) {
    for (let offset = png ? 8 : 12; offset + 8 <= bytes.length;) {
      const type = bytes.subarray(offset + (png ? 4 : 0), offset + (png ? 8 : 4)).toString('ascii');
      const length = png ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
      if ((png && type === 'acTL') || (webp && (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && offset + 8 < bytes.length && (bytes[offset + 8] & 2))))) throw new ImageValidationError('INVALID_IMAGE', 'Animated image containers are not accepted');
      offset += png ? length + 12 : length + 8 + (length % 2);
    }
  }
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch (error) { throw new ImageValidationError('DECODER_UNAVAILABLE', 'The packaged image decoder is unavailable', error); }
  try {
    const options = { failOn: 'warning', limitInputPixels: 40_000_000, animated: true };
    const metadata = await sharp(bytes, options).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Only static PNG, JPEG and WebP are supported');
    const { data, info } = await sharp(bytes, options).autoOrient().raw().toBuffer({ resolveWithObject: true });
    const swapped = [5, 6, 7, 8].includes(metadata.orientation);
    const width = swapped ? metadata.height : metadata.width;
    const height = swapped ? metadata.width : metadata.height;
    if (!width || !height || width * height > 40_000_000 || info.width !== width || info.height !== height || data.length !== width * height * info.channels) throw new Error('Decoded pixel dimensions do not match the source');
    return { format: metadata.format, width, height, assetHash: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, decoded: true };
  } catch (error) { throw new ImageValidationError('INVALID_IMAGE', `Image did not fully decode: ${error.message}`, error); }
}
