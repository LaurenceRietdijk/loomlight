(() => {
  const state = {
    worlds: [],
    currentWorld: null,
    locales: [],
    bounds: null,
    selectedCoords: null,
    selectedCharacter: null,
  };

  // Tab wiring
  const tabButtons = document.querySelectorAll('.tab-button');
  const panels = {
    worlds: document.getElementById('tab-worlds'),
    map: document.getElementById('tab-map'),
    locale: document.getElementById('tab-locale'),
    character: document.getElementById('tab-character'),
  };
  const characterTabButton = document.querySelector('.tab-button[data-tab="character"]');
  function switchTab(key) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === key));
    Object.entries(panels).forEach(([k, el]) => el.classList.toggle('active', k === key));
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
    switchTab('map');
    await loadLocales();
  }

  // Map rendering
  const elMapGrid = document.getElementById('map-grid');
  const elMapContainer = document.getElementById('map-container');
  const elMapErr = document.getElementById('map-error');

  async function loadLocales() {
    if (!state.currentWorld) return;
    elMapErr.textContent = '';
    elMapGrid.innerHTML = '';
    try {
      const params = new URLSearchParams({ world_id: state.currentWorld._id });
      const res = await fetch(`/locale/list?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load locales');
      const data = await res.json();
      state.locales = data.locales || [];
      renderMap();
    } catch (err) {
      console.error(err);
      elMapErr.textContent = 'Error loading locales.';
    }
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
      const params = new URLSearchParams({ world_id: state.currentWorld._id, x: String(x), y: String(y) });
      const res = await fetch(`/locale/full?${params.toString()}`);
      if (res.status === 404) {
        renderGenerateLocaleUI(x, y);
        switchTab('locale');
        return;
      }
      if (!res.ok) throw new Error('Failed to load locale');
      const data = await res.json();
      state.currentLocale = data.locale;
      renderLocaleUI(data.locale, x, y);
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
      <div><strong>${escapeHtml(locale.name)}</strong> • ${escapeHtml(locale.type || '')}</div>
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

    elLocaleSummary.innerHTML = header + (refs.length ? `<div class="world-meta">${refs.join(' • ')}</div>` : '');
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
      <div class="locale-title">${escapeHtml(locale.name)} <span class="locale-sub">(${escapeHtml(locale.type || '')})</span></div>
      <div class="locale-sub">Coordinates: (${cx}, ${cy})</div>
    `;

    const primaryRaceName = (locale.primary_race && typeof locale.primary_race === 'object') ? (locale.primary_race.name || '') : '';
    const factionNames = Array.isArray(locale.factions) ? locale.factions.map(f => (f && f._id && f._id.name) ? f._id.name : '').filter(Boolean) : [];
    const features = Array.isArray(locale.special_features) ? locale.special_features.slice() : [];
    const resources = locale.resources || {};
    // Local state overlay: track visited and reflect overlay
    markLocaleVisited(state.currentWorld?._id, cx, cy);
    const overlay = getLocaleOverlay(state.currentWorld?._id, cx, cy);
    if (overlay && overlay.visited) features.unshift('Visited');

    elLocaleOverview.innerHTML = `
      <div class="kv">
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
        .map(c => ({ doc: c && c._id ? c._id : null, ref: c }))
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
    const uniqueChars = chars.map(c => c && c._id ? c._id : null).filter(Boolean);
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
      ? window.buildCharacterMessages(character, history, { knownCharacters: (state.currentLocale?.characters || []), knownLocale: state.currentLocale || null })
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
    return data.choices?.[0]?.message?.content || '';
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
        const reply = await callOpenAICharacter(c, conv, text);
        conv.push({ role: 'assistant', content: reply, ts: Date.now() });
        renderConv(conv); saveConv(c, conv);
        speak(reply);
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

    elCharacterHeader.innerHTML = `
      <div class="character-title">${titleLine}</div>
      <div>${pills.join(' ')}</div>
    `;

    elCharacterBody.innerHTML = `\n      
      <div class="card">
        <h4>Description</h4>
        <div class="muted">${escapeHtml(c.description || 'No description')}</div>
      </div>
      <div class="card">
        <h4>Personality</h4>
        <div class="muted">${escapeHtml(c.personality || 'No personality data')}</div>
      </div>
    `;
    const conv = loadConv(c);
    renderConv(conv);
    // Optionally show current system prompt immediately for transparency
    try {
      if (elSystemPrompt && window.buildCharacterMessages) {
        const msgs = window.buildCharacterMessages(c, conv, { knownCharacters: (state.currentLocale?.characters || []), knownLocale: state.currentLocale || null });
        const sys = msgs.find(m => m.role === 'system');
        elSystemPrompt.value = sys?.content || '';
      }
    } catch {}
    setupDialogueHandlers(c);
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
  loadWorlds();
})();
