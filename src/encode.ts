import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { hrtime } from 'node:process';
import { parseArgs } from 'node:util';

// sample.bin
// const FILEPATH = 'sample';
// const IMAGE_WIDTH = 735;
// const IMAGE_HEIGHT = 588;
// const IMAGE_CHANNEL_COUNT = 4;

// cat.bin
// const FILEPATH = 'cat';
// const IMAGE_WIDTH = 3000;
// const IMAGE_HEIGHT = 4000;
// const IMAGE_CHANNEL_COUNT = 4;

interface Options {
    FILEPATH: string,
    IMAGE_WIDTH: number,
    IMAGE_HEIGHT: number,
    IMAGE_CHANNEL_COUNT?: number,
};

function parseOptions(): Options {
    try {
        const { positionals } = parseArgs({ allowPositionals: true });

        const [FILEPATH, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNEL_COUNT = '4', ...extra] = positionals;

        // 3. Validation: Ensure the required arguments are present
        if (!FILEPATH || !IMAGE_WIDTH || !IMAGE_HEIGHT) {
            console.error('Error: Missing required positional arguments.');
            console.error('Usage: node script.js <FILEPATH> <IMAGE_WIDTH> <IMAGE_HEIGHT> [IMAGE_CHANNEL_COUNT=4]');
            process.exit(1);
        }

        const argsDictionary = {
            FILEPATH,
            IMAGE_WIDTH: parseInt(IMAGE_WIDTH, 10),
            IMAGE_HEIGHT: parseInt(IMAGE_HEIGHT, 10),
            IMAGE_CHANNEL_COUNT: parseInt(IMAGE_CHANNEL_COUNT, 10),
        };

        if (extra.length > 0) {
            console.error(`Error: Too many arguments provided: ${extra.join(', ')}`);
            process.exit(1);
        }

        return argsDictionary;
    } catch (error) {
        if (error instanceof Error) {
            console.error('Parsing error:', error.message);
        }

        process.exit(1);
    }
}

function hashIndex(r: number, g: number, b: number, a: number): number {
    return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

function finalizeRun(output: Uint8Array[], trackers: { runLength: number }, condition: (runLength: number) => boolean) {
    if (condition(trackers.runLength) === true) {
        output.push(new Uint8Array([0b11000000 | (trackers.runLength - 1)]));
        trackers.runLength = 0;
    }
}

function writeIndex(output: Uint8Array[], index: number) {
    const QOI_OP_INDEX = new Uint8Array([0b00000000 | index]);
    output.push(QOI_OP_INDEX);
}

function writeLuma(output: Uint8Array[], ddrdg: number, dg: number, ddbdg: number) {
    const QOI_OP_LUMA_GREEN_BIAS = 32;
    const QOI_OP_LUMA_RED_BLUE_BIAS = 8;
    const QOI_OP_LUMA_CHUNK = new Uint8Array([
        0b10000000 | (dg + QOI_OP_LUMA_GREEN_BIAS),
        0b00000000 | ((ddrdg + QOI_OP_LUMA_RED_BLUE_BIAS) << 4) | (ddbdg + QOI_OP_LUMA_RED_BLUE_BIAS),
    ]);

    output.push(QOI_OP_LUMA_CHUNK);
}

function writeDiff(output: Uint8Array[], dr: number, dg: number, db: number) {
    const QOI_OP_DIFF_BIAS = 2;
    const QOI_OP_DIFF_CHUNK = new Uint8Array([
        0b01000000 | ((dr + QOI_OP_DIFF_BIAS) << 4) | ((dg + QOI_OP_DIFF_BIAS) << 2) | (db + QOI_OP_DIFF_BIAS)
    ]);

    output.push(QOI_OP_DIFF_CHUNK);
}

function writePixel(output: Uint8Array[], r: number, g: number, b: number, a: number, da: number) {
    if (da === 0) {
        const QOI_OP_RGB_CHUNK = new Uint8Array([0b11111110, r, g, b]);
        output.push(QOI_OP_RGB_CHUNK);
    } else {
        const QOI_OP_RGBA_CHUNK = new Uint8Array([0b11111111, r, g, b, a]);
        output.push(QOI_OP_RGBA_CHUNK);
    }
}

async function encode({ FILEPATH, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNEL_COUNT }: Options) {
    const start = hrtime.bigint();
    const rawPixelsBuffer = await fs.readFile(path.join(process.cwd(), FILEPATH));
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

    let runningPixelArray: number[][] = Array.from({ length: 64 }, () => ([0, 0, 0, 0]));

    for (let offset = 0; offset < rawPixelsBufferCopy.byteLength; offset += IMAGE_CHANNEL_COUNT!) {
        const [r, g, b, a] = rawPixelsBufferCopy.subarray(offset, offset + IMAGE_CHANNEL_COUNT!);

        const currentHash = hashIndex(r, g, b, a);

        if (r === prevPixelRed && g === prevPixelGreen && b === prevPixelBlue && a === prevPixelAlpha) {
            trackers.runLength++;

            finalizeRun(outputChunks, trackers, runLength => runLength === 62);
        } else {
            finalizeRun(outputChunks, trackers, runLength => runLength > 0);

            const storedPixel = runningPixelArray[currentHash];
            if (storedPixel[3] === a && storedPixel[0] === r && storedPixel[1] === g && storedPixel[2] === b) {
                writeIndex(outputChunks, currentHash);
            } else {
                runningPixelArray[currentHash][0] = r;
                runningPixelArray[currentHash][1] = g;
                runningPixelArray[currentHash][2] = b;
                runningPixelArray[currentHash][3] = a;

                const dr = r - prevPixelRed;
                const dg = g - prevPixelGreen;
                const db = b - prevPixelBlue;
                const da = a - prevPixelAlpha;

                const ddrdg = dr - dg;
                const ddbdg = db - dg;

                if (da === 0 && -2 <= dr && dr <= 1 && -2 <= dg && dg <= 1 && -2 <= db && db <= 1) {
                    writeDiff(outputChunks, dr, dg, db);
                } else if (da === 0 && -8 <= ddrdg && ddrdg <= 7 && -32 <= dg && dg <= 31 && -8 <= ddbdg && ddbdg <= 7) {
                    writeLuma(outputChunks, ddrdg, dg, ddbdg);
                } else {
                    writePixel(outputChunks, r, g, b, a, da);
                }
            }
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

    await fs.writeFile(path.join(process.cwd(), path.parse(FILEPATH).dir, `${path.parse(FILEPATH).name}.qoi`), Buffer.concat(outputChunks));
    console.log(`Process took: ${(hrtime.bigint() - start) / 1000n / 1000n} ms`);
}

await encode(parseOptions());
