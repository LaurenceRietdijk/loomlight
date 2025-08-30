// Exposes prompt-building helpers on window for the app to use
(function () {
  function deepClone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function stripIds(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripIds);
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === '_id' || /Id$/.test(k) || k === 'id') continue;
      out[k] = stripIds(obj[k]);
    }
    return out;
  }

  function buildKnownCharMap(knownCharacters) {
    const map = new Map();
    if (Array.isArray(knownCharacters)) {
      for (const c of knownCharacters) {
        const doc = c && c._id ? c._id : c; // locale.characters stores { _id: doc }
        if (!doc) continue;
        const key = String(doc._id || doc.id || '');
        if (key) map.set(key, String(doc.name || ''));
      }
    }
    return map;
  }

  function sanitizeCharacterForPrompt(character, options) {
    const knownMap = buildKnownCharMap(options && options.knownCharacters);
    const knownLocale = options && options.knownLocale;
    const c = deepClone(character);

    // Replace relationship character_id with character_name
    if (Array.isArray(c.relationships)) {
      c.relationships = c.relationships.map((rel) => {
        const r = Object.assign({}, rel);
        const id = r.character_id ? String(r.character_id) : '';
        if (id && knownMap.has(id)) {
          r.character_name = knownMap.get(id);
        } else if (typeof r.character_id === 'object' && r.character_id !== null) {
          // If already populated
          r.character_name = String(r.character_id.name || 'unknown');
        } else {
          r.character_name = 'unknown';
        }
        delete r.character_id;
        return r;
      });
    }

    // Replace location ids with embedded name/description docs
    try {
      const loc = c.location || {};
      const localeId = loc && loc.locale ? String(loc.locale) : '';
      const buildingId = loc && loc.building ? String(loc.building) : '';
      const roomId = loc && loc.room ? String(loc.room) : '';

      // Resolve locale
      let localeDoc = null;
      if (knownLocale && String(knownLocale._id || '') && localeId && String(knownLocale._id) === localeId) {
        localeDoc = knownLocale;
      }
      if (localeId) {
        c.location = c.location || {};
        if (localeDoc) {
          c.location.locale = { name: String(localeDoc.name || 'Unknown'), description: String(localeDoc.description || '') };
        } else {
          c.location.locale = { name: 'Unknown', description: '' };
        }
      }

      // Resolve building within known locale
      let buildingDoc = null;
      if (buildingId && knownLocale && Array.isArray(knownLocale.buildings)) {
        buildingDoc = knownLocale.buildings.find(b => String(b && b._id || '') === buildingId) || null;
      }
      if (buildingId) {
        c.location = c.location || {};
        if (buildingDoc) {
          c.location.building = { name: String(buildingDoc.name || 'Unknown'), description: String(buildingDoc.description || '') };
        } else {
          c.location.building = { name: 'Unknown', description: '' };
        }
      }

      // Resolve room within building
      let roomDoc = null;
      if (roomId && buildingDoc && Array.isArray(buildingDoc.rooms)) {
        roomDoc = buildingDoc.rooms.find(r => String(r && r._id || '') === roomId) || null;
      }
      if (roomId) {
        c.location = c.location || {};
        if (roomDoc) {
          c.location.room = { name: String(roomDoc.name || 'Unknown'), description: String(roomDoc.description || '') };
        } else {
          c.location.room = { name: 'Unknown', description: '' };
        }
      }
    } catch {}

    // Remove ids across doc
    return stripIds(c);
  }

  function buildCharacterMessages(character, history, options) {
    const clean = sanitizeCharacterForPrompt(character, options);
    const guidelines = [
      'You are roleplaying as the following character. Stay in character, respond concisely and naturally.',
      'Do not reveal that you are an AI.',
      'Keep responses grounded in the character\'s knowledge and context.',
      'If asked about world details, rely on what\'s in the document or reasonable in-universe assumptions.'
    ].join('\n');
    const system = `${guidelines}\n\nCHARACTER DOCUMENT (JSON):\n${JSON.stringify(clean, null, 2)}`;

    const msgs = [{ role: 'system', content: system }];
    if (Array.isArray(history)) {
      for (const m of history) {
        if (!m || !m.role || !m.content) continue;
        msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) });
      }
    }
    return msgs;
  }

  window.buildCharacterMessages = buildCharacterMessages;
})();
