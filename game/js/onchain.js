// On-chain leaderboard — ZERO external dependencies. Talks to the SherwoodLeaderboard contract
// (contracts/Leaderboard.sol) on the Robinhood chain through the connected wallet's own EIP-1193
// provider: eth_sendTransaction to submit a score, eth_call to read the board. Calldata + return
// decoding are hand-rolled. Inert until CONFIG.chain.leaderboardAddress is set AND a wallet is
// connected on the right chain — otherwise available() is false and the game uses the local board.
(function () {
  // ---- vendored keccak-256 (BigInt lanes; used only to derive 4-byte function selectors) ----
  const MASK = (1n << 64n) - 1n;
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An, 0x8000000080008000n,
    0x000000000000808Bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008An, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
    0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800An, 0x800000008000000An,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  const rotl = (v, n) => (n === 0n ? v : ((v << n) | (v >> (64n - n))) & MASK);

  function keccakF(A) {
    for (let rnd = 0; rnd < 24; rnd++) {
      const C = new Array(5);
      for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      const D = new Array(5);
      for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1n);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
      const B = new Array(25).fill(0n);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], BigInt(ROT[x + 5 * y]));
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK) & B[((x + 2) % 5) + 5 * y]);
      A[0] ^= RC[rnd];
    }
  }
  function keccak256(bytes) {
    const rate = 136;                      // 1088-bit rate (256-bit capacity)
    const blocks = Math.floor(bytes.length / rate) + 1;
    const padded = new Uint8Array(blocks * rate);
    padded.set(bytes);
    padded[bytes.length] ^= 0x01;          // original-Keccak padding (NOT SHA3's 0x06)
    padded[padded.length - 1] ^= 0x80;
    const A = new Array(25).fill(0n);
    for (let b = 0; b < blocks; b++) {
      const off = b * rate;
      for (let i = 0; i < 17; i++) {        // 136 bytes = 17 lanes, absorbed little-endian
        let lane = 0n;
        for (let j = 0; j < 8; j++) lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
        A[i] ^= lane;
      }
      keccakF(A);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((A[i] >> BigInt(8 * j)) & 0xffn);
    return out;
  }

  const enc = new TextEncoder();
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const keccakHex = (s) => toHex(keccak256(enc.encode(s)));
  // Self-test: keccak256("") — abort (stay local) on mismatch so a bad build can't send wrong calldata.
  const KECCAK_OK = keccakHex('') === 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
  if (!KECCAK_OK && window.console) console.warn('[onchain] keccak self-test failed — on-chain board disabled.');

  const selCache = {};
  const selector = (sig) => selCache[sig] || (selCache[sig] = '0x' + keccakHex(sig).slice(0, 8));
  const u256 = (v) => BigInt(Math.max(0, Math.floor(Number(v) || 0))).toString(16).padStart(64, '0');

  // ---- ABI return decoding for getAll() -> (address[], uint256[]) ----
  const wordAt = (h, byteOff) => h.slice(byteOff * 2, byteOff * 2 + 64);
  function decodeAddrScores(retHex) {
    const h = (retHex || '').replace(/^0x/, '');
    if (h.length < 128) return [];
    const off1 = Number(BigInt('0x' + wordAt(h, 0)));
    const off2 = Number(BigInt('0x' + wordAt(h, 32)));
    const len1 = Number(BigInt('0x' + wordAt(h, off1)));
    const len2 = Number(BigInt('0x' + wordAt(h, off2)));
    const n = Math.min(len1, len2);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const addr = '0x' + wordAt(h, off1 + 32 + i * 32).slice(24);   // last 20 bytes of the word
      const score = Number(BigInt('0x' + wordAt(h, off2 + 32 + i * 32)));
      rows.push({ addr, score });
    }
    return rows;
  }

  const addrOk = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  const contractAddr = () => (window.CONFIG && CONFIG.chain && CONFIG.chain.leaderboardAddress) || '';

  function available() {
    if (!KECCAK_OK) return false;
    const w = window.Wallet;
    if (!w || w.kind === 'solana') return false;
    return addrOk(contractAddr()) && w.state.mode === 'wallet' && !!w.state.address && w.state.chainOk === true && !!w.provider();
  }

  async function submit(score) {
    if (!available()) throw new Error('on-chain unavailable');
    const p = window.Wallet.provider();
    const data = selector('submit(uint256)') + u256(score);
    return p.request({ method: 'eth_sendTransaction', params: [{ from: window.Wallet.state.address, to: contractAddr(), data }] });
  }

  async function top(limit = 25) {
    if (!available()) throw new Error('on-chain unavailable');
    const p = window.Wallet.provider();
    const ret = await p.request({ method: 'eth_call', params: [{ to: contractAddr(), data: selector('getAll()') }, 'latest'] });
    const me = (window.Wallet.state.address || '').toLowerCase();
    return decodeAddrScores(ret).sort((a, b) => b.score - a.score).slice(0, limit)
      .map((r) => ({ addr: r.addr, name: window.Wallet.short(r.addr), score: r.score, onchain: true, me: r.addr.toLowerCase() === me }));
  }

  window.OnChain = {
    available, submit, top,
    // exposed for tests/debug:
    _ok: KECCAK_OK, _keccakHex: keccakHex, _selector: selector, _u256: u256, _decode: decodeAddrScores,
  };
})();
