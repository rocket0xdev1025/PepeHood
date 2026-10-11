// Collect earned coins — turns a server-signed ticket into an on-chain claim() transaction.
//
// Flow:  POST {player, gold} -> claim-signer Worker -> { amount, nonce, deadline, signature }
//        -> ABI-encode claim(uint256,uint256,uint256,bytes) -> eth_sendTransaction to SherwoodDistributor.
//
// The player never decides the payout: the Worker signs the amount, and the contract pays only
// against that signature. This file just relays the ticket on-chain.
//
// Inert (available() === false) until BOTH CONFIG.chain.distributorAddress and CONFIG.chain.claimUrl
// are set AND a wallet is connected on the right chain. No external dependencies; the function
// selector is borrowed from onchain.js's vetted keccak (loaded before this file).
(function () {
  const addrOk = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  const cfg = () => (window.CONFIG && CONFIG.chain) || {};
  const distributor = () => cfg().distributorAddress || '';
  const claimUrl = () => cfg().claimUrl || '';

  // Rewards are "configured" once both endpoints exist (used to decide whether to show the button).
  function configured() {
    return addrOk(distributor()) && !!claimUrl();
  }

  // Fully ready to send: configured AND a wallet is connected on the correct chain.
  function available() {
    const w = window.Wallet;
    if (!w || w.kind === 'solana') return false;
    return configured() && w.state.mode === 'wallet' && !!w.state.address
      && w.state.chainOk === true && !!w.provider();
  }

  const stripHex = (h) => (h || '').replace(/^0x/, '');

  // uint256 -> 32-byte hex word. Accepts bigint or decimal string (amounts/nonces exceed JS Number).
  const u256 = (v) => {
    let b = typeof v === 'bigint' ? v : BigInt(v == null ? 0 : v);
    if (b < 0n) b = 0n;
    return b.toString(16).padStart(64, '0');
  };

  // ABI tail for a dynamic `bytes`: length word + right-padded data to a 32-byte boundary.
  function encodeBytesTail(hex) {
    const data = stripHex(hex);
    const pad = (64 - (data.length % 64)) % 64;
    return u256(data.length / 2) + data + '0'.repeat(pad);
  }

  function selector() {
    if (window.OnChain && OnChain._selector) return OnChain._selector('claim(uint256,uint256,uint256,bytes)');
    throw new Error('claim selector unavailable (onchain.js not loaded)');
  }

  async function fetchTicket(player, gold) {
    let res;
    try {
      res = await fetch(claimUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player, gold }),
      });
    } catch (e) {
      throw new Error('Could not reach the rewards server.');
    }
    if (!res || !res.ok) {
      let msg = 'Rewards server refused the claim.';
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return res.json(); // { player, amount, nonce, deadline, signature }
  }

  // Collect `gold` coins for the connected wallet. Resolves to { txHash, amount } on success.
  async function claim(gold) {
    if (!available()) throw new Error('Connect your Robinhood wallet to collect.');
    const g = Math.floor(Number(gold) || 0);
    if (!(g > 0)) throw new Error('No coins to collect.');

    const provider = window.Wallet.provider();
    const from = window.Wallet.state.address;

    const t = await fetchTicket(from, g);
    if ((t.player || '').toLowerCase() !== from.toLowerCase()) throw new Error('Ticket was issued for a different wallet.');
    if (!t.signature) throw new Error('Rewards server returned no signature.');

    const data = '0x' + stripHex(selector())
      + u256(t.amount)
      + u256(t.nonce)
      + u256(t.deadline)
      + u256(0x80)                 // offset to the bytes param (after 4 head words)
      + encodeBytesTail(t.signature);

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: distributor(), data }],
    });
    return { txHash, amount: BigInt(t.amount) };
  }

  window.Claim = {
    configured, available, claim,
    // exposed for tests/debug:
    _u256: u256, _encodeBytesTail: encodeBytesTail,
  };
})();
