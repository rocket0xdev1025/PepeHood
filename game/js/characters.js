// Character unlocks — one-time, permanent purchases against the SherwoodCharacters contract.
//
// Each gated HERO has an `unlock` field { id, token:'WEN'|'CASHCAT', priceWei, label }. Buying a
// character approves its payment token, then calls unlock(id); the contract marks it owned forever
// for that wallet. The default hero has no `unlock` field and is always free.
//
// Inert until CONFIG.chain.charactersAddress is set AND a wallet is connected on the right chain.
// No external deps; selectors come from onchain.js's keccak.
(function () {
  const addrOk = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  const cfg = () => (window.CONFIG && CONFIG.chain) || {};
  const contract = () => cfg().charactersAddress || '';
  const tokenAddr = (which) => (which === 'CASHCAT' ? (cfg().cashcatToken || '') : (cfg().rewardToken || ''));
  const MAX_UINT = (1n << 256n) - 1n;

  function configured() { return addrOk(contract()); }
  function available() {
    const w = window.Wallet;
    if (!w || w.kind === 'solana') return false;
    return configured() && w.state.mode === 'wallet' && !!w.state.address && w.state.chainOk === true && !!w.provider();
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

  async function waitTx(hash) {
    for (let i = 0; i < 80; i++) {
      const r = await provider().request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (r && r.blockNumber) { if (r.status != null && toBig(r.status) === 0n) throw new Error('Transaction failed on-chain.'); return r; }
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error('Timed out waiting for confirmation.');
  }

  const ownedCache = {};                          // charId -> bool
  // Persist confirmed ownership per wallet. Unlocks are permanent, so a cached `true` is always
  // valid — this lets an owned hero paint correctly on the very first frame (no "locked" flash
  // while the slow on-chain read is in flight).
  let seededFor = null;
  const storeKey = () => { const a = (window.Wallet && Wallet.state.address) || ''; return a ? 'rh_owned_' + a.toLowerCase() : ''; };
  function persistOwned(charId) {
    const k = storeKey(); if (!k) return;
    try { const arr = JSON.parse(localStorage.getItem(k) || '[]'); if (!arr.includes(charId)) { arr.push(charId); localStorage.setItem(k, JSON.stringify(arr)); } } catch (e) {}
  }
  function maybeSeed() {                           // load this wallet's owned set from localStorage once
    const a = (window.Wallet && Wallet.state.address) || '';
    if (!a || a === seededFor) return;
    seededFor = a;
    for (const k in ownedCache) delete ownedCache[k];           // wallet changed -> reset
    try { (JSON.parse(localStorage.getItem(storeKey()) || '[]') || []).forEach((id) => { ownedCache[id] = true; }); } catch (e) {}
  }
  async function isUnlocked(charId, force) {
    maybeSeed();
    if (ownedCache[charId] !== undefined && !force) return ownedCache[charId];
    const r = await ethCall(contract(), calldata('isUnlocked(address,uint256)', padAddr(me()) + u256(charId)));
    ownedCache[charId] = toBig(r) === 1n;
    if (ownedCache[charId]) persistOwned(charId);
    return ownedCache[charId];
  }
  const ownedCached = (charId) => { maybeSeed(); return ownedCache[charId]; };   // undefined until read/seed
  function clearCache() { seededFor = null; for (const k in ownedCache) delete ownedCache[k]; }

  async function prefetch() {
    if (!available() || !window.HEROES) return;
    for (const h of window.HEROES) { if (h.unlock) { try { await isUnlocked(h.unlock.id); } catch (e) {} } }
  }

  const allowance = async (token) => toBig(await ethCall(token, calldata('allowance(address,address)', padAddr(me()) + padAddr(contract()))));
  const balanceOf = async (token) => toBig(await ethCall(token, calldata('balanceOf(address)', padAddr(me()))));
  const approve = (token, amount) => send(token, calldata('approve(address,uint256)', padAddr(contract()) + u256(amount)));

  // Buy a character. `hero` is a HEROES entry with an `unlock` field. onStep(msg) reports progress.
  async function unlock(hero, onStep) {
    const step = (m) => { if (onStep) onStep(m); };
    if (!available()) throw new Error('Connect a Robinhood wallet to unlock.');
    const u = hero.unlock;
    if (!u) return { skipped: true };
    const token = tokenAddr(u.token);
    if (!addrOk(token)) throw new Error(u.token + ' token not configured.');
    const price = BigInt(u.priceWei);

    if ((await balanceOf(token)) < price) throw new Error('Not enough ' + u.token + ' to unlock.');
    if ((await allowance(token)) < price) {
      step('Approve ' + u.token + ' in your wallet…');
      await waitTx(await approve(token, MAX_UINT));
    }
    step('Confirm unlock in your wallet…');
    const tx = await send(contract(), calldata('unlock(uint256)', u256(u.id)));
    step('Confirming unlock…');
    await waitTx(tx);
    ownedCache[u.id] = true;
    persistOwned(u.id);
    return { ok: true, txHash: tx };
  }

  window.Characters = { configured, available, isUnlocked, ownedCached, prefetch, unlock, clearCache, balanceOf };
})();
