// Minimal client-side command framework for development
// Exposes a simple registry and executor on window.CommandFramework
(function () {
  const handlers = new Map();

  function register(action, fn) {
    if (!action || typeof fn !== 'function') return;
    handlers.set(String(action), fn);
  }

  function unregister(action) {
    if (!action) return; handlers.delete(String(action));
  }

  function list() {
    return Array.from(handlers.keys());
  }

  function execute(commands, context) {
    const cmds = Array.isArray(commands) ? commands : [];
    for (const cmd of cmds) {
      try {
        const action = cmd && cmd.action ? String(cmd.action) : '';
        const fn = action ? handlers.get(action) : null;
        if (fn) fn(cmd, context);
        else console.debug('[CommandFramework] no handler for action', action, cmd);
      } catch (e) {
        console.error('[CommandFramework] handler error', e);
      }
    }
  }

  // Example no-op default registration space
  register('QUEST_MENTIONED', async (cmd, ctx) => {
    try {
      console.log('[Command] QUEST_MENTIONED', cmd);
      const world_id = ctx && ctx.world && ctx.world._id ? String(ctx.world._id) : '';
      const character_id = ctx && ctx.character && ctx.character._id ? String(ctx.character._id) : '';
      const quest_id = cmd && (cmd.quest_id || cmd.id || cmd._id) ? String(cmd.quest_id || cmd.id || cmd._id) : '';
      if (!world_id || !character_id || !quest_id) return;
      // Fetch populated quest and store in chat context
      try {
        const params = new URLSearchParams({ world_id, quest_id });
        const res = await fetch(`/quest/full?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const q = data && data.quest ? data.quest : null;
          if (q && window.ChatContext && typeof window.ChatContext.setQuest === 'function') {
            window.ChatContext.setQuest(world_id, character_id, q);
          }
        }
      } catch (e) {
        console.warn('[Command] QUEST_MENTIONED fetch failed', e);
      }
    } catch {}
  });
  register('QUEST_ACCEPTED', async (cmd, ctx) => {
    try {
      console.log('[Command] QUEST_ACCEPTED', cmd);
      const world_id = ctx && ctx.world && ctx.world._id ? String(ctx.world._id) : '';
      const character_id = ctx && ctx.character && ctx.character._id ? String(ctx.character._id) : '';
      const player_character_id = ctx && ctx.playerCharacter && ctx.playerCharacter._id ? String(ctx.playerCharacter._id) : '';
      const quest_id = cmd && (cmd.quest_id || cmd.id || cmd._id) ? String(cmd.quest_id || cmd.id || cmd._id) : '';
      if (!world_id || !quest_id) return;
      await fetch('/quest/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world_id, quest_id, character_id, player_character_id })
      });
    } catch (e) {
      console.error('[Command] QUEST_ACCEPTED handler error', e);
    }
  });

  // Allow model/user to clear the quest discussion flag explicitly
  register('QUEST_UNFLAG', (cmd, ctx) => {
    try {
      const world_id = ctx && ctx.world && ctx.world._id ? String(ctx.world._id) : '';
      const character_id = ctx && ctx.character && ctx.character._id ? String(ctx.character._id) : '';
      if (world_id && character_id && window.ChatContext && typeof window.ChatContext.clearQuest === 'function') {
        window.ChatContext.clearQuest(world_id, character_id);
      }
    } catch (e) {
      console.error('[Command] QUEST_UNFLAG handler error', e);
    }
  });

  // Back-compat alias
  register('CLEAR_QUEST_CONTEXT', (cmd, ctx) => {
    const fn = handlers.get('QUEST_UNFLAG');
    if (fn) fn(cmd, ctx);
  });

  window.CommandFramework = { register, unregister, list, execute };
})();
