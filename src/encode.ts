import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// sample.bin
// const FILENAME = 'sample';
// const IMAGE_WIDTH = 735;
// const IMAGE_HEIGHT = 588;
// const IMAGE_CHANNEL_COUNT = 4;

// cat.bin
const FILENAME = 'cat';
const IMAGE_WIDTH = 3000;
const IMAGE_HEIGHT = 4000;
const IMAGE_CHANNEL_COUNT = 4;

async function encode() {
    const rawPixelsBuffer = await fs.readFile(path.join(import.meta.dirname, '..', 'assets', `${FILENAME}.bin`));
    const rawPixelsBufferCopy = new Uint8Array(rawPixelsBuffer.buffer, rawPixelsBuffer.byteOffset, rawPixelsBuffer.byteLength).slice();

    const outputChunks = [
        // magic
        new Uint8Array([
            0b01110001,
            0b01101111,
            0b01101001,
            0b01100110,
        ]),
        // width & height in big endian
        new Uint8Array([
            (IMAGE_WIDTH >>> 24) & 0b11111111,
            (IMAGE_WIDTH >>> 16) & 0b11111111,
            (IMAGE_WIDTH >>> 8) & 0b11111111,
            (IMAGE_WIDTH >>> 0) & 0b11111111,

            (IMAGE_HEIGHT >>> 24) & 0b11111111,
            (IMAGE_HEIGHT >>> 16) & 0b11111111,
            (IMAGE_HEIGHT >>> 8) & 0b11111111,
            (IMAGE_HEIGHT >>> 0) & 0b11111111,
        ]),
        new Uint8Array([
            0b00000100, // channels - RGBA
            0b00000001, // colorspace - all channels linear
        ]),
    ];

    for (let offset = 0; offset < rawPixelsBufferCopy.byteLength - IMAGE_CHANNEL_COUNT; offset += IMAGE_CHANNEL_COUNT) {
        const rawPixel = rawPixelsBufferCopy.slice(offset, offset + IMAGE_CHANNEL_COUNT);

        const qoiRgbaOpChunk = new Uint8Array([
            0b11111111, // tag
            rawPixel[0], // r
            rawPixel[1], // g
            rawPixel[2], // b
            rawPixel[3], // a
        ]);

        outputChunks.push(qoiRgbaOpChunk);
    }

    // eof mark
    outputChunks.push(new Uint8Array([
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000001,
    ]));

    await fs.writeFile(path.join(import.meta.dirname, '..', 'assets', `${FILENAME}.qoi`), Buffer.concat(outputChunks));
}

await encode();

// export default encode;
