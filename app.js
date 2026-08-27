(() => {
  'use strict';

  const state = {
    all: [], visible: [], index: 0, screen: 'unlock',
    filterIndex: 0, activeFilter: 'all', detailPage: 0,
    userLocation: null, gpsError: null, sortedNearest: false
  };

  const $ = (id) => document.getElementById(id);
  const screens = ['unlockScreen', 'mainScreen', 'detailScreen', 'filterScreen'];
  const filters = [
    ['all', 'All 80 locations', 'Original packet order'],
    ['high', 'High service priority', 'Locations flagged High in the report'],
    ['encampment', 'Encampments only', 'Only records classified Encampment'],
    ['safe', 'Safe Spaces only', 'Only records classified Safe Space'],
    ['East Central', 'East Central', 'Route-zone filter'],
    ['Central Core', 'Central Core', 'Route-zone filter'],
    ['West Central', 'West Central', 'Route-zone filter'],
    ['North West', 'North West', 'Route-zone filter'],
    ['North Central', 'North Central', 'Route-zone filter'],
    ['South Central', 'South Central', 'Route-zone filter'],
    ['South East', 'South East', 'Route-zone filter']
  ];

  function showScreen(name) {
    state.screen = name;
    screens.forEach((id) => $(id).classList.toggle('active', id === name + 'Screen'));
    if (name === 'main') $('detailsButton').focus();
    if (name === 'filter') $('applyFilterButton').focus();
    if (name === 'unlock') $('pinInput').focus();
  }

  function bytesFromBase64(s) {
    const raw = atob(s); const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function decryptData(pin) {
    const response = await fetch('data.enc.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Encrypted data could not be loaded.');
    const payload = await response.json();
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytesFromBase64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytesFromBase64(payload.iv) }, key, bytesFromBase64(payload.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function unlock() {
    const pin = $('pinInput').value.trim();
    if (!/^\d{8}$/.test(pin)) {
      $('unlockStatus').textContent = 'Enter the 8-digit private PIN.'; return;
    }
    $('unlockStatus').textContent = 'Decrypting locations…';
    $('unlockButton').disabled = true;
    try {
      state.all = await decryptData(pin);
      if (!Array.isArray(state.all) || state.all.length !== 80) throw new Error('Unexpected data format.');
      state.visible = [...state.all]; state.index = 0;
      $('pinInput').value = '';
      $('unlockStatus').textContent = '';
      showScreen('main'); renderLocation();
    } catch (err) {
      $('unlockStatus').textContent = 'PIN not accepted or data unavailable.';
    } finally { $('unlockButton').disabled = false; }
  }

  function current() { return state.visible[state.index]; }
  function concisePriority(p) {
    if (!p) return 'VERIFY';
    if (/high/i.test(p)) return 'HIGH';
    if (/moderate/i.test(p)) return 'MOD';
    return 'ROUTINE';
  }
  function cleanNote(note) {
    if (!note || /No narrative note/i.test(note)) return 'No field note recorded — verify current conditions.';
    return note.replace(/[■]/g, '').trim();
  }

  function renderLocation() {
    const r = current(); if (!r) return;
    $('positionLabel').textContent = `${state.index + 1} / ${state.visible.length}`;
    $('filterLabel').textContent = filterName(state.activeFilter).toUpperCase();
    $('packetId').textContent = `#${r.packet_id}`;
    $('typeBadge').textContent = r.type.toUpperCase();
    const pri = concisePriority(r.service_priority);
    $('priorityBadge').textContent = pri;
    $('priorityBadge').className = `badge priority ${pri === 'HIGH' ? 'high' : pri === 'MOD' ? 'moderate' : ''}`;
    $('locationTitle').textContent = r.title;
    $('locationAddress').textContent = r.address;
    $('distanceValue').textContent = `ZIP ${r.zip}`;
    $('countValue').textContent = r.last_count > 0 ? String(r.last_count) : 'UNK';
    $('zoneValue').textContent = r.route_zone.replace(' Central',' C.').replace('North ','N. ').replace('South ','S. ').replace('West ','W. ').replace('East ','E. ');
    $('notePreview').textContent = cleanNote(r.source_note);
    updateDetailLinks(r);
  }

  function stepLocation(delta) {
    if (!state.visible.length) return;
    state.index = (state.index + delta + state.visible.length) % state.visible.length;
    renderLocation();
    if (state.screen === 'detail') renderDetail();
  }

  function filterName(key) {
    const item = filters.find((f) => f[0] === key); return item ? item[1].replace(/ locations$/,'') : key;
  }

  function applyFilter(key) {
    state.activeFilter = key;
    let list = [...state.all];
    if (key === 'high') list = list.filter((r) => /high/i.test(r.service_priority));
    else if (key === 'encampment') list = list.filter((r) => /encampment/i.test(r.type));
    else if (key === 'safe') list = list.filter((r) => /safe space/i.test(r.type));
    else if (key !== 'all') list = list.filter((r) => r.route_zone === key);
    state.visible = list; state.index = 0;
    renderLocation(); showScreen('main');
  }

  function openNavigation() {
    const r = current(); if (!r) return;
    const apple = `https://maps.apple.com/?daddr=${r.lat},${r.lon}&dirflg=d`;
    window.open(apple, '_blank', 'noopener,noreferrer');
  }

  function renderFilterChoice() {
    const f = filters[state.filterIndex];
    $('filterChoice').textContent = f[1]; $('filterDescription').textContent = f[2];
  }
  function changeFilter(delta) {
    state.filterIndex = (state.filterIndex + delta + filters.length) % filters.length; renderFilterChoice();
  }

  function renderDetail() {
    const r = current(); if (!r) return;
    const pages = [
      ['Field note', cleanNote(r.source_note), `Type: ${r.type} • Count: ${r.last_count > 0 ? r.last_count : 'unknown'} • Confidence: ${r.data_confidence}`],
      ['Service plan', r.service_summary || 'No service-preparation note recorded.', `Service: ${r.service_priority || 'verify'} • Verification: ${r.verification_priority || 'verify'}`],
      ['Field context', `${r.setting} ${r.evidence}`, `GPS: ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)} • ZIP ${r.zip}`]
    ];
    const p = pages[state.detailPage];
    $('detailPacket').textContent = `#${r.packet_id}`;
    $('detailPageLabel').textContent = `${['NOTE','SERVICE','CONTEXT'][state.detailPage]} ${state.detailPage+1}/3`;
    $('detailDistance').textContent = `ZIP ${r.zip}`;
    $('detailTitle').textContent = r.title;
    $('detailHeading').textContent = p[0]; $('detailBody').textContent = p[1]; $('detailMeta').textContent = p[2];
    $('mapActions').classList.toggle('hidden', state.detailPage !== 2);
    updateDetailLinks(r);
  }
  function changeDetailPage(delta) {
    state.detailPage = (state.detailPage + delta + 3) % 3; renderDetail();
  }
  function updateDetailLinks(r) {
    if (!r) return;
    $('aerialLink').href = `https://www.google.com/maps/@?api=1&map_action=map&center=${r.lat},${r.lon}&zoom=19&basemap=satellite`;
    $('directionsLink').href = `https://maps.apple.com/?daddr=${r.lat},${r.lon}&dirflg=d`;
  }
  function enterDetails() { state.detailPage = 0; renderDetail(); showScreen('detail'); }

  function handleKey(e) {
    if (state.screen === 'unlock') {
      if (e.key === 'Enter' && document.activeElement === $('unlockButton')) { e.preventDefault(); unlock(); }
      return;
    }
    if (state.screen === 'main') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepLocation(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLocation(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); openNavigation(); }
      else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); enterDetails(); }
      else if (e.key === 'Escape') { e.preventDefault(); state.filterIndex = Math.max(0, filters.findIndex(f => f[0] === state.activeFilter)); renderFilterChoice(); showScreen('filter'); }
    } else if (state.screen === 'detail') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepLocation(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLocation(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); changeDetailPage(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); changeDetailPage(1); }
      else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); showScreen('main'); }
    } else if (state.screen === 'filter') {
      if (e.key === 'ArrowUp') { e.preventDefault(); changeFilter(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); changeFilter(1); }
      else if (e.key === 'Enter') { e.preventDefault(); applyFilter(filters[state.filterIndex][0]); }
      else if (e.key === 'Escape') { e.preventDefault(); showScreen('main'); }
    }
  }

  let touchStartX = null;
  function onTouchStart(e) { if (e.changedTouches && e.changedTouches[0]) touchStartX = e.changedTouches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX == null || !e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStartX; touchStartX = null;
    if (Math.abs(dx) < 55) return;
    if (state.screen === 'main' || state.screen === 'detail') stepLocation(dx < 0 ? 1 : -1);
  }

  $('unlockButton').addEventListener('click', unlock);
  $('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('unlockButton').focus(); } });
  $('prevButton').addEventListener('click', () => stepLocation(-1));
  $('nextButton').addEventListener('click', () => stepLocation(1));
  $('detailsButton').addEventListener('click', enterDetails);
  $('navigateButton').addEventListener('click', openNavigation);
  $('backButton').addEventListener('click', () => showScreen('main'));
  $('detailNextButton').addEventListener('click', () => stepLocation(1));
  $('applyFilterButton').addEventListener('click', () => applyFilter(filters[state.filterIndex][0]));
  $('cancelFilterButton').addEventListener('click', () => showScreen('main'));
  document.addEventListener('keydown', handleKey);
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  renderFilterChoice();
  setTimeout(() => $('pinInput').focus(), 50);
})();
