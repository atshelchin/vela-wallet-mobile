/**
 * Tests for EthCrypto — Keccak-256, ABI encoding, EIP-55 checksums.
 * Test vectors match iOS EthCryptoTests.swift and Android EthCryptoTest.kt.
 */
import { keccak256, keccak256Hex, abiEncodeAddress, abiEncodeUint256, abiEncodeUint256Hex, abiEncodeBytes32, functionSelector, checksumAddress, create2Address } from '@/services/eth-crypto';
import { toHex, fromHex } from '@/services/hex';

// MARK: - Keccak-256

describe('keccak256', () => {
  test('empty input produces correct hash', () => {
    const hash = keccak256(new Uint8Array(0));
    expect(toHex(hash)).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });

  test('"hello" produces correct hash', () => {
    const encoder = new TextEncoder();
    const hash = keccak256(encoder.encode('hello'));
    expect(toHex(hash)).toBe('1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8');
  });

  test('"abc" produces correct hash', () => {
    const encoder = new TextEncoder();
    const hash = keccak256(encoder.encode('abc'));
    expect(toHex(hash)).toBe('4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  });

  test('produces 32-byte output', () => {
    const encoder = new TextEncoder();
    const hash = keccak256(encoder.encode('test'));
    expect(hash.length).toBe(32);
  });

  test('is deterministic', () => {
    const encoder = new TextEncoder();
    const data = encoder.encode('deterministic');
    const hash1 = keccak256(data);
    const hash2 = keccak256(data);
    expect(toHex(hash1)).toBe(toHex(hash2));
  });

  test('different inputs produce different outputs', () => {
    const encoder = new TextEncoder();
    const h1 = keccak256(encoder.encode('a'));
    const h2 = keccak256(encoder.encode('b'));
    expect(toHex(h1)).not.toBe(toHex(h2));
  });

  test('single zero byte', () => {
    const hash = keccak256(new Uint8Array([0x00]));
    expect(toHex(hash)).toBe('bc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a');
  });
});

describe('keccak256Hex', () => {
  test('hashes from hex string', () => {
    const hash = keccak256Hex('00');
    expect(toHex(hash)).toBe('bc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a');
  });

  test('handles 0x prefix', () => {
    const h1 = keccak256Hex('0x00');
    const h2 = keccak256Hex('00');
    expect(toHex(h1)).toBe(toHex(h2));
  });
});

// MARK: - Function Selectors

describe('functionSelector', () => {
  test('transfer(address,uint256) → a9059cbb', () => {
    const sel = functionSelector('transfer(address,uint256)');
    expect(toHex(sel)).toBe('a9059cbb');
  });

  test('setup selector', () => {
    const sel = functionSelector('setup(address[],uint256,address,bytes,address,address,uint256,address)');
    expect(toHex(sel)).toBe('b63e800d');
  });

  test('enableModules(address[]) → 8d0dc49f', () => {
    const sel = functionSelector('enableModules(address[])');
    expect(toHex(sel)).toBe('8d0dc49f');
  });

  test('configure((uint256,uint256,uint176)) → 0dd9692f', () => {
    const sel = functionSelector('configure((uint256,uint256,uint176))');
    expect(toHex(sel)).toBe('0dd9692f');
  });

  test('multiSend(bytes) → 8d80ff0a', () => {
    const sel = functionSelector('multiSend(bytes)');
    expect(toHex(sel)).toBe('8d80ff0a');
  });
});

// MARK: - ABI Encoding

describe('abiEncodeAddress', () => {
  test('zero address → 32 zero bytes', () => {
    const encoded = abiEncodeAddress('0x0000000000000000000000000000000000000000');
    expect(encoded.length).toBe(32);
    expect(toHex(encoded)).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  test('non-zero address is left-padded', () => {
    const encoded = abiEncodeAddress('0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226');
    expect(encoded.length).toBe(32);
    // First 12 bytes are zero, then 20-byte address
    const hex = toHex(encoded);
    expect(hex.startsWith('000000000000000000000000')).toBe(true);
    expect(hex.endsWith('75cf11467937ce3f2f357ce24ffc3dbf8fd5c226')).toBe(true);
  });

  test('works without 0x prefix', () => {
    const encoded = abiEncodeAddress('75cf11467937ce3F2f357CE24ffc3DBF8fD5c226');
    expect(encoded.length).toBe(32);
  });
});

describe('abiEncodeUint256', () => {
  test('zero → 32 zero bytes', () => {
    const encoded = abiEncodeUint256(0);
    expect(encoded.length).toBe(32);
    expect(toHex(encoded)).toBe('0'.repeat(64));
  });

  test('one → last byte is 0x01', () => {
    const encoded = abiEncodeUint256(1);
    expect(encoded[31]).toBe(1);
    expect(encoded.slice(0, 31).every(b => b === 0)).toBe(true);
  });

  test('256 → correct big-endian encoding', () => {
    const encoded = abiEncodeUint256(256);
    expect(encoded[30]).toBe(1);
    expect(encoded[31]).toBe(0);
  });

  test('works with BigInt', () => {
    const encoded = abiEncodeUint256(1000000000000000000n);
    expect(encoded.length).toBe(32);
  });
});

describe('abiEncodeBytes32', () => {
  test('full 32 bytes unchanged', () => {
    const input = new Uint8Array(32).fill(0xAB);
    const encoded = abiEncodeBytes32(input);
    expect(toHex(encoded)).toBe('ab'.repeat(32));
  });

  test('short input is right-padded', () => {
    const input = new Uint8Array([0x01, 0x02]);
    const encoded = abiEncodeBytes32(input);
    expect(encoded[0]).toBe(0x01);
    expect(encoded[1]).toBe(0x02);
    expect(encoded.slice(2).every(b => b === 0)).toBe(true);
  });
});

// MARK: - EIP-55 Checksum

describe('checksumAddress', () => {
  test('produces correct mixed-case encoding', () => {
    // Known EIP-55 test vectors
    expect(checksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'))
      .toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');

    expect(checksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'))
      .toBe('0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');
  });

  test('all-lowercase input works', () => {
    const result = checksumAddress('0x0000000000000000000000000000000000000000');
    expect(result).toBe('0x0000000000000000000000000000000000000000');
  });

  test('works without 0x prefix', () => {
    const result = checksumAddress('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
    expect(result).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  });
});

// MARK: - EIP-712 Type Hashes

describe('EIP-712 type hashes', () => {
  test('EIP712Domain type hash', () => {
    const encoder = new TextEncoder();
    const hash = keccak256(encoder.encode('EIP712Domain(uint256 chainId,address verifyingContract)'));
    expect(toHex(hash)).toBe('47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218');
  });

  test('SafeOp type hash', () => {
    const encoder = new TextEncoder();
    const hash = keccak256(encoder.encode('SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)'));
    expect(toHex(hash)).toBe('c03dfc11d8b10bf9cf703d558958c8c42777f785d998c62060d85a4f0ef6ea7f');
  });
});
