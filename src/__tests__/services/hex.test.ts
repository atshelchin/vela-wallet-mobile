/**
 * Tests for hex encoding/decoding utilities.
 */
import { toHex, fromHex, addHexPrefix, stripHexPrefix, concatBytes, toBase64Url, fromBase64Url } from '@/services/hex';

describe('toHex', () => {
  test('empty array → empty string', () => {
    expect(toHex(new Uint8Array(0))).toBe('');
  });

  test('single byte', () => {
    expect(toHex(new Uint8Array([0xff]))).toBe('ff');
    expect(toHex(new Uint8Array([0x00]))).toBe('00');
    expect(toHex(new Uint8Array([0x0a]))).toBe('0a');
  });

  test('multiple bytes', () => {
    expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
  });
});

describe('fromHex', () => {
  test('empty string → empty array', () => {
    expect(fromHex('')).toEqual(new Uint8Array(0));
  });

  test('strips 0x prefix', () => {
    const result = fromHex('0xdeadbeef');
    expect(toHex(result)).toBe('deadbeef');
  });

  test('handles uppercase', () => {
    const result = fromHex('DEADBEEF');
    expect(toHex(result)).toBe('deadbeef');
  });

  test('roundtrips with toHex', () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const hex = toHex(original);
    const decoded = fromHex(hex);
    expect(decoded).toEqual(original);
  });

  test('throws on odd-length string', () => {
    expect(() => fromHex('abc')).toThrow();
  });
});

describe('addHexPrefix / stripHexPrefix', () => {
  test('addHexPrefix adds 0x', () => {
    expect(addHexPrefix('dead')).toBe('0xdead');
  });

  test('addHexPrefix is idempotent', () => {
    expect(addHexPrefix('0xdead')).toBe('0xdead');
  });

  test('stripHexPrefix removes 0x', () => {
    expect(stripHexPrefix('0xdead')).toBe('dead');
  });

  test('stripHexPrefix is idempotent', () => {
    expect(stripHexPrefix('dead')).toBe('dead');
  });
});

describe('concatBytes', () => {
  test('concatenates arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5]);
    expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  test('handles empty arrays', () => {
    const a = new Uint8Array(0);
    const b = new Uint8Array([1]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1]));
  });
});

describe('base64url', () => {
  test('roundtrips correctly', () => {
    const original = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const encoded = toBase64Url(original);
    const decoded = fromBase64Url(encoded);
    expect(decoded).toEqual(original);
  });

  test('no padding characters', () => {
    const encoded = toBase64Url(new Uint8Array([1]));
    expect(encoded).not.toContain('=');
  });

  test('uses URL-safe characters', () => {
    // Encode data that would normally produce + and /
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const encoded = toBase64Url(data);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});
