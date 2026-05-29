import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hrtime } from 'node:process';

// sample.bin
// const FILENAME = 'sample';
// const IMAGE_WIDTH = 735;
// const IMAGE_HEIGHT = 588;
// const IMAGE_CHANNEL_COUNT = 4;

function finalizeRun(output: Uint8Array[], trackers: { runLength: number }, condition: (runLength: number) => boolean) {
    if (condition(trackers.runLength) === true) {
        output.push(new Uint8Array([0b11000000 | (trackers.runLength - 1)]));
        trackers.runLength = 0;
    }
}

async function encode() {
    const start = process.hrtime.bigint();
    const rawPixelsBuffer = await fs.readFile(path.join(import.meta.dirname, '..', 'assets', `${FILENAME}.bin`));
    const rawPixelsBufferCopy = new Uint8Array(rawPixelsBuffer.buffer, rawPixelsBuffer.byteOffset, rawPixelsBuffer.byteLength);

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

    let trackers = {
        runLength: 0,
    };

    let prevPixelRed = 0;
    let prevPixelGreen = 0;
    let prevPixelBlue = 0;
    let prevPixelAlpha = 255;

    for (let offset = 0; offset < rawPixelsBufferCopy.byteLength - IMAGE_CHANNEL_COUNT; offset += IMAGE_CHANNEL_COUNT) {
        const [r, g, b, a] = rawPixelsBufferCopy.subarray(offset, offset + IMAGE_CHANNEL_COUNT);

        if (r === prevPixelRed && g === prevPixelGreen && b === prevPixelBlue && a === prevPixelAlpha) {
            trackers.runLength++;

            finalizeRun(outputChunks, trackers, runLength => runLength === 62);
        } else {
            finalizeRun(outputChunks, trackers, runLength => runLength > 0);

            const QOI_RGBA_OP_CHUNK = new Uint8Array([0b11111111, r, g, b, a]);
            outputChunks.push(QOI_RGBA_OP_CHUNK);
        }

        prevPixelRed = r;
        prevPixelGreen = g;
        prevPixelBlue = b;
        prevPixelAlpha = a;
    }

    finalizeRun(outputChunks, trackers, runLength => runLength > 0);

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
    console.log(`Process took: ${(process.hrtime.bigint() - start) / 1000n / 1000n} ms`);
}

await encode();

// export default encode;
