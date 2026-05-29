import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hrtime } from 'node:process';

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

function hashIndex(r: number, g: number, b: number, a: number): number {
    return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

function finalizeRun(output: Uint8Array[], trackers: { runLength: number }, condition: (runLength: number) => boolean) {
    if (condition(trackers.runLength) === true) {
        output.push(new Uint8Array([0b11000000 | (trackers.runLength - 1)]));
        trackers.runLength = 0;
    }
}

function writePixel(output: Uint8Array[], r: number, g: number, b: number, a: number, rp: number, gp: number, bp: number, ap: number) {
    if (a === ap) {
        const QOI_OP_RGB_CHUNK = new Uint8Array([0b11111110, r, g, b]);
        output.push(QOI_OP_RGB_CHUNK);
    } else {
        const QOI_OP_RGBA_CHUNK = new Uint8Array([0b11111111, r, g, b, a]);
        output.push(QOI_OP_RGBA_CHUNK);
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

    let runningPixelArray: number[][] = Array.from({ length: 64 }, () => ([]));

    for (let offset = 0; offset < rawPixelsBufferCopy.byteLength; offset += IMAGE_CHANNEL_COUNT) {
        const [r, g, b, a] = rawPixelsBufferCopy.subarray(offset, offset + IMAGE_CHANNEL_COUNT);

        const currentHash = hashIndex(r, g, b, a);

        if (r === prevPixelRed && g === prevPixelGreen && b === prevPixelBlue && a === prevPixelAlpha) {
            trackers.runLength++;

            finalizeRun(outputChunks, trackers, runLength => runLength === 62);
        } else {
            finalizeRun(outputChunks, trackers, runLength => runLength > 0);

            const storedPixel = runningPixelArray[currentHash];
            if (storedPixel.length > 0) {
                const [sr, sg, sb, sa] = storedPixel;

                if (r === sr && g === sg && b === sb && a === sa) {
                    const QOI_OP_INDEX = new Uint8Array([0b00000000 | currentHash]);
                    outputChunks.push(QOI_OP_INDEX);
                } else {
                    writePixel(outputChunks, r, g, b, a, prevPixelRed, prevPixelGreen, prevPixelBlue, prevPixelAlpha);
                }
            } else {
                writePixel(outputChunks, r, g, b, a, prevPixelRed, prevPixelGreen, prevPixelBlue, prevPixelAlpha);
            }
        }

        runningPixelArray[currentHash][0] = r;
        runningPixelArray[currentHash][1] = g;
        runningPixelArray[currentHash][2] = b;
        runningPixelArray[currentHash][3] = a;

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
