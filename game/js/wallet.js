// Wallet connect — Robinhood injected wallets + Wallet Standard discovery (Phantom, Solflare,
// MetaMask, Backpack, Coinbase…). Pure vanilla JS. MetaMask Robinhood is initialized via
// @metamask/connect-robinhood (dynamic import) so it registers with Wallet Standard.
//
// Public API (window.Wallet):
//   state           -> { mode:'wallet'|null, address, rdns, name, chainOk, note }
//   onChange(cb)    -> subscribe; returns an unsubscribe fn
//   list()          -> [{ info:{name,icon,rdns}, provider, standard?, wallet? }]
//   renderOptions(container, onPick)  -> draw wallet buttons
//   connect(detail) -> async; wallet.connect()
//   disconnect()    -> forget the wallet
//   short(addr)     -> 'Ab12…xy9Z'
(function () {
  const KEY = 'sherwood_wallet';
  const SOL = (window.CONFIG && window.CONFIG.solana) || {};
  const CLUSTER = SOL.cluster || 'mainnet-beta';

  const INJECTED = [
    {
      name: 'Phantom',
      rdns: 'phantom',
      icon: 'assets/wallets/phantom.svg',
      detect: () => (window.phantom?.solana?.isPhantom ? window.phantom.solana : null),
    },
    {
      name: 'Solflare',
      rdns: 'solflare',
      icon: 'https://solflare.com/favicon.ico',
      detect: () => (window.solflare?.isSolflare ? window.solflare : null),
    },
    {
      name: 'Backpack',
      rdns: 'backpack',
      icon: '',
      detect: () => window.backpack || null,
    },
    {
      name: 'Coinbase Wallet',
      rdns: 'coinbase-solana',
      icon: '',
      detect: () => (window.coinbaseSolana?.isCoinbaseWallet ? window.coinbaseSolana : null),
    },
  ];

  const standardByRdns = {};
  let metaMaskClient = null;
  const META_RDNS = 'metamask-solana';
  const META_ICON = 'https://docs.metamask.io/img/metamask-fox.svg';
  const listeners = [];
  let bound = null;
  let boundStandard = null;
  let host = null;
  let onPick = null;
  let pendingRdns = null;

  const state = { mode: null, address: null, rdns: null, name: null, chainOk: false, note: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function short(a) { return a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : (a || ''); }
  function pubkeyStr(pk) {
    if (!pk) return '';
    if (typeof pk === 'string') return pk;
    if (typeof pk.toBase58 === 'function') return pk.toBase58();
    if (pk.publicKey && typeof pk.publicKey.toBase58 === 'function') return pk.publicKey.toBase58();
    return String(pk);
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() {
    try {
      if (!state.mode) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, address: state.address, rdns: state.rdns, name: state.name }));
    } catch (e) {}
  }
  function emit() { draw(); for (const cb of listeners.slice()) { try { cb(state); } catch (e) {} } }
  function onChange(cb) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; }

  function isSolanaChain(chain) { return typeof chain === 'string' && chain.startsWith('solana:'); }

  // ---- Wallet Standard discovery ----
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    const wallet = e.detail;
    if (!wallet || !wallet.features) return;
    const connect = wallet.features['standard:connect'];
    if (!connect || typeof connect.connect !== 'function') return;
    const chains = wallet.chains || [];
    if (!chains.some(isSolanaChain)) return;
    let rdns = (wallet.name || 'wallet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (wallet.name === 'MetaMask' || rdns === 'metamask') rdns = META_RDNS;
    if (standardByRdns[rdns]) return;
    const entry = { info: { name: wallet.name, icon: wallet.icon || (rdns === META_RDNS ? META_ICON : ''), rdns }, standard: true, wallet };
    if (rdns === META_RDNS) entry.metamask = true;
    if (metaMaskClient) entry.client = metaMaskClient;
    standardByRdns[rdns] = entry;
    draw();
    if (pendingRdns && rdns === pendingRdns) { pendingRdns = null; silent(standardByRdns[rdns]); }
    emit();
  });
  function discover() { window.dispatchEvent(new Event('wallet-standard:app-ready')); }

  function list() {
    const found = [];
    const seen = new Set();
    for (const w of INJECTED) {
      const provider = w.detect();
      if (provider && !seen.has(w.rdns)) {
        seen.add(w.rdns);
        found.push({ info: { name: w.name, icon: w.icon, rdns: w.rdns }, provider });
      }
    }
    if (standardByRdns[META_RDNS] && !seen.has(META_RDNS)) {
      seen.add(META_RDNS);
      found.push(standardByRdns[META_RDNS]);
    }
    for (const rdns in standardByRdns) {
      if (!seen.has(rdns)) found.push(standardByRdns[rdns]);
    }
    return found;
  }

  function accountsFromConnectResult(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.accounts)) return result.accounts;
    return null;
  }

  async function trySilentReconnect() {
    if (!pendingRdns) return;
    const match = list().find((d) => d.info.rdns === pendingRdns);
    if (match) { pendingRdns = null; silent(match); }
  }

  async function initMetaMask() {
    try {
      const { createSolanaClient } = await import('https://esm.sh/@metamask/connect-solana');
      metaMaskClient = await createSolanaClient({
        dapp: {
          name: 'Robinhood',
          url: window.location.origin || window.location.href,
        },
      });
      const wallet = metaMaskClient.getWallet();
      if (!wallet || !wallet.features || !wallet.features['standard:connect']) return;
      standardByRdns[META_RDNS] = {
        info: { name: wallet.name || 'MetaMask', icon: wallet.icon || META_ICON, rdns: META_RDNS },
        standard: true,
        wallet,
        metamask: true,
        client: metaMaskClient,
      };
      draw();
      await trySilentReconnect();
      emit();
    } catch (e) {}
  }

  function unbind() {
    if (bound && bound.removeAllListeners) {
      try { bound.removeAllListeners('connect'); bound.removeAllListeners('disconnect'); bound.removeAllListeners('accountChanged'); } catch (e) {}
    }
    bound = null;
    boundStandard = null;
  }

  function bindEvents(detail) {
    if (detail.standard) {
      boundStandard = detail.wallet;
      const events = detail.wallet.features && detail.wallet.features['standard:events'];
      if (!events || typeof events.on !== 'function') { bound = null; return; }
      bound = events;
      events.on('change', (props) => {
        const accounts = (props && props.accounts) || [];
        if (!accounts.length) { disconnect(); return; }
        const next = accounts[0] && accounts[0].address;
        if (state.mode === 'wallet' && state.address && next && next !== state.address) disconnect();
        else if (next) { state.address = next; save(); emit(); }
      });
      return;
    }
    const p = detail.provider;
    if (bound === p || !p || typeof p.on !== 'function') { bound = p; return; }
    bound = p;
    p.on('connect', (pk) => {
      const addr = pubkeyStr(pk) || pubkeyStr(p.publicKey);
      if (addr) { state.address = addr; save(); emit(); }
    });
    p.on('disconnect', () => { disconnect(); });
    p.on('accountChanged', (pk) => {
      if (!pk) { disconnect(); return; }
      const addr = pubkeyStr(pk);
      if (state.mode === 'wallet' && state.address && addr && addr !== state.address) disconnect();
      else if (addr) { state.address = addr; save(); emit(); }
    });
  }

  async function connectInjected(detail) {
    const p = detail.provider;
    let resp;
    try { resp = await p.connect(); } catch (e) { throw (e && e.message) ? e : new Error('Connection cancelled.'); }
    const pk = (resp && resp.publicKey) || p.publicKey;
    const address = pubkeyStr(pk);
    if (!address) throw new Error('No accounts authorized');
    return address;
  }

  async function connectStandard(detail, silentMode) {
    const connect = detail.wallet.features['standard:connect'];
    const result = await connect.connect(silentMode ? { silent: true } : undefined);
    const accounts = accountsFromConnectResult(result);
    const account = accounts && accounts[0];
    if (!account || !account.address) throw new Error('No accounts authorized');
    return account.address;
  }

  async function connect(detail) {
    const d = detail || list()[0];
    if (!d) throw new Error('No Robinhood wallet detected');
    let address;
    if (d.standard) address = await connectStandard(d, false);
    else address = await connectInjected(d);
    state.mode = 'wallet';
    state.address = address;
    state.rdns = d.info.rdns;
    state.name = d.info.name;
    bindEvents(d);
    state.chainOk = true;
    state.note = CLUSTER === 'mainnet-beta' ? '' : 'Connected on ' + CLUSTER + '.';
    save();
    emit();
    return state;
  }

  async function silent(d) {
    try {
      if (d.standard) {
        const address = await connectStandard(d, true);
        state.mode = 'wallet';
        state.address = address;
        state.rdns = d.info.rdns;
        state.name = d.info.name;
        bindEvents(d);
        state.chainOk = true;
        state.note = CLUSTER === 'mainnet-beta' ? '' : 'Connected on ' + CLUSTER + '.';
        save();
        emit();
        return true;
      }
      const p = d.provider;
      if (p.isConnected && p.publicKey) {
        state.mode = 'wallet';
        state.address = pubkeyStr(p.publicKey);
        state.rdns = d.info.rdns;
        state.name = d.info.name;
        bindEvents(d);
        state.chainOk = true;
        save();
        emit();
        return true;
      }
      try {
        const resp = await p.connect({ onlyIfTrusted: true });
        const pk = (resp && resp.publicKey) || p.publicKey;
        const address = pubkeyStr(pk);
        if (address) {
          state.mode = 'wallet';
          state.address = address;
          state.rdns = d.info.rdns;
          state.name = d.info.name;
          bindEvents(d);
          state.chainOk = true;
          save();
          emit();
          return true;
        }
      } catch (e) {}
    } catch (e) {}
    return false;
  }

  async function disconnect() {
    const prev = list().find((d) => d.info.rdns === state.rdns);
    unbind();
    if (prev) {
      if (prev.metamask && prev.client) {
        try { await prev.client.disconnect(); } catch (e) {}
      } else if (prev.standard) {
        const disc = prev.wallet.features && prev.wallet.features['standard:disconnect'];
        if (disc && typeof disc.disconnect === 'function') {
          try { await disc.disconnect(); } catch (e) {}
        }
      } else if (prev.provider && prev.provider.isConnected) {
        try { await prev.provider.disconnect(); } catch (e) {}
      }
    }
    state.mode = null;
    state.address = state.rdns = state.name = null;
    state.chainOk = false;
    state.note = '';
    save();
    emit();
    draw();
  }

  function draw() {
    if (!host) return;
    const ls = list();
    host.innerHTML = '';
    if (state.mode === 'wallet' && state.address) {
      const row = document.createElement('div');
      row.className = 'wallet-connected';
      row.textContent = 'Connected: ' + short(state.address) + (state.name ? ' · ' + state.name : '');
      host.appendChild(row);
      const disc = document.createElement('button');
      disc.type = 'button';
      disc.className = 'btn btn-ghost wallet-disconnect';
      disc.textContent = 'Disconnect';
      disc.addEventListener('click', () => { disconnect(); });
      host.appendChild(disc);
    }
    if (!ls.length) {
      const m = document.createElement('div');
      m.className = 'wallet-empty';
      m.innerHTML = 'No Robinhood wallet found. Install <a href="https://metamask.io" target="_blank" rel="noopener">MetaMask</a>, <a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a>, or <a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a>, then reload.';
      host.appendChild(m);
      return;
    }
    for (const d of ls) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wallet-opt';
      const ic = d.info.icon
        ? `<img class="wallet-opt-ic" src="${esc(d.info.icon)}" alt="" aria-hidden="true">`
        : `<span class="wallet-opt-ic">${window.icon ? window.icon('wallet') : ''}</span>`;
      b.innerHTML = `${ic}<span class="wallet-opt-name">${esc(d.info.name)}</span>`;
      b.addEventListener('click', () => { if (onPick) onPick(d); });
      host.appendChild(b);
    }
  }

  function renderOptions(container, pick) { host = container; onPick = pick; draw(); }

  const saved = load();
  if (saved && saved.mode === 'wallet') {
    state.mode = saved.mode;
    state.address = saved.address || null;
    state.rdns = saved.rdns || null;
    state.name = saved.name || null;
    pendingRdns = saved.rdns || null;
    if (pendingRdns === 'metamask') pendingRdns = META_RDNS;
  }
  discover();
  setTimeout(trySilentReconnect, 350);
  initMetaMask();

  window.Wallet = { state, onChange, list, renderOptions, connect, disconnect, short, provider: () => bound, kind: 'solana' };
})();