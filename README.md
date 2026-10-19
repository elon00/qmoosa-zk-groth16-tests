# QMOOSA Groth16 integration tests

Real compiled-circuit BN254 Groth16 proofs exercise the protocol wire encoding, engine verification and Ethereum calldata adapter together. This closes the previously empty dedicated tests repository; it does not certify the complete Groth16 product.

The engine is pinned to development commit 001b1ee757fa19f47eccb7f7e4c573c77cd4c668 (PR #1), and the protocol to 9b7f29227196b57f2c3d9f52cb123f72c5fd6afc. CI checks out these exact revisions as siblings. To run locally, check out those siblings, run npm ci --ignore-scripts and npm run build in protocol then engine, then npm test in this repository. There are no additional test dependencies.

## Acceptance coverage

- Both independently verified genuine circuit proofs survive binary serialization and remain verifiable, including zero public input.
- Calldata matches golden output from snarkjs 0.7.6 export, including G2 component order.
- Changed valid points, malformed points, noncanonical coordinates, incorrect lengths, changed input order and out-of-range scalars are rejected.
- The scalar upper boundary is handled; a zero scalar does not bypass validation of its verification-key IC point.

Fixture provenance is test/fixtures/groth16/provenance.json, copied with the public proof/key/input data from the pinned engine commit. The compiled circuit came from iden3/snarkjs at commit 22003fbcde78608be902520661832db7933d279e (GPL-3.0); compiled R1CS/WASM inputs are proving-system independent. The generated proofs use Groth16, not PLONK. Both were independently verified with snarkjs 0.7.6. Golden calldata was separately exported with that tool. No proving keys, ceremony secrets or witness files are published here. The setup is test-only and unsuitable for production.

This suite tests formatting compatibility; it does not execute an EVM contract or prove on-chain integration. CodeQL, independent security review, SDK/dashboard acceptance and production release remain separate gates.
