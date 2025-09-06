// Simple per-character chat context store
// Persists to localStorage and exposes helpers on window.ChatContext
(function () {
  const PREFIX = 'chatctx_v1_';

  function key(worldId, charId) {
    const w = worldId ? String(worldId) : '';
    const c = charId ? String(charId) : '';
    return w && c ? `${PREFIX}${w}_${c}` : null;
  }

  function get(worldId, charId) {
    const k = key(worldId, charId);
    if (!k) return {};
    try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
  }

  function set(worldId, charId, ctx) {
    const k = key(worldId, charId);
    if (!k) return;
    localStorage.setItem(k, JSON.stringify(ctx || {}));
  }

  function patch(worldId, charId, update) {
    const cur = get(worldId, charId);
    const next = Object.assign({}, cur, update || {});
    set(worldId, charId, next);
    return next;
  }

  // Quest context helpers
  function setQuest(worldId, charId, questDoc) {
    return patch(worldId, charId, { quest: questDoc || null, quest_set_at: Date.now() });
  }
  function clearQuest(worldId, charId) {
    const cur = get(worldId, charId);
    delete cur.quest; delete cur.quest_set_at;
    set(worldId, charId, cur);
    return cur;
  }

  window.ChatContext = {
    get,
    set,
    patch,
    setQuest,
    clearQuest,
  };
})();

