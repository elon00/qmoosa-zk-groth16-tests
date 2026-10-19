import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Groth16Engine } from '../../qmoosa-zk-groth16-engine/dist/index.js';
import {
  serializeProof, deserializeProof, proofToCalldata, GROTH16_PROOF_BYTE_LENGTH,
  BN254_FIELD_MODULUS_Q, BN254_SCALAR_MODULUS_R
} from '../../qmoosa-zk-groth16-protocol/dist/index.js';

const load = name => JSON.parse(fs.readFileSync(new URL('./fixtures/groth16/' + name, import.meta.url), 'utf8'));
const g1 = p => ({ x: BigInt(p[0]), y: BigInt(p[1]) });
const g2 = p => ({ x: p[0].map(BigInt), y: p[1].map(BigInt) });
const rawKey = load('verification_key.json');
const key = { alpha1: g1(rawKey.vk_alpha_1), beta2: g2(rawKey.vk_beta_2),
  gamma2: g2(rawKey.vk_gamma_2), delta2: g2(rawKey.vk_delta_2), ic: rawKey.IC.map(g1) };
const engine = new Groth16Engine();
const vectors = ['', '-zero'].map(suffix => {
  const raw = load('proof' + suffix + '.json');
  return { suffix, proof: { a: g1(raw.pi_a), b: g2(raw.pi_b), c: g1(raw.pi_c) },
    inputs: load('public' + suffix + '.json').map(BigInt), calldata: load('calldata' + suffix + '.json') };
});

for (const { suffix, proof, inputs, calldata } of vectors) {
  test('genuine proof wire round trip remains verifiable' + suffix, () => {
    assert.equal(rawKey.protocol, 'groth16');
    const bytes = serializeProof(proof);
    assert.equal(bytes.length, GROTH16_PROOF_BYTE_LENGTH);
    const decoded = deserializeProof(bytes);
    assert.deepEqual(decoded, proof);
    assert.equal(engine.verifyProof(key, decoded, inputs), true);
  });
  test('calldata matches independent snarkjs export including G2 ordering' + suffix, () => {
    const actual = proofToCalldata(proof, inputs);
    const normalized = [actual.a, actual.b, actual.c, actual.input].map(
      part => JSON.parse(JSON.stringify(part), (_key, value) => typeof value === 'string' ? BigInt(value).toString() : value)
    );
    const expected = calldata.map(part => JSON.parse(JSON.stringify(part),
      (_key, value) => typeof value === 'string' ? BigInt(value).toString() : value));
    assert.deepEqual(normalized, expected);
  });
}

const { proof, inputs } = vectors[0];
test('transport mutation of a valid curve point fails proof verification', () => {
  const bytes = serializeProof(proof);
  const generator = serializeProof({ ...proof, a: { x: 1n, y: 2n } });
  bytes.set(generator.subarray(0, 64), 0);
  assert.equal(engine.verifyProof(key, deserializeProof(bytes), inputs), false);
});
test('transport mutation to an off-curve point is rejected', () => {
  const bytes = serializeProof({ ...proof, a: { x: 1n, y: 1n } });
  assert.throws(() => engine.verifyProof(key, deserializeProof(bytes), inputs), /INVALID_G1_POINT/);
});
test('truncated and oversized wire proofs are rejected', () => {
  assert.throws(() => deserializeProof(serializeProof(proof).subarray(1)), /INVALID_PROOF_LENGTH/);
  assert.throws(() => deserializeProof(new Uint8Array(257)), /INVALID_PROOF_LENGTH/);
});
test('base-field modulus in a transported coordinate is rejected', () => {
  const bytes = serializeProof(proof);
  bytes.set(Buffer.from(BN254_FIELD_MODULUS_Q.toString(16).padStart(64, '0'), 'hex'), 0);
  assert.throws(() => engine.verifyProof(key, deserializeProof(bytes), inputs), /INVALID_G1_POINT/);
});
test('valid scalar upper boundary is processed and fails the unrelated proof', () => {
  const changed = [...inputs]; changed[0] = BN254_SCALAR_MODULUS_R - 1n;
  assert.equal(engine.verifyProof(key, proof, changed), false);
});
test('scalar modulus is rejected in both verifier and calldata adapter', () => {
  const changed = [...inputs]; changed[0] = BN254_SCALAR_MODULUS_R;
  assert.throws(() => engine.verifyProof(key, proof, changed), /SCALAR_FIELD_OVERFLOW/);
  assert.throws(() => proofToCalldata(proof, changed), /SCALAR_FIELD_OVERFLOW/);
});
test('zero public input still validates the matching IC point', () => {
  const zero = vectors[1];
  const index = zero.inputs.findIndex(x => x === 0n);
  assert.ok(index >= 0);
  const changed = { ...key, ic: [...key.ic] };
  changed.ic[index + 1] = { x: 1n, y: 1n };
  assert.throws(() => engine.verifyProof(changed, zero.proof, zero.inputs), /INVALID_G1_POINT/);
});
test('public input order is binding across the protocol and engine', () => {
  assert.equal(engine.verifyProof(key, deserializeProof(serializeProof(proof)), [...inputs].reverse()), false);
});
