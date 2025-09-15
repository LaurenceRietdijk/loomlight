(() => {
  const state = {
    worlds: [],
    currentWorld: null,
    locales: [],
    bounds: null,
    selectedCoords: null,
    selectedCharacter: null,
    playerCharacters: [],
    selectedPlayerCharacter: null,
    quests: [],
  };

  // Tab wiring
  const tabButtons = document.querySelectorAll('.tab-button');
  const panels = {
    worlds: document.getElementById('tab-worlds'),
    map: document.getElementById('tab-map'),
    locale: document.getElementById('tab-locale'),
    biomes: document.getElementById('tab-biomes'),
    character: document.getElementById('tab-character'),
    quests: document.getElementById('tab-quests'),
  };
  const characterTabButton = document.querySelector('.tab-button[data-tab="character"]');
  const mapTabButton = document.querySelector('.tab-button[data-tab="map"]');
  const localeTabButton = document.querySelector('.tab-button[data-tab="locale"]');
  const biomesTabButton = document.querySelector('.tab-button[data-tab="biomes"]');
  const questsTabButton = document.querySelector('.tab-button[data-tab="quests"]');
  function switchTab(key) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === key));
    Object.entries(panels).forEach(([k, el]) => el.classList.toggle('active', k === key));
    // When navigating to character tab, refresh with full character payload
    if (key === 'character') {
      loadSelectedCharacterFull();
    }
    if (key === 'quests') {
      loadAcceptedQuests();
    }
    if (key === 'map') {
      // Ensure map reflects latest locales after any mutations
      loadLocales();
    }
    if (key === 'biomes') {
      loadBiomes();
    }
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-button')) {
      if (e.target.hasAttribute('disabled')) return;
      switchTab(e.target.dataset.tab);
    }
  });

  // World selection UI
  const elWorldList = document.getElementById('world-list');
  const elWorldErr = document.getElementById('world-error');
  const elWorldName = document.getElementById('current-world-name');
  const elCreatorInput = document.getElementById('creator-input');
  const btnGenerateWorld = document.getElementById('btn-generate-world');

  // Player character UI
  const elPCList = document.getElementById('pc-list');
  const elPCErr = document.getElementById('pc-error');
  const elPCNameInput = document.getElementById('pc-name-input');
  const btnAddPC = document.getElementById('btn-add-pc');

  // Quests UI
  const elQuestsList = document.getElementById('quests-list');
  const elQuestsErr = document.getElementById('quests-error');
  const elToast = document.getElementById('toast');

  // Biomes UI
  const elBiomesList = document.getElementById('biomes-list');
  const elBiomesErr = document.getElementById('biomes-error');
  const btnGenerateBiome = document.getElementById('btn-generate-biome');

  async function loadWorlds() {
    elWorldErr.textContent = '';
    try {
      const res = await fetch('/world');
      if (!res.ok) throw new Error('Failed to load worlds');
      const data = await res.json();
      state.worlds = data.worlds || [];
      renderWorlds();
    } catch (err) {
      console.error(err);
      elWorldErr.textContent = 'Error loading worlds.';
    }
  }

  function renderWorlds() {
    elWorldList.innerHTML = '';
    if (!state.worlds.length) {
      elWorldList.innerHTML = '<div class="world-meta">No worlds found. Generate one via the API.</div>';
      return;
    }
    state.worlds.forEach(w => {
      const card = document.createElement('div');
      card.className = 'world-card';
      card.innerHTML = `
        <div class="world-title">${escapeHtml(w.name)}</div>
        <div class="world-meta">${escapeHtml(w.creator || 'unknown')}</div>
        <div class="world-meta">${new Date(w.createdAt || w.created_at || w._id?.toString().slice(0,8)).toLocaleString()}</div>
        <div class="actions">
          <button class="btn-delete" title="Delete">Delete</button>
        </div>
      `;
      card.addEventListener('click', () => selectWorld(w));
      const btnDel = card.querySelector('.btn-delete');
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = confirm(`Delete world "${w.name}"? This removes its database.`);
        if (!ok) return;
        try {
          const res = await fetch(`/world/${w._id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete world');
          await loadWorlds();
        } catch (err) {
          console.error(err);
          elWorldErr.textContent = 'Error deleting world.';
        }
      });
      elWorldList.appendChild(card);
    });
  }

  if (btnGenerateWorld) {
    btnGenerateWorld.addEventListener('click', async () => {
      elWorldErr.textContent = '';
      const creator = (elCreatorInput?.value || '').trim();
      if (!creator) { elWorldErr.textContent = 'Please enter a creator.'; return; }
      try {
        const res = await fetch('/world/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator })
        });
        if (!res.ok) throw new Error('Failed to generate world');
        await loadWorlds();
      } catch (err) {
        console.error(err);
        elWorldErr.textContent = 'Error generating world.';
      }
    });
  }

  async function selectWorld(world) {
    state.currentWorld = world;
    elWorldName.textContent = world.name;
    state.selectedCharacter = null;
    if (characterTabButton) characterTabButton.setAttribute('disabled', 'true');
    updateNavLocks();
    if (state.selectedPlayerCharacter) {
      try {
        await ensureActivePCDoc(state.currentWorld._id, state.selectedPlayerCharacter._id);
      } catch {}
      switchTab('map');
      await loadLocales();
      // Initialize Player/Game model when both world and player are selected
      try {
        if (window.Models && window.Models.Player && window.Game) {
          const player = window.Models.Player.fromSelection(state.currentWorld, state.selectedPlayerCharacter);
          window.Game.setPlayer(player);
        }
      } catch {}
      await loadAcceptedQuests();
    } else {
      // Stay on worlds tab until a player character is selected
      switchTab('worlds');
      elWorldErr.textContent = 'Select a player character to continue.';
    }
  }

  // Player characters
  async function loadPlayerCharacters() {
    elPCErr.textContent = '';
    try {
      const res = await fetch('/playerCharacter');
      if (!res.ok) throw new Error('Failed to load player characters');
      const data = await res.json();
      state.playerCharacters = data.playerCharacters || [];
      renderPlayerCharacters();
    } catch (err) {
      console.error(err);
      elPCErr.textContent = 'Error loading player characters.';
    }
  }

  function renderPlayerCharacters() {
    if (!elPCList) return;
    elPCList.innerHTML = '';
    if (!state.playerCharacters.length) {
      elPCList.innerHTML = '<div class="world-meta">No player characters yet. Add one above.</div>';
      return;
    }
    state.playerCharacters.forEach(pc => {
      const card = document.createElement('div');
      card.className = 'world-card';
      const isSelected = state.selectedPlayerCharacter && String(state.selectedPlayerCharacter._id) === String(pc._id);
      card.innerHTML = `
        <div class="world-title">${escapeHtml(pc.name)}</div>
        <div class="world-meta">ID: ${escapeHtml(pc._id)}</div>
        <div class="actions">
          <button class="btn-delete" title="Delete">Delete</button>
        </div>
      `;
      if (isSelected) card.style.outline = '2px solid var(--accent)';
      card.addEventListener('click', () => selectPlayerCharacter(pc));
      const btnDel = card.querySelector('.btn-delete');
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = confirm(`Delete player character "${pc.name}"?`);
        if (!ok) return;
        try {
          const res = await fetch(`/playerCharacter/${pc._id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete');
          if (state.selectedPlayerCharacter && String(state.selectedPlayerCharacter._id) === String(pc._id)) {
            state.selectedPlayerCharacter = null;
            updateNavLocks();
          }
          await loadPlayerCharacters();
        } catch (err) {
          console.error(err);
          elPCErr.textContent = 'Error deleting player character.';
        }
      });
      elPCList.appendChild(card);
    });
  }

  async function selectPlayerCharacter(pc) {
    state.selectedPlayerCharacter = pc;
    elPCErr.textContent = '';
    renderPlayerCharacters();
    updateNavLocks();
    if (state.currentWorld) {
      try { await ensureActivePCDoc(state.currentWorld._id, state.selectedPlayerCharacter._id); } catch {}
      switchTab('map');
      await loadLocales();
      // Initialize/refresh Player/Game model when both world and player are selected
      try {
        if (window.Models && window.Models.Player && window.Game) {
          const player = window.Models.Player.fromSelection(state.currentWorld, state.selectedPlayerCharacter);
          window.Game.setPlayer(player);
        }
      } catch {}
      await loadAcceptedQuests();
    }
  }

  if (btnAddPC) {
    btnAddPC.addEventListener('click', async () => {
      elPCErr.textContent = '';
      const name = (elPCNameInput?.value || '').trim();
      if (!name) { elPCErr.textContent = 'Please enter a name.'; return; }
      try {
        const res = await fetch('/playerCharacter', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error('Failed to add player character');
        elPCNameInput.value = '';
        await loadPlayerCharacters();
      } catch (err) {
        console.error(err);
        elPCErr.textContent = 'Error adding player character.';
      }
    });
  }

  function updateNavLocks() {
    const ok = !!(state.currentWorld && state.selectedPlayerCharacter);
    if (mapTabButton) mapTabButton.toggleAttribute('disabled', !ok);
    if (localeTabButton) localeTabButton.toggleAttribute('disabled', !ok);
    if (questsTabButton) questsTabButton.toggleAttribute('disabled', !ok);
    // Biomes are global; always enabled
    if (biomesTabButton) biomesTabButton.removeAttribute('disabled');
    // Character tab remains gated by in-world character selection.
    // Additionally, if world+player not selected, force-disable it.
    if (characterTabButton && !ok) characterTabButton.setAttribute('disabled', 'true');
  }

  async function loadBiomes() {
    if (!elBiomesList) return;
    elBiomesErr.textContent = '';
    elBiomesList.innerHTML = '';
    try {
      // Prefer Game cache
      let biomes = (window.Game && typeof window.Game.getAllBiomes === 'function')
        ? window.Game.getAllBiomes()
        : [];
      if (!Array.isArray(biomes) || biomes.length === 0) {
        const res = await fetch('/biome');
        if (!res.ok) throw new Error('Failed to load biomes');
        const data = await res.json();
        const raw = data.biomes || [];
        try {
          if (window.Game && typeof window.Game.setBiomesFromArray === 'function') {
            biomes = window.Game.setBiomesFromArray(raw);
          } else { biomes = raw; }
        } catch { biomes = raw; }
      }
      renderBiomes(biomes || []);
    } catch (e) {
      console.error(e);
      elBiomesErr.textContent = 'Error loading biomes.';
    }
  }

  function renderBiomes(list) {
    if (!elBiomesList) return;
    if (!Array.isArray(list) || list.length === 0) {
      elBiomesList.innerHTML = '<div class="world-meta">No biomes yet. Generate one to get started.</div>';
      return;
    }
    elBiomesList.innerHTML = '';
    list.forEach((b) => {
      const name = escapeHtml(b.name || (b.id || 'Biome'));
      const desc = escapeHtml(b.description || '');
      const locales = (b.locales && typeof b.locales === 'object') ? Object.entries(b.locales) : [];
      const activeTypes = locales.filter(([, v]) => !!v).map(([k]) => String(k));
      const tags = activeTypes.length ? activeTypes.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') : '<span class="muted">None</span>';
      const card = document.createElement('div');
      card.className = 'world-card';
      card.style.cursor = 'default';
      card.innerHTML = `
        <div class="world-title">${name}</div>
        <div class="world-meta" style="margin-bottom:6px;">${desc}</div>
        <div class="section-title">Allowed Locale Types</div>
        <div class="tags">${tags}</div>
      `;
      elBiomesList.appendChild(card);
    });
  }

  if (btnGenerateBiome) {
    btnGenerateBiome.addEventListener('click', async () => {
      elBiomesErr.textContent = '';
      btnGenerateBiome.disabled = true; btnGenerateBiome.textContent = 'Generating...';
      try {
        const body = {};
        if (state.currentWorld && state.currentWorld._id) {
          body.world_id = String(state.currentWorld._id);
        }
        const res = await fetch('/biome/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Failed to generate biome');
        // Refresh list
        // Clear Game cache biomes so we re-render new data
        try { if (window.Game && typeof window.Game.clearBiomes === 'function') window.Game.clearBiomes(); } catch {}
        await loadBiomes();
      } catch (e) {
        console.error(e);
        elBiomesErr.textContent = 'Error generating biome.';
      } finally {
        btnGenerateBiome.disabled = false; btnGenerateBiome.textContent = 'Generate Biome';
      }
    });
  }

  async function ensureActivePCDoc(worldId, pcId) {
    try {
      await fetch('/activePlayerCharacter/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world_id: String(worldId), player_character_id: String(pcId) })
      });
    } catch (e) {
      console.warn('ensureActivePCDoc failed', e);
    }
  }

  // Map rendering
  const elMapGrid = document.getElementById('map-grid');
  const elMapContainer = document.getElementById('map-container');
  const elMapErr = document.getElementById('map-error');

  async function loadLocales() {
    if (!state.currentWorld || !state.selectedPlayerCharacter) return;
    elMapErr.textContent = '';
    elMapGrid.innerHTML = '';
    try {
      // Prefer Game cache if present; otherwise fetch then cache
      let locales = (window.Game && typeof window.Game.getAllLocales === 'function')
        ? window.Game.getAllLocales()
        : [];
      if (!Array.isArray(locales) || locales.length === 0) {
        const params = new URLSearchParams({ world_id: state.currentWorld._id });
        const res = await fetch(`/locale/list?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load locales');
        const data = await res.json();
        const raw = data.locales || [];
        try {
          if (window.Game && typeof window.Game.setLocalesFromArray === 'function') {
            locales = window.Game.setLocalesFromArray(raw);
          } else {
            locales = raw;
          }
        } catch { locales = raw; }
      }
      state.locales = locales || [];
      renderMap();
    } catch (err) {
      console.error(err);
      elMapErr.textContent = 'Error loading locales.';
    }
  }

  // Quest list and progress rendering
  async function loadAcceptedQuests() {
    if (!state.currentWorld || !state.selectedPlayerCharacter) return;
    elQuestsErr.textContent = '';
    elQuestsList.innerHTML = '';
    try {
      const params = new URLSearchParams({
        world_id: String(state.currentWorld._id),
        player_character_id: String(state.selectedPlayerCharacter._id),
      });
      const res = await fetch(`/quest/accepted?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load quests');
      const data = await res.json();
      state.quests = Array.isArray(data.quests) ? data.quests : [];
      renderQuests();
      // Populate Player model quests list
      try {
        if (window.Game && window.Game.player && typeof window.Game.player.setQuestsFromArray === 'function') {
          window.Game.player.setQuestsFromArray(state.quests);
        }
      } catch {}
    } catch (e) {
      console.error(e);
      elQuestsErr.textContent = 'Error loading quests.';
    }
  }

  function renderQuests() {
    if (!elQuestsList) return;
    if (!state.quests || !state.quests.length) {
      elQuestsList.innerHTML = '<div class="muted">No accepted quests yet.</div>';
      return;
    }
    elQuestsList.innerHTML = state.quests.map(q => questItemHTML(q)).join('');

    // One-time delegate for recompute buttons
    if (!elQuestsList._recomputeHooked) {
      elQuestsList.addEventListener('click', async (e) => {
        const btn = e.target && e.target.closest('button[data-action="recompute-quest"]');
        if (!btn) return;
        const qid = btn.getAttribute('data-qid');
        if (!qid || !state.currentWorld) return;
        const prevText = btn.textContent;
btn.disabled = true; btn.textContent = 'Recomputing…';
try {
  let msg = '';
  if (window.Game && window.Game.player && Array.isArray(window.Game.player.quests)) {
    const qObj = window.Game.player.quests.find(q => String(q.id) === String(qid));
    if (qObj && typeof qObj.progressText === 'string') {
      msg = qObj.progressText;
    }
  }
  const idx = state.quests.findIndex(q => String(q._id) === String(qid));
  if (idx >= 0) {
    state.quests[idx].debugProgressText = msg || `World ${String(state.currentWorld._id)}, Quest ${String(qid)}`;
    renderQuests();
  }
} catch (err) {
  console.error(err);
  showToast('Failed to recompute quest');
} finally {
  btn.disabled = false; btn.textContent = prevText;
}}, { passive: true });
      elQuestsList._recomputeHooked = true;
    }
  }

  function questStatusLabel(q) {
    // Map internal states to user-friendly labels
    const s = String(q.state || '').toLowerCase();
    if (s === 'acepted') return 'active';
    if (s === 'completed') return 'complete';
    if (s === 'avaliable') return 'available';
    return s || 'unknown';
  }

  function questItemHTML(q) {
    const title = escapeHtml(q.title || 'Untitled Quest');
    const status = escapeHtml(questStatusLabel(q));
    const rawType = String((q && (q.questType || q.type)) || '').trim();
    const typeLabel = escapeHtml(rawType || '');
    const lowType = rawType.toLowerCase();
    let progress = '';
    try {
      const modelQuest = (window.Game && window.Game.player && Array.isArray(window.Game.player.quests))
        ? window.Game.player.quests.find(mq => String(mq.id) === String(q._id || q.id))
        : null;
      if (modelQuest && typeof modelQuest.progressText === 'string' && modelQuest.progressText) {
        progress = `<div class="muted">${escapeHtml(String(modelQuest.progressText))}</div>`;
      }
    } catch {}
    if (!progress && q.debugProgressText) {
      progress = `<div class="muted">${escapeHtml(String(q.debugProgressText))}</div>`;
    } else if (!progress && lowType === 'clear') {
      const rem = Number(q.enemiesRemaining || 0);
      progress = `<div class="muted">${rem} enemies remaining</div>`;
    } else if (lowType === 'explore') {
      const locName = (q.targetLocale && typeof q.targetLocale === 'object' && q.targetLocale.name)
        ? q.targetLocale.name
        : 'target area';
      progress = `<div class="muted">Explore ${escapeHtml(locName)}</div>`;
    } else if (lowType === 'kill') {
      const cnt = Number(q.count || 1);
      const who = q.targetFaction ? 'enemies' : (q.targetCharacter ? 'target(s)' : 'enemies');
      progress = `<div class="muted">Defeat ${cnt} ${who}</div>`;
    } else if (lowType === 'fetch') {
      const qty = Number(q.quantity || 1);
      progress = `<div class="muted">Collect ${qty} item(s)</div>`;
    } else if (lowType === 'deliver') {
      const qty = Number(q.quantity || 1);
      progress = `<div class="muted">Deliver ${qty} item(s)</div>`;
    } else if (lowType === 'gather') {
      const qty = Number(q.quantity || 1);
      const resName = q.resourceName ? escapeHtml(q.resourceName) : 'resources';
      progress = `<div class="muted">Gather ${qty} ${resName}</div>`;
    } else {
      // For unknown types, omit the progress line to avoid placeholder text
      progress = '';
    }
    const desc = escapeHtml(q.description || '');
    return `
      <details class="acc">
        <summary>
          <div class="acc-title">${title}</div>
          <div class="acc-sub">${status} &middot; ${typeLabel}</div>
        </summary>
        <div class="acc-content">
          <div class="muted" style="margin-bottom:6px;">${desc}</div>
          ${progress}
          <div class="actions" style="margin-top:8px;">
            <button class="btn" data-action="recompute-quest" data-qid="${String(q._id)}">Recompute</button>
          </div>
        </div>
      </details>
    `;
  }

  // Simple toast alert
  let toastTimer = null;
  function showToast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elToast.style.display = 'none'; }, 3000);
  }

  function computeBounds(locales) {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const loc of locales) {
      const x = loc.coordinates?.x ?? 0;
      const y = loc.coordinates?.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Ensure (0,0) is within bounds
    minX = Math.min(minX, 0);
    maxX = Math.max(maxX, 0);
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);

    // Add a small margin for breathing room
    const pad = 1;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }

  function renderMap() {
    const map = new Map();
    for (const loc of state.locales) {
      const key = `${loc.coordinates.x},${loc.coordinates.y}`;
      map.set(key, loc);
    }
    const b = state.bounds = computeBounds(state.locales);
    const cols = b.maxX - b.minX + 1;
    const rows = b.maxY - b.minY + 1;

    elMapGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(80px, 1fr))`;
    elMapGrid.style.gridTemplateRows = `repeat(${rows}, 60px)`;
    elMapGrid.innerHTML = '';

    for (let y = b.maxY; y >= b.minY; y--) {
      for (let x = b.minX; x <= b.maxX; x++) {
        const key = `${x},${y}`;
        const loc = map.get(key);
        const cell = document.createElement('div');
        cell.className = 'map-cell' + (loc ? ' locale' : '');
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.innerHTML = loc ? `
          <div class="cell-label">
            <div class="name">${escapeHtml(loc.name)}</div>
            <div class="coords">(${x}, ${y}) - ${escapeHtml(loc.type || '') }</div>
          </div>
        ` : `
          <div class="cell-label">
            <div class="coords">(${x}, ${y})</div>
          </div>
        `;
        cell.addEventListener('click', () => onCellClick(x, y, !!loc));
        elMapGrid.appendChild(cell);
      }
    }

    // Scroll near the (0,0) cell
    scrollToCoords(0, 0);
  }

  function scrollToCoords(x, y) {
    const sel = `.map-cell[data-x="${x}"][data-y="${y}"]`;
    const cell = elMapGrid.querySelector(sel);
    if (cell) {
      const rect = cell.getBoundingClientRect();
      const containerRect = elMapContainer.getBoundingClientRect();
      elMapContainer.scrollLeft += (rect.left - containerRect.left) - (elMapContainer.clientWidth / 2 - rect.width / 2);
      elMapContainer.scrollTop += (rect.top - containerRect.top) - (elMapContainer.clientHeight / 2 - rect.height / 2);
      highlightCell(cell);
    }
  }

  function highlightCell(cell) {
    elMapGrid.querySelectorAll('.map-cell.active').forEach(el => el.classList.remove('active'));
    cell.classList.add('active');
  }

  async function onCellClick(x, y, hasLocale) {
    state.selectedCoords = { x, y };
    try {
      // Try to find a matching Locale model from Game cache
      let loc = null;
      try {
        const list = (window.Game && typeof window.Game.getAllLocales === 'function') ? window.Game.getAllLocales() : [];
        loc = (list || []).find(l => l && l.coordinates && Number(l.coordinates.x) === Number(x) && Number(l.coordinates.y) === Number(y)) || null;
      } catch {}

      if (!loc && !hasLocale) {
        renderGenerateLocaleUI(x, y);
        switchTab('locale');
        return;
      }

      // If we don't have a model instance, fallback to fetching minimal then hydrate
      if (!loc) {
        const params = new URLSearchParams({ world_id: state.currentWorld._id, x: String(x), y: String(y) });
        const res = await fetch(`/locale?${params.toString()}`);
        if (res.status === 404) {
          renderGenerateLocaleUI(x, y);
          switchTab('locale');
          return;
        }
        if (!res.ok) throw new Error('Failed to load locale');
        const data = await res.json();
        const Locale = window.Models && window.Models.Locale ? window.Models.Locale : null;
        loc = Locale ? Locale.from(data.locale) : data.locale;
      }

      // Ensure nested refs are loaded only now (lazy)
      try { if (loc && typeof loc.ensureLoaded === 'function') await loc.ensureLoaded(state.currentWorld?._id); } catch {}

      state.currentLocale = loc;
      renderLocaleUI(loc, x, y);
      switchTab('locale');
    } catch (err) {
      console.error(err);
      state.currentLocale = null;
      renderLocaleErrorUI('Error loading locale.');
      switchTab('locale');
    }
  }

  // Locale detail UI
  const elLocaleHeader = document.getElementById('locale-header');
  const elLocaleOverview = document.getElementById('locale-overview');
  const elLocaleBuildings = document.getElementById('locale-buildings');
  const elLocaleCharacters = document.getElementById('locale-characters');
  const elLocaleErr = document.getElementById('locale-error');

  function renderLocale(locale, x, y) {
    elLocaleErr.textContent = '';
    if (!locale) {
      elLocaleSummary.innerHTML = `<div>No locale at (${x}, ${y}).</div>`;
      elLocaleJson.textContent = '';
      return;
    }
    const header = `
      <div><strong>${escapeHtml(locale.name)}</strong> â€¢ ${escapeHtml(locale.type || '')}</div>
      <div>Coordinates: (${locale.coordinates?.x ?? x}, ${locale.coordinates?.y ?? y})</div>
    `;
    const refs = [];
    if (locale.primary_race) refs.push(`Primary race: ${escapeHtml(locale.primary_race.name || '')}`);
    if (Array.isArray(locale.factions) && locale.factions.length)
      refs.push(`Factions: ${locale.factions.map(f => escapeHtml(f._id?.name || '')).join(', ')}`);
    if (Array.isArray(locale.characters) && locale.characters.length)
      refs.push(`Characters: ${locale.characters.map(c => escapeHtml(c._id?.name || '')).join(', ')}`);
    if (Array.isArray(locale.buildings) && locale.buildings.length)
      refs.push(`Buildings: ${locale.buildings.map(b => escapeHtml(b.name || '')).join(', ')}`);

    elLocaleSummary.innerHTML = header + (refs.length ? `<div class="world-meta">${refs.join(' â€¢ ')}</div>` : '');
    elLocaleJson.textContent = JSON.stringify(locale, null, 2);
  }

  function renderLocaleError(msg) {
    elLocaleErr.textContent = msg || 'Error.';
    elLocaleSummary.innerHTML = '';
    elLocaleJson.textContent = '';
  }

  // New locale rendering UI
  function renderLocaleUI(locale, x, y) {
    elLocaleErr.textContent = '';
    if (!locale) {
      elLocaleHeader.innerHTML = `<div class="locale-title">No locale at (${x}, ${y})</div>`;
      elLocaleOverview.innerHTML = '';
      elLocaleBuildings.innerHTML = '';
      elLocaleCharacters.innerHTML = '';
      return;
    }
    const cx = (locale.coordinates && typeof locale.coordinates.x !== 'undefined') ? locale.coordinates.x : x;
    const cy = (locale.coordinates && typeof locale.coordinates.y !== 'undefined') ? locale.coordinates.y : y;
    elLocaleHeader.innerHTML = `
      <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
        <div class="locale-title">${escapeHtml(locale.name)} <span class="locale-sub">(${escapeHtml(locale.type || '')})</span></div>
        <div class="locale-sub">Coordinates: (${cx}, ${cy})</div>
      </div>
      <div class="actions">
        <button id="btn-delete-locale" class="btn-delete" title="Delete this locale">Delete Locale</button>
      </div>
    `;

    const btnDeleteLocale = document.getElementById('btn-delete-locale');
    if (btnDeleteLocale) {
      btnDeleteLocale.onclick = async () => {
        try {
          const lid = String(locale.id || locale._id || '');
          const wid = String(state.currentWorld?._id || '');
          if (!lid || !wid) return;
          const ok = confirm(`Delete locale "${locale.name}"? This removes all nested buildings, rooms, containers, items, and characters.`);
          if (!ok) return;
          btnDeleteLocale.disabled = true; const prev = btnDeleteLocale.textContent; btnDeleteLocale.textContent = 'Deleting...';
          const res = await fetch(`/locale/${encodeURIComponent(lid)}?world_id=${encodeURIComponent(wid)}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete locale');
          // Clear cache and reload locales
          try { if (window.Game && typeof window.Game.clearLocales === 'function') window.Game.clearLocales(); } catch {}
          state.currentLocale = null;
          await loadLocales();
          renderGenerateLocaleUI(cx, cy);
          showToast('Locale deleted');
        } catch (e) {
          console.error(e);
          elLocaleErr.textContent = 'Error deleting locale.';
        } finally {
          btnDeleteLocale.disabled = false; btnDeleteLocale.textContent = 'Delete Locale';
        }
      };
    }

    const primaryRaceName = (locale.primary_race && typeof locale.primary_race === 'object') ? (locale.primary_race.name || '') : '';
    // Resolve biome display name
    let biomeName = '';
    try {
      const b = locale.biome;
      if (b && typeof b === 'object') {
        biomeName = b.name || String(b._id || b.id || '');
      } else if (b) {
        const bid = String(b);
        const gb = (window.Game && typeof window.Game.getBiome === 'function') ? window.Game.getBiome(bid) : null;
        biomeName = gb && gb.name ? gb.name : bid;
      }
    } catch {}
    const factionNames = Array.isArray(locale.factions) ? locale.factions.map(f => (f && f._id && f._id.name) ? f._id.name : '').filter(Boolean) : [];
    const features = Array.isArray(locale.special_features) ? locale.special_features.slice() : [];
    const resources = locale.resources || {};
    // Local state overlay: track visited and reflect overlay
    markLocaleVisited(state.currentWorld?._id, cx, cy);
    const overlay = getLocaleOverlay(state.currentWorld?._id, cx, cy);
    if (overlay && overlay.visited) features.unshift('Visited');

    elLocaleOverview.innerHTML = `
      <div class="kv">
        <div class="key">Biome</div><div>${escapeHtml(biomeName || 'Unknown')}</div>
        <div class="key">Primary race</div><div>${escapeHtml(primaryRaceName || 'Unknown')}</div>
        <div class="key">Population</div><div>${Number(locale.population || 0).toLocaleString()}</div>
        <div class="key">Wealth</div><div>${escapeHtml(resources.wealth || 'unknown')}</div>
        <div class="key">Military</div><div>${escapeHtml(resources.military_presence || 'unknown')}</div>
        <div class="key">Political</div><div>${escapeHtml(resources.political_importance || 'unknown')}</div>
      </div>
      <div class="section-title" style="margin-top:10px;">Factions</div>
      <div class="tags">${factionNames.map(n => `<span class="tag">${escapeHtml(n)}</span>`).join('') || '<span class="muted">None</span>'}</div>
      <div class="section-title" style="margin-top:10px;">Special features</div>
      <div class="tags">${features.map(n => `<span class="tag">${escapeHtml(n)}</span>`).join('') || '<span class="muted">None</span>'}</div>
    `;

    const buildings = Array.isArray(locale.buildings) ? locale.buildings : [];
    const chars = Array.isArray(locale.characters) ? locale.characters : [];
    elLocaleBuildings.innerHTML = '';
    buildings.forEach(b => {
      const buildingId = b && b._id ? String(b._id) : '';
      const bChars = chars
        .map(c => {
          const id = c && (c._id || c.id) ? String(c._id || c.id) : '';
          const doc = (id && window.Game && typeof window.Game.getCharacterLocal === 'function')
            ? window.Game.getCharacterLocal(id)
            : null;
          return { doc, ref: c };
        })
        .filter(obj => obj.ref && obj.ref.building && obj.ref.building._id && String(obj.ref.building._id) === buildingId && obj.doc);

      const totalContainers = (b.rooms || []).reduce((sum, r) => sum + ((r.containers || []).length), 0);
      const roomsSummary = `${(b.rooms || []).length} rooms`;
      const containersSummary = `${totalContainers} containers`;
      const charsSummary = `${bChars.length} characters`;

      const details = document.createElement('details');
      details.className = 'acc';
      details.innerHTML = `
        <summary>
          <div class="acc-title">${escapeHtml(b.name)} ${b.type ? '(' + escapeHtml(b.type) + ')' : ''}</div>
          <div class="acc-sub">${roomsSummary}, ${containersSummary}, ${charsSummary}</div>
        </summary>
        <div class="acc-content">
          <div class="acc-section">
            <div class="section-title">Description</div>
            <div class="muted">${escapeHtml(b.description || 'No description')}</div>
          </div>
          <div class="acc-section">
            <div class="section-title">Rooms</div>
            ${renderRoomsHTML(b.rooms || [])}
          </div>
        </div>
      `;
      // Map characters by room id and populate inside each room card
      const charsByRoom = new Map();
      bChars.forEach(({ doc }) => {
        const rid = doc && doc.location && doc.location.room ? String(doc.location.room) : '';
        if (!rid) return;
        if (!charsByRoom.has(rid)) charsByRoom.set(rid, []);
        charsByRoom.get(rid).push(doc);
      });

      const roomLists = details.querySelectorAll('.room-characters');
      roomLists.forEach((container) => {
        const rid = container.getAttribute('data-room');
        const rchars = charsByRoom.get(String(rid)) || [];
        if (!rchars.length) {
          container.innerHTML = '<span class="muted">None</span>';
          return;
        }
        container.innerHTML = '';
        rchars.forEach((cdoc) => {
          const card = htmlToElement(characterCardHTML(cdoc));
          card.addEventListener('click', () => onCharacterClick(cdoc));
          container.appendChild(card);
        });
      });
      elLocaleBuildings.appendChild(details);
    });

    elLocaleCharacters.innerHTML = '';
    const uniqueChars = chars
      .map(c => {
        const id = c && (c._id || c.id) ? String(c._id || c.id) : '';
        return (id && window.Game && typeof window.Game.getCharacterLocal === 'function')
          ? window.Game.getCharacterLocal(id)
          : null;
      })
      .filter(Boolean);
    if (!uniqueChars.length) {
      elLocaleCharacters.innerHTML = '<span class="muted">None</span>';
    } else {
      uniqueChars.forEach(cdoc => {
        const card = htmlToElement(characterCardHTML(cdoc));
        card.addEventListener('click', () => onCharacterClick(cdoc));
        elLocaleCharacters.appendChild(card);
      });
    }
  }

  function renderLocaleErrorUI(msg) {
    elLocaleErr.textContent = msg || 'Error.';
    elLocaleHeader.innerHTML = '';
    elLocaleOverview.innerHTML = '';
    elLocaleBuildings.innerHTML = '';
    elLocaleCharacters.innerHTML = '';
  }

  // Locale generation UI for empty coordinates
  const LOCALE_TYPES = [
    'Camp',
    'Hamlet',
    'Village',
    'Town',
    'Wilderness',
    'Cave',
    'Dungeon',
  ];

  // Quest types for character actions (mirror server/routes/quest.js)
  const QUEST_TYPES = [
    'Fetch',
    'Deliver',
    'Kill',
    'Gather',
    'Explore',
    'Clear',
  ];

  function renderGenerateLocaleUI(x, y) {
    elLocaleErr.textContent = '';
    elLocaleHeader.innerHTML = `<div class="locale-title">No locale at (${x}, ${y})</div>`;
    elLocaleBuildings.innerHTML = '';
    elLocaleCharacters.innerHTML = '';

    const options = LOCALE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    elLocaleOverview.innerHTML = `
      <div class="kv">
        <div class="key">Coordinates</div><div>(${x}, ${y})</div>
        <div class="key">World</div><div>${escapeHtml(state.currentWorld?.name || '')}</div>
        <div class="key">Locale type</div>
        <div>
          <select id="locale-type-select">${options}</select>
          <button id="btn-generate-locale" style="margin-left:8px;">Generate</button>
        </div>
      </div>
      <div class="muted" style="margin-top:8px;">Choose a type and generate a new locale at these coordinates.</div>
    `;

    const btn = document.getElementById('btn-generate-locale');
    const sel = document.getElementById('locale-type-select');
    if (btn && sel) {
      btn.onclick = async () => {
        const type = sel.value;
        btn.disabled = true; btn.textContent = 'Generating...';
        try {
          const res = await fetch('/locale/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ world_id: state.currentWorld._id, x, y, locale_type: type })
          });
          if (!res.ok) throw new Error('Generation failed');
          // Refresh locales and open the newly generated one
          try { if (window.Game && typeof window.Game.clearLocales === 'function') window.Game.clearLocales(); } catch {}
          await loadLocales();
          await onCellClick(x, y, true);
        } catch (e) {
          console.error(e);
          elLocaleErr.textContent = 'Error generating locale.';
        } finally {
          btn.disabled = false; btn.textContent = 'Generate';
        }
      };
    }
  }

  // Character view
  const elCharacterHeader = document.getElementById('character-header');
  const elCharacterBody = document.getElementById('character-body');
  const elCharacterErr = document.getElementById('character-error');
  const elDialogueLog = document.getElementById('dialogue-log');
  const elDialogueText = document.getElementById('dialogue-text');
  const elSystemPrompt = document.getElementById('system-prompt');
  const elCommandsHistory = document.getElementById('commands-history');
  const btnMic = document.getElementById('btn-mic');
  const btnSend = document.getElementById('btn-send');

  // Conversation storage helpers (persist per-character)
  function charKey(c) { return c && c._id ? `conv_${c._id}` : null; }
  function loadConv(c) {
    const key = charKey(c); if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }
  function saveConv(c, conv) {
    const key = charKey(c); if (!key) return;
    localStorage.setItem(key, JSON.stringify(conv.slice(-50)));
  }
  function renderConv(conv) {
    if (!elDialogueLog) return;
    elDialogueLog.innerHTML = conv.map(m => `<div class="bubble ${m.role}">${escapeHtml(m.content)}<small>${new Date(m.ts||Date.now()).toLocaleTimeString()}</small></div>`).join('');
    elDialogueLog.scrollTop = elDialogueLog.scrollHeight;
  }

  // Commands history helpers (persist per-character)
  function cmdsKey(c) { return c && c._id ? `cmds_${c._id}` : null; }
  function loadCmds(c) {
    const key = cmdsKey(c); if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }
  function saveCmds(c, list) {
    const key = cmdsKey(c); if (!key) return;
    localStorage.setItem(key, JSON.stringify((Array.isArray(list)? list: []).slice(-200)));
  }
  function renderCmds(list) {
    if (!elCommandsHistory) return;
    try {
      elCommandsHistory.value = (Array.isArray(list) ? list : []).map(cmd => {
        try { return JSON.stringify(cmd); } catch { return String(cmd); }
      }).join('\n');
    } catch {}
  }

  // Load the currently selected character from the server with full population
  async function loadSelectedCharacterFull() {
    try {
      if (!state.currentWorld || !state.selectedCharacter) return;
      const cid = state.selectedCharacter && state.selectedCharacter._id
        ? String(state.selectedCharacter._id)
        : String(state.selectedCharacter);
      if (!cid) return;
      if (elCharacterBody) {
        // Non-blocking loading hint
        elCharacterBody.innerHTML = '<div class="muted">Loading characterâ€¦</div>';
      }
      const params = new URLSearchParams({
        world_id: state.currentWorld && state.currentWorld._id ? String(state.currentWorld._id) : '',
        character_id: cid,
      });
      const res = await fetch(`/character/full?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load character');
      const data = await res.json();
      const full = data && data.character ? data.character : null;
      if (full && full._id) {
        state.selectedCharacter = full;
        renderCharacter(full);
      }
    } catch (err) {
      console.error(err);
      if (elCharacterErr) elCharacterErr.textContent = 'Error loading character.';
    }
  }

  // Speech synthesis helper
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0; u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  }

  // Dialogue handlers (ASR + send)
  let recognition = null; let recognizing = false;
  function getAPIKey() {
    return localStorage.getItem('openai_api_key') || '';
  }
  function setAPIKey(v) {
    localStorage.setItem('openai_api_key', v || '');
  }
  if (document.getElementById('api-key')) {
    const keyInput = document.getElementById('api-key');
    keyInput.value = getAPIKey();
    keyInput.addEventListener('change', () => setAPIKey(keyInput.value.trim()));
  }

  async function callOpenAICharacter(character, history, user) {
    const apiKey = getAPIKey();
    if (!apiKey) throw new Error('Missing OpenAI API key.');
    const messages = (window.buildCharacterMessages
      ? window.buildCharacterMessages(character, history, {
          knownCharacters: (state.currentLocale?.characters || []),
          knownLocale: state.currentLocale || null,
          worldId: state.currentWorld?._id,
          characterId: character && character._id ? String(character._id) : '',
        })
      : [{ role: 'system', content: 'Missing prompt helper. Proceeding minimal.' }]
    );

    // Expose system message in dedicated box
    if (elSystemPrompt) {
      const sys = messages.find(m => m.role === 'system');
      elSystemPrompt.value = sys?.content || '';
    }
    messages.push({ role: 'user', content: String(user) });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.8 }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    // Robust JSON parse: support plain JSON, fenced code, or stray text
    function tryParseJSON(s) {
      if (!s) return null;
      let t = String(s).trim();
      // Strip common code fences
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
      try { return JSON.parse(t); } catch {}
      // Fallback: attempt to extract first JSON object
      const first = t.indexOf('{'); const last = t.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        const sub = t.slice(first, last + 1);
        try { return JSON.parse(sub); } catch {}
      }
      return null;
    }
    const parsed = tryParseJSON(raw);
    if (parsed && typeof parsed === 'object') {
      const text = typeof parsed.text === 'string' ? parsed.text : String(raw).trim();
      const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
      return { text, commands };
    }
    // Fallback: treat everything as plain text
    return { text: String(raw).trim(), commands: [] };
  }

  function setupDialogueHandlers(c) {
    if (!btnMic || !btnSend || !elDialogueText) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR && !recognition) {
      recognition = new SR();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (e) => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += tr; else elDialogueText.value = tr;
        }
        if (final) elDialogueText.value = final;
      };
      recognition.onend = () => { recognizing = false; btnMic.classList.remove('recording'); };
      recognition.onerror = () => { recognizing = false; btnMic.classList.remove('recording'); };
    }

    btnMic.onclick = () => {
      if (!recognition) { alert('Speech recognition not supported in this browser.'); return; }
      if (recognizing) { recognition.stop(); recognizing = false; btnMic.classList.remove('recording'); return; }
      elDialogueText.value = '';
      recognition.start(); recognizing = true; btnMic.classList.add('recording');
    };

    btnSend.onclick = async () => {
      const text = (elDialogueText.value || '').trim();
      if (!text) return;
      const conv = loadConv(c);
      conv.push({ role: 'user', content: text, ts: Date.now() });
      renderConv(conv); saveConv(c, conv); elDialogueText.value = '';
      try {
        const result = await callOpenAICharacter(c, conv, text);
        const replyText = result?.text || '';
        const commands = Array.isArray(result?.commands) ? result.commands : [];
        // Push only text to conversation history
        conv.push({ role: 'assistant', content: replyText, ts: Date.now() });
        renderConv(conv); saveConv(c, conv);
        // Update commands history box
        const existing = loadCmds(c);
        const updated = existing.concat(commands);
        saveCmds(c, updated);
        renderCmds(updated);
        // Execute commands via framework (no-op handlers for now)
        try { window.CommandFramework && window.CommandFramework.execute(commands, { world: state.currentWorld, character: c, locale: state.currentLocale, playerCharacter: state.selectedPlayerCharacter }); } catch {}
        speak(replyText);
      } catch (e) {
        console.error(e);
        conv.push({ role: 'assistant', content: '(No response due to an error.)', ts: Date.now() });
        renderConv(conv); saveConv(c, conv);
      }
    };
  }

  function onCharacterClick(cdoc) {
    state.selectedCharacter = cdoc;
    if (characterTabButton) characterTabButton.removeAttribute('disabled');
    renderCharacter(cdoc);
    switchTab('character');
  }

  function renderCharacter(c) {
    if (!c) {
      elCharacterHeader.innerHTML = '';
      elCharacterBody.innerHTML = '';
      elCharacterErr.textContent = 'No character selected.';
      return;
    }
    elCharacterErr.textContent = '';
    const titleLine = `${escapeHtml(c.name || 'Unknown')}${c.title ? ' - ' + escapeHtml(c.title) : ''}`;
    const pills = [];
    if (c.role) pills.push(`<span class="pill">Role: ${escapeHtml(c.role)}</span>`);
    if (c.status) pills.push(`<span class="pill">Status: ${escapeHtml(c.status)}</span>`);
    if (c.gender) pills.push(`<span class="pill">Gender: ${escapeHtml(c.gender)}</span>`);
    if (c.age != null) pills.push(`<span class="pill">Age: ${String(c.age)}</span>`);
    if (c.race) pills.push(`<span class="pill">Race: ${escapeHtml(c.race)}</span>`);

    const actionsHtml = c.status === 'dead'
      ? '<span class="muted">This character is dead.</span>'
      : '<button id="btn-kill-character" class="btn-delete" title="Mark as dead">Kill</button>';
    elCharacterHeader.innerHTML = `
      <div class="character-title">${titleLine}</div>
      <div>${pills.join(' ')}</div>
      <div class="actions">${actionsHtml}</div>
    `;

    const questOptions = QUEST_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    elCharacterBody.innerHTML = `\n      
      <div class="card">
        <h4>Description</h4>
        <div class="muted">${escapeHtml(c.description || 'No description')}</div>
      </div>
      <div class="card">
        <h4>Personality</h4>
        <div class="muted">${escapeHtml(c.personality || 'No personality data')}</div>
      </div>
      <div class="card">
        <h4>Quests</h4>
        <div class="kv">
          <div class="key">Quest Type</div>
          <div>
            <select id="quest-type-select">${questOptions}</select>
            <button id="btn-add-quest" style="margin-left:8px;">Add Quest</button>
          </div>
        </div>
        <div id="quest-status" class="muted" style="margin-top:6px;"></div>
      </div>
    `;
    const conv = loadConv(c);
    renderConv(conv);
    // Load command history for this character
    const cmds = loadCmds(c);
    renderCmds(cmds);
    // Optionally show current system prompt immediately for transparency
    try {
      if (elSystemPrompt && window.buildCharacterMessages) {
        const msgs = window.buildCharacterMessages(c, conv, {
          knownCharacters: (state.currentLocale?.characters || []),
          knownLocale: state.currentLocale || null,
          worldId: state.currentWorld?._id,
          characterId: c && c._id ? String(c._id) : '',
        });
        const sys = msgs.find(m => m.role === 'system');
        elSystemPrompt.value = sys?.content || '';
      }
    } catch {}
    setupDialogueHandlers(c);

    // Wire quest add action
    const btnAddQuest = document.getElementById('btn-add-quest');
    const selQuestType = document.getElementById('quest-type-select');
    const elQuestStatus = document.getElementById('quest-status');
    if (btnAddQuest && selQuestType) {
      btnAddQuest.onclick = async () => {
        elCharacterErr.textContent = '';
        elQuestStatus.textContent = '';
        btnAddQuest.disabled = true; btnAddQuest.textContent = 'Adding...';
        try {
          const res = await fetch('/quest/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              world_id: state.currentWorld?._id,
              character_id: String(c._id),
              type: selQuestType.value,
            }),
          });
          if (false) {
            const t = await res.text();
            throw new Error(t || 'Failed to add quest');
          }
          const data = await res.json();
          const label = data?.quest?.title || data?.type || selQuestType.value;
          elQuestStatus.textContent = `Quest added: ${label}`;
        } catch (e) {
          console.error(e);
          elCharacterErr.textContent = 'Error adding quest.';
        } finally {
          btnAddQuest.disabled = false; btnAddQuest.textContent = 'Add Quest';
        }
      };
    }

    // Wire up Kill button if character is not already dead
    const btnKill = document.getElementById('btn-kill-character');
    if (btnKill) {
      btnKill.onclick = async () => {
        const ok = confirm(`Kill ${c.name || 'this character'}? This sets status to 'dead'.`);
        if (!ok) return;
        btnKill.disabled = true; btnKill.textContent = 'Killingâ€¦';
        try {
          /* removed server call */ if (false) { const res = await fetch('/character/kill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              world_id: state.currentWorld && state.currentWorld._id ? String(state.currentWorld._id) : '',
              character_id: String(c._id),
            }),
          }); }
          if (!res.ok) {
            const t = await res.text();
            throw new Error(t || 'Failed to kill character');
          }
          const data = await res.json();
          const updated = data?.character || null;
          if (updated) {
            state.selectedCharacter = updated;
            renderCharacter(updated);
          } else {
            // fallback: refresh from server
            await loadSelectedCharacterFull();
          }
        } catch (e) {
          console.error(e);
          elCharacterErr.textContent = 'Error setting character status to dead.';
        } finally {
          // No need to re-enable, renderCharacter will rebuild UI
        }
      };
    }
  }

  // Render helpers
  function renderRoomsHTML(rooms) {
    if (!rooms || !rooms.length) return '<span class="muted">None</span>';
    return rooms.map(r => `
      <div class="card" style="margin-bottom:8px;">
        <div class="section-title">${escapeHtml(r.name || 'Room')}</div>
        <div class="muted" style="margin-bottom:6px;">${escapeHtml(r.description || '')}</div>
        ${renderContainersHTML(r.containers || [])}
        <div class="acc-section" style="margin-top:8px;">
          <div class="section-title">Characters</div>
          <div class="character-list room-characters" data-room="${r._id}"></div>
        </div>
      </div>
    `).join('');
  }

  function renderContainersHTML(containers) {
    if (!containers || !containers.length) return '';
    return `
      <table class="table">
        <thead><tr><th>Container</th><th>Type</th><th>Items</th></tr></thead>
        <tbody>
          ${containers.map(c => `
            <tr>
              <td>${escapeHtml(c.name || '')}</td>
              <td>${escapeHtml(c.type || '')}</td>
              <td>${Array.isArray(c.items) && c.items.length ? c.items.map(i => escapeHtml(i.name || 'Item')).join(', ') : '<span class="muted">None</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function characterCardHTML(c) {
    const role = c.role ? ', ' + escapeHtml(c.role) : '';
    return `
      <div class="character-card">
        <div class="character-name">${escapeHtml(c.name || 'Unknown')}</div>
        <div class="character-sub">${escapeHtml(c.race || '')}${role}</div>
      </div>
    `;
  }

  function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  // Local game-state overlay (per world)
  function worldStateKey(worldId) { return worldId ? `world_state_${worldId}` : null; }
  function getWorldState(worldId) {
    const key = worldStateKey(worldId); if (!key) return {};
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }
  function setWorldState(worldId, obj) {
    const key = worldStateKey(worldId); if (!key) return;
    localStorage.setItem(key, JSON.stringify(obj || {}));
  }
  function getLocaleOverlay(worldId, x, y) {
    const st = getWorldState(worldId);
    const locKey = `${x},${y}`;
    return (st.locales && st.locales[locKey]) || null;
  }
  function markLocaleVisited(worldId, x, y) {
    const st = getWorldState(worldId);
    const locKey = `${x},${y}`;
    st.locales = st.locales || {};
    st.locales[locKey] = Object.assign({ visited: true, lastViewed: Date.now() }, st.locales[locKey]);
    setWorldState(worldId, st);
  }
  function getCharacterState(worldId, charId) {
    const st = getWorldState(worldId);
    st.characters = st.characters || {};
    return st.characters[charId] || null;
  }
  function setCharacterState(worldId, charId, patch) {
    const st = getWorldState(worldId);
    st.characters = st.characters || {};
    st.characters[charId] = Object.assign({}, st.characters[charId] || {}, patch || {});
    setWorldState(worldId, st);
  }

  // Utils
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Init
  updateNavLocks();
  loadWorlds();
  loadPlayerCharacters();
  // Quest SSE removed; no initial stream connection
})();


