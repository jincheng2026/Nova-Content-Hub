import {createHash} from 'node:crypto';

export class ImageValidationError extends Error {
    constructor(code, message, cause) {
        super(message, cause ? {cause} : undefined);
        this.name = 'ImageValidationError';
        this.code = code;
    }
}

// Decode the original bounded bytes fully; metadata alone cannot detect truncated pixel data.
export async function validateImage(bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 64 * 1024 * 1024) throw new ImageValidationError('INVALID_IMAGE', 'Image must contain 1 byte to 64 MiB');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
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
    try {
        sharp = (await import('sharp')).default;
    } catch (error) {
        throw new ImageValidationError('DECODER_UNAVAILABLE', 'The packaged image decoder is unavailable', error);
    }
    try {
        const options = {failOn: 'warning', limitInputPixels: 40_000_000, animated: true};
        const metadata = await sharp(bytes, options).metadata();
        if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Only static PNG, JPEG and WebP are supported');
        const {data, info} = await sharp(bytes, options).autoOrient().raw().toBuffer({resolveWithObject: true});
        const swapped = [5, 6, 7, 8].includes(metadata.orientation);
        const width = swapped ? metadata.height : metadata.width;
        const height = swapped ? metadata.width : metadata.height;
        if (!width || !height || width * height > 40_000_000 || info.width !== width || info.height !== height || data.length !== width * height * info.channels) throw new Error('Decoded pixel dimensions do not match the source');
        return {
            format: metadata.format,
            width,
            height,
            assetHash: createHash('sha256').update(bytes).digest('hex'),
            bytes: bytes.length,
            decoded: true
        };
    } catch (error) {
        throw new ImageValidationError('INVALID_IMAGE', `Image did not fully decode: ${error.message}`, error);
    }
}

export const IMPORTED_RASTER_LIMITS = Object.freeze({
    encodedBytes: 64 * 1024 * 1024,
    pixels: 40_000_000,
    frames: 256,
    decodedBytes: 160_000_000
});

// libvips tolerates incomplete GIF tails and may silently report fewer pages.
function gifFrames(bytes) {
    const invalid = () => {
        throw new ImageValidationError('INVALID_IMAGE', 'GIF container is incomplete or invalid');
    };
    if (bytes.length < 14) invalid();
    const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
    let offset = 13 + (bytes[10] & 128 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0);
    let frames = 0;

    function subblocks() {
        for (; ;) {
            if (offset >= bytes.length) invalid();
            const length = bytes[offset++];
            if (offset + length > bytes.length) invalid();
            offset += length;
            if (!length) return;
        }
    }

    while (offset < bytes.length) {
        const type = bytes[offset++];
        if (type === 0x3b) {
            if (!frames || offset !== bytes.length) invalid();
            return frames;
        }
        if (type === 0x21) {
            if (offset >= bytes.length) invalid();
            offset++;
            subblocks();
            continue;
        }
        if (type !== 0x2c || offset + 9 > bytes.length) invalid();
        const left = bytes.readUInt16LE(offset), top = bytes.readUInt16LE(offset + 2),
            w = bytes.readUInt16LE(offset + 4), h = bytes.readUInt16LE(offset + 6), flags = bytes[offset + 8];
        if (!w || !h || left + w > width || top + h > height) invalid();
        offset += 9 + (flags & 128 ? 3 * (2 ** ((flags & 7) + 1)) : 0);
        if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) invalid();
        offset++;
        subblocks();
        frames++;
        if (frames > IMPORTED_RASTER_LIMITS.frames) throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported GIF exceeds frame limit');
    }
    invalid();
}

function webpFrames(bytes) {
    const invalid = () => {
        throw new ImageValidationError('INVALID_IMAGE', 'WebP container is incomplete or invalid');
    };
    if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
    let frames = 0, offset = 12, animated = false;
    while (offset < bytes.length) {
        if (offset + 8 > bytes.length) invalid();
        const type = bytes.subarray(offset, offset + 4).toString('ascii'), length = bytes.readUInt32LE(offset + 4);
        if (offset + 8 + length + (length % 2) > bytes.length) invalid();
        if (type === 'ANIM' || type === 'ANMF' || type === 'VP8X' && length && bytes[offset + 8] & 2) animated = true;
        if (type === 'ANMF') frames++;
        if (frames > IMPORTED_RASTER_LIMITS.frames) throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported WebP exceeds frame limit');
        offset += 8 + length + (length % 2);
    }
    if (animated && !frames) invalid();
    return animated ? frames : null;
}

// Imported originals may animate; receipt validation above deliberately remains static-only.
export async function validateImportedRaster(bytes) {
    const limits = IMPORTED_RASTER_LIMITS;
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new ImageValidationError('INVALID_IMAGE', 'Expected non-empty raster bytes');
    if (bytes.length > limits.encodedBytes) throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported raster exceeds 64 MiB');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    const gif = ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
    if (!png && !jpeg && !webp && !gif) throw new ImageValidationError('INVALID_IMAGE', 'Only PNG, JPEG, WebP and GIF raster bytes are supported');
    if (png) for (let offset = 8; offset + 8 <= bytes.length;) {
        if (bytes.subarray(offset + 4, offset + 8).toString('ascii') === 'acTL') throw new ImageValidationError('UNSUPPORTED_IMAGE', 'APNG full-frame decoding is unsupported');
        offset += bytes.readUInt32BE(offset) + 12;
    }
    const containerFrames = gif ? gifFrames(bytes) : webp ? webpFrames(bytes) : null;
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch (error) {
        throw new ImageValidationError('DECODER_UNAVAILABLE', 'The packaged image decoder is unavailable', error);
    }
    try {
        const options = {failOn: 'warning', limitInputPixels: limits.pixels, animated: true, sequentialRead: true};
        const metadata = await sharp(bytes, options).metadata();
        const frames = metadata.pages || 1;
        const frameHeight = metadata.pageHeight || metadata.height;
        if (!['png', 'jpeg', 'webp', 'gif'].includes(metadata.format) || !Number.isSafeInteger(frames) || frames < 1 || !metadata.width || !frameHeight) throw new Error('Invalid raster metadata');
        if (containerFrames !== null && containerFrames !== frames) throw new Error('Decoder did not expose every container frame');
        if (frames > limits.frames || metadata.width * frameHeight * frames > limits.pixels) throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported raster exceeds frame or total pixel limits');
        if (metadata.format !== 'gif' && containerFrames === null && frames === 1) {
            const result = await validateImage(bytes);
            return {...result, frames: 1};
        }
        const decoder = sharp(bytes, options).ensureAlpha().raw();
        let outputInfo;
        let total = 0;
        decoder.on('info', info => {
            outputInfo = info;
        });
        for await (const chunk of decoder) {
            total += chunk.length;
            if (total > limits.decodedBytes) {
                decoder.destroy();
                throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported raster exceeds decoded byte limit');
            }
        }
        if (!outputInfo || outputInfo.width !== metadata.width || outputInfo.height !== frameHeight * frames || outputInfo.channels !== 4 || total !== metadata.width * frameHeight * frames * 4) throw new Error('Decoded pixels do not match every declared frame');
        const swapped = [5, 6, 7, 8].includes(metadata.orientation);
        return {
            format: metadata.format,
            width: swapped ? frameHeight : metadata.width,
            height: swapped ? metadata.width : frameHeight,
            frames,
            assetHash: createHash('sha256').update(bytes).digest('hex'),
            bytes: bytes.length,
            decoded: true
        };
    } catch (error) {
        if (error instanceof ImageValidationError) throw error;
        if (/pixel limit/i.test(error.message)) throw new ImageValidationError('IMAGE_LIMIT_EXCEEDED', 'Imported raster exceeds total pixel limit', error);
        throw new ImageValidationError('INVALID_IMAGE', `Imported raster did not fully decode: ${error.message}`, error);
    }
}
