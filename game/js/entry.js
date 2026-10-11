// Pay-to-play entry — pay the WEN entry fee into the pool before a run.
//
// Flow: read entryFee() from the contract -> if the player hasn't approved the contract to spend
// WEN, send an approve() first (one-time) -> call enterGame(), which pulls the fee and banks a play
// credit. The credit is consumed later by claim(), so you can't collect more than you've paid for.
//
// Inert (available() === false) until distributorAddress + rewardToken are configured AND a wallet
// is connected on the right chain. The fee is read live on-chain; 0 means pay-to-play is disabled.
// No external dependencies; function selectors come from onchain.js's vetted keccak.
(function () {
  const addrOk = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  const cfg = () => (window.CONFIG && CONFIG.chain) || {};
  const distributor = () => cfg().distributorAddress || '';
  const token = () => cfg().rewardToken || '';
  const MAX_UINT = (1n << 256n) - 1n;

  function configured() { return addrOk(distributor()) && addrOk(token()); }
  function available() {
    const w = window.Wallet;
    if (!w || w.kind === 'solana') return false;
    return configured() && w.state.mode === 'wallet' && !!w.state.address
      && w.state.chainOk === true && !!w.provider();
  }

  const stripHex = (h) => (h || '').replace(/^0x/, '');
  const u256 = (v) => { let b = typeof v === 'bigint' ? v : BigInt(v == null ? 0 : v); if (b < 0n) b = 0n; return b.toString(16).padStart(64, '0'); };
  const padAddr = (a) => stripHex(a).toLowerCase().padStart(64, '0');
  const toBig = (hex) => BigInt(hex && hex !== '0x' ? hex : '0');
  const sel = (sig) => { if (window.OnChain && OnChain._selector) return OnChain._selector(sig); throw new Error('selectors unavailable (onchain.js missing)'); };
  const calldata = (sig, args) => '0x' + stripHex(sel(sig)) + (args || '');
  const provider = () => window.Wallet.provider();
  const me = () => window.Wallet.state.address;

  const ethCall = (to, data) => provider().request({ method: 'eth_call', params: [{ to, data }, 'latest'] });
  const send = (to, data) => provider().request({ method: 'eth_sendTransaction', params: [{ from: me(), to, data }] });

  // The entry fee only changes when the owner calls setEntryFee(), so we read it once and cache it.
  // beginRun() can then decide screen-vs-play instantly instead of waiting on the (slow) RPC.
  let feeCache = null;                                   // bigint once loaded; null = not read yet
  async function entryFee(force) {
    if (feeCache !== null && !force) return feeCache;
    feeCache = toBig(await ethCall(distributor(), calldata('entryFee()')));
    return feeCache;
  }
  const cachedFee = () => feeCache;                      // null until the first read completes
  async function prefetch() { if (available()) { try { await entryFee(); } catch (e) {} } }
  async function balanceOf() { return toBig(await ethCall(token(), calldata('balanceOf(address)', padAddr(me())))); }
  async function allowance() { return toBig(await ethCall(token(), calldata('allowance(address,address)', padAddr(me()) + padAddr(distributor())))); }
  async function credits()   { return toBig(await ethCall(distributor(), calldata('credits(address)', padAddr(me())))); }

  const approve   = (amount) => send(token(), calldata('approve(address,uint256)', padAddr(distributor()) + u256(amount)));
  const enterGame = () => send(distributor(), calldata('enterGame()'));

  // Wait for a tx to be mined; throw on revert.
  async function waitTx(hash) {
    for (let i = 0; i < 80; i++) {
      const r = await provider().request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (r && r.blockNumber) {
        if (r.status != null && toBig(r.status) === 0n) throw new Error('Transaction failed on-chain.');
        return r;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error('Timed out waiting for confirmation.');
  }

  const toWen = (base) => Number(base / (10n ** 15n)) / 1000; // base units -> WEN (keeps 3 decimals)

  // Full entry purchase. `onStep(msg)` reports progress for the UI. Resolves { fee } on success.
  // Resolves { skipped:true } when the on-chain entryFee is 0 (pay-to-play disabled).
  async function payEntry(onStep) {
    const step = (m) => { if (onStep) onStep(m); };
    if (!available()) throw new Error('Connect a Robinhood wallet to play.');
    const fee = await entryFee();
    if (fee === 0n) return { skipped: true };

    const bal = await balanceOf();
    if (bal < fee) throw new Error('Not enough HOOD — buy more to play.');

    if ((await allowance()) < fee) {
      step('Approve HOOD in your wallet…');
      await waitTx(await approve(MAX_UINT));   // one-time infinite approval, so future plays skip this
    }
    step('Confirm payment in your wallet…');
    const tx = await enterGame();
    step('Confirming payment…');
    await waitTx(tx);
    return { fee, txHash: tx };
  }

  window.Entry = { configured, available, entryFee, cachedFee, prefetch, balanceOf, credits, payEntry, toWen };
})();
