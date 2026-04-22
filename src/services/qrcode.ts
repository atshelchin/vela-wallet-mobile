/**
 * Pure-JavaScript QR Code matrix generator.
 * Supports byte mode, versions 1-10, error correction level M.
 * No external dependencies.
 */

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

// Total number of codewords (data + EC) for versions 1-10
const TOTAL_CODEWORDS: number[] = [
  0, // v0 placeholder
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
];

// EC codewords per block for ECC level M, versions 1-10
const EC_CODEWORDS_PER_BLOCK: number[] = [
  0,
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
];

// Number of EC blocks for ECC level M, versions 1-10
// Format: [group1Blocks, group1DataCW, group2Blocks, group2DataCW]
const EC_BLOCKS: number[][] = [
  [], // v0
  [1, 16, 0, 0],   // v1: 1 block, 16 data CW
  [1, 28, 0, 0],   // v2: 1 block, 28 data CW
  [1, 44, 0, 0],   // v3: 1 block, 44 data CW
  [2, 32, 0, 0],   // v4: 2 blocks, 32 data CW each
  [2, 43, 0, 0],   // v5: 2 blocks, 43 data CW each
  [4, 27, 0, 0],   // v6: 4 blocks, 27 data CW each
  [4, 31, 0, 0],   // v7: 4 blocks, 31 data CW each
  [2, 38, 2, 39],  // v8: 2 blocks of 38 + 2 blocks of 39
  [3, 36, 2, 37],  // v9: 3 blocks of 36 + 2 blocks of 37
  [4, 43, 1, 44],  // v10: 4 blocks of 43 + 1 block of 44
];

// Alignment pattern center positions for versions 2-10
const ALIGNMENT_POSITIONS: number[][] = [
  [], // v0
  [], // v1 — no alignment pattern
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed-Solomon
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Compute Reed-Solomon EC codewords for given data and number of EC codewords */
function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  // Build generator polynomial
  const gen = new Uint8Array(ecCount + 1);
  gen[0] = 1;
  for (let i = 0; i < ecCount; i++) {
    for (let j = ecCount; j >= 1; j--) {
      gen[j] = gen[j] ^ gfMul(gen[j - 1], GF_EXP[i]);
    }
  }

  // Polynomial division
  const result = new Uint8Array(ecCount);
  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j <= ecCount; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  result.set(msg.subarray(data.length));
  return result;
}

// ---------------------------------------------------------------------------
// Data encoding (byte mode)
// ---------------------------------------------------------------------------

function getVersion(dataLength: number): number {
  for (let v = 1; v <= 10; v++) {
    const blocks = EC_BLOCKS[v];
    const dataCapacity = blocks[0] * blocks[1] + blocks[2] * blocks[3];
    // Byte mode overhead: 4 bits mode + char count bits + data
    const charCountBits = v <= 9 ? 8 : 16;
    const overhead = Math.ceil((4 + charCountBits) / 8);
    if (dataLength + overhead <= dataCapacity) return v;
  }
  throw new Error('Data too long for QR versions 1-10');
}

function encodeData(text: string, version: number): Uint8Array {
  const blocks = EC_BLOCKS[version];
  const totalDataCW = blocks[0] * blocks[1] + blocks[2] * blocks[3];
  const charCountBits = version <= 9 ? 8 : 16;

  // Build bit stream
  const bits: number[] = [];
  function pushBits(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  }

  // Mode indicator: byte mode = 0100
  pushBits(0b0100, 4);
  // Character count
  pushBits(text.length, charCountBits);
  // Data bytes
  for (let i = 0; i < text.length; i++) {
    pushBits(text.charCodeAt(i) & 0xff, 8);
  }
  // Terminator (up to 4 zero bits)
  const remainingBits = totalDataCW * 8 - bits.length;
  pushBits(0, Math.min(4, remainingBits));

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad codewords
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataCW * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to bytes
  const data = new Uint8Array(totalDataCW);
  for (let i = 0; i < totalDataCW; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    data[i] = byte;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Error correction and interleaving
// ---------------------------------------------------------------------------

function computeECAndInterleave(data: Uint8Array, version: number): Uint8Array {
  const blocks = EC_BLOCKS[version];
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[version];
  const g1Blocks = blocks[0], g1DataCW = blocks[1];
  const g2Blocks = blocks[2], g2DataCW = blocks[3];

  const allDataBlocks: Uint8Array[] = [];
  const allECBlocks: Uint8Array[] = [];

  let offset = 0;
  // Group 1
  for (let i = 0; i < g1Blocks; i++) {
    const block = data.subarray(offset, offset + g1DataCW);
    allDataBlocks.push(new Uint8Array(block));
    allECBlocks.push(rsEncode(block, ecPerBlock));
    offset += g1DataCW;
  }
  // Group 2
  for (let i = 0; i < g2Blocks; i++) {
    const block = data.subarray(offset, offset + g2DataCW);
    allDataBlocks.push(new Uint8Array(block));
    allECBlocks.push(rsEncode(block, ecPerBlock));
    offset += g2DataCW;
  }

  // Interleave data codewords
  const result: number[] = [];
  const maxDataLen = Math.max(g1DataCW, g2DataCW || 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of allDataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  // Interleave EC codewords
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of allECBlocks) {
      result.push(block[i]);
    }
  }

  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

type Matrix = (boolean | null)[][];

function createMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function placeFinderPattern(matrix: Matrix, row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || rr >= matrix.length || cc < 0 || cc >= matrix.length) continue;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        // Finder pattern
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        matrix[rr][cc] = ring !== 2; // dark except ring 2
      } else {
        matrix[rr][cc] = false; // separator
      }
    }
  }
}

function placeAlignmentPattern(matrix: Matrix, row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r, cc = col + c;
      if (matrix[rr][cc] !== null) continue; // don't overwrite finder patterns
      const ring = Math.max(Math.abs(r), Math.abs(c));
      matrix[rr][cc] = ring !== 1;
    }
  }
}

function placeTimingPatterns(matrix: Matrix) {
  const size = matrix.length;
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }
}

function reserveFormatInfo(matrix: Matrix) {
  const size = matrix.length;
  // Around top-left finder
  for (let i = 0; i <= 8; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  // Around top-right finder
  for (let i = 0; i <= 7; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
  }
  // Around bottom-left finder
  for (let i = 0; i <= 7; i++) {
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }
  // Dark module
  matrix[size - 8][8] = true;
}

function placeDataBits(matrix: Matrix, data: Uint8Array): boolean[][] {
  const size = matrix.length;
  const totalBits = data.length * 8;

  // Create a writable copy
  const result: boolean[][] = matrix.map(row => row.map(cell => cell === true));

  // Build a mask of which cells are "function" (already placed)
  const isFunction: boolean[][] = matrix.map(row => row.map(cell => cell !== null));

  let bitIdx = 0;
  // Columns go right to left in pairs, skipping column 6
  let col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // skip timing column
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        // Direction: up or down depending on column pair
        const isUpward = ((size - 1 - col) >> 1) % 2 === 0;
        const rr = isUpward ? size - 1 - row : row;

        if (isFunction[rr][cc]) continue;
        if (bitIdx < totalBits) {
          const byteIdx = bitIdx >> 3;
          const bitPos = 7 - (bitIdx & 7);
          result[rr][cc] = ((data[byteIdx] >> bitPos) & 1) === 1;
          bitIdx++;
        } else {
          result[rr][cc] = false;
        }
      }
    }
    col -= 2;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

type MaskFn = (row: number, col: number) => boolean;

const MASK_FUNCTIONS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r, _) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
  (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
  (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0,
];

function applyMask(matrix: boolean[][], isFunction: boolean[][], maskIdx: number): boolean[][] {
  const size = matrix.length;
  const fn = MASK_FUNCTIONS[maskIdx];
  const result = matrix.map(row => [...row]);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && fn(r, c)) {
        result[r][c] = !result[r][c];
      }
    }
  }
  return result;
}

function penaltyScore(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;

  // Rule 1: runs of same color in row/col
  for (let r = 0; r < size; r++) {
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += runLen - 2;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += runLen - 2;
  }
  for (let c = 0; c < size; c++) {
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += runLen - 2;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += runLen - 2;
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: finder-like patterns (simplified — check for 1011101 patterns)
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [...pat1].reverse();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      let match1 = true, match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[r][c + i] !== pat1[i]) match1 = false;
        if (matrix[r][c + i] !== pat2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      let match1 = true, match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[r + i][c] !== pat1[i]) match1 = false;
        if (matrix[r + i][c] !== pat2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  // Rule 4: proportion of dark modules
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) darkCount++;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const prev5 = Math.floor(percent / 5) * 5;
  const next5 = prev5 + 5;
  penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

  return penalty;
}

// ---------------------------------------------------------------------------
// Format information
// ---------------------------------------------------------------------------

// Format info for ECC level M (indicator 00) with each mask pattern 0-7
// Pre-computed BCH(15,5) encoded format strings for level M
function getFormatBits(maskPattern: number): number {
  // Format info = ECC level (2 bits) + mask pattern (3 bits)
  // Level M = 00, so format data = 00 xxx
  const formatData = (0b00 << 3) | maskPattern;

  // BCH(15,5) encoding
  let bits = formatData << 10;
  // Generator polynomial: x^10 + x^8 + x^5 + x^4 + x^2 + x + 1 = 10100110111
  const gen = 0b10100110111;
  for (let i = 4; i >= 0; i--) {
    if (bits & (1 << (i + 10))) {
      bits ^= gen << i;
    }
  }
  bits = (formatData << 10) | bits;

  // XOR with mask pattern 101010000010010
  bits ^= 0b101010000010010;

  return bits;
}

function placeFormatInfo(matrix: boolean[][], maskPattern: number) {
  const size = matrix.length;
  const bits = getFormatBits(maskPattern);

  // Place format bits around the finder patterns
  // Bits 0-7 along left column (bottom to top at col 8) and top row
  const positions1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const positions2: [number, number][] = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1;
    matrix[positions1[i][0]][positions1[i][1]] = bit;
    matrix[positions2[i][0]][positions2[i][1]] = bit;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function generateQRMatrix(text: string): boolean[][] {
  const version = getVersion(text.length);
  const size = version * 4 + 17;

  // 1. Build the function-pattern matrix
  const matrix = createMatrix(size);

  // Finder patterns (top-left, top-right, bottom-left)
  placeFinderPattern(matrix, 0, 0);
  placeFinderPattern(matrix, 0, size - 7);
  placeFinderPattern(matrix, size - 7, 0);

  // Alignment patterns
  const positions = ALIGNMENT_POSITIONS[version];
  if (positions.length > 0) {
    for (const r of positions) {
      for (const c of positions) {
        // Skip if overlapping with finder patterns
        if (r <= 8 && c <= 8) continue; // top-left
        if (r <= 8 && c >= size - 8) continue; // top-right
        if (r >= size - 8 && c <= 8) continue; // bottom-left
        placeAlignmentPattern(matrix, r, c);
      }
    }
  }

  // Timing patterns
  placeTimingPatterns(matrix);

  // Reserve format info areas
  reserveFormatInfo(matrix);

  // Record function pattern positions
  const isFunction: boolean[][] = matrix.map(row => row.map(cell => cell !== null));

  // 2. Encode data
  const dataCodewords = encodeData(text, version);

  // 3. Add error correction and interleave
  const finalData = computeECAndInterleave(dataCodewords, version);

  // 4. Place data bits
  const dataMatrix = placeDataBits(matrix, finalData);

  // 5. Try all 8 mask patterns, pick the one with lowest penalty
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix: boolean[][] = dataMatrix;

  for (let m = 0; m < 8; m++) {
    const masked = applyMask(dataMatrix, isFunction, m);
    placeFormatInfo(masked, m);
    const p = penaltyScore(masked);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = m;
      bestMatrix = masked;
    }
  }

  // Apply best mask and format info
  bestMatrix = applyMask(dataMatrix, isFunction, bestMask);
  placeFormatInfo(bestMatrix, bestMask);

  return bestMatrix;
}
