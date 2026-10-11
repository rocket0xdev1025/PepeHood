// Leaderboard storage with two interchangeable backends.
//
//  • local  (default): localStorage — works instantly, even from file://.
//  • remote (optional): set REMOTE_URL to a tiny REST endpoint for a TRUE
//    global board shared across all players. A ready-to-deploy Cloudflare
//    Worker that speaks this protocol lives in /leaderboard-worker.
//
// Remote protocol:
//   GET  REMOTE_URL            -> [{ name, score }, ...]  (any order)
//   POST REMOTE_URL  {name,score}  -> 200 OK
window.Leaderboard = (function () {
  const REMOTE_URL = null;          // e.g. 'https://sherwood-board.you.workers.dev'
  const KEY = 'sherwood_scores_v2'; // v2: combined score (wave+kills+gold), not raw gold
  const MAX = 25;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function writeLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {}
  }
  function sortTrim(list) {
    return list.slice().sort((a, b) => b.score - a.score).slice(0, MAX);
  }

  async function submit(name, score) {
    name = (name || 'Outlaw').toString().slice(0, 14).trim() || 'Outlaw';
    score = Math.max(0, Math.floor(score || 0));
    const entry = { name, score };
    // On-chain first: record under the connected wallet address on the Robinhood chain.
    if (window.OnChain && window.OnChain.available()) {
      try { const tx = await window.OnChain.submit(score); return { ok: true, scope: 'on-chain', tx }; }
      catch (e) { /* user rejected or chain unreachable — fall through to local */ }
    }
    if (REMOTE_URL) {
      try {
        await fetch(REMOTE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        return { ok: true, scope: 'global' };
      } catch (e) { /* fall through to local */ }
    }
    const list = readLocal();
    const i = list.findIndex((e) => e.name === name);   // de-dupe by name — keep the best score
    if (i >= 0) { if (score > list[i].score) list[i] = entry; } else { list.push(entry); }
    writeLocal(sortTrim(list));
    return { ok: true, scope: 'local' };
  }

  async function top() {
    if (window.OnChain && window.OnChain.available()) {
      try { const list = await window.OnChain.top(MAX); if (Array.isArray(list)) return { scope: 'on-chain', list }; }
      catch (e) { /* chain unreachable — fall through */ }
    }
    if (REMOTE_URL) {
      try {
        const r = await fetch(REMOTE_URL, { cache: 'no-store' });
        const data = await r.json();
        if (Array.isArray(data)) return { scope: 'global', list: sortTrim(data) };
      } catch (e) { /* fall through to local */ }
    }
    return { scope: 'local', list: sortTrim(readLocal()) };
  }

  // Where would THIS score rank? (1-based, or null if off the board.)
  // Strictly-less so ties place you AFTER existing equal scores, not ahead.
  async function rankOf(score) {
    const { list } = await top();
    const idx = list.findIndex(e => e.score < score);
    return idx === -1 ? (list.length < MAX ? list.length + 1 : null) : idx + 1;
  }

  return { submit, top, rankOf, isRemote: !!REMOTE_URL };
})();
