// Player model: represents the selected active player character scoped to a world.
// Exposes window.Models.Player; does not rely on modules/bundlers.
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};
  const Quest = (root.Models && root.Models.Quest) ? root.Models.Quest : null;

  class Player {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.worldId = init.worldId || '';
      this.quests = Array.isArray(init.quests) ? init.quests : [];
    }

    static fromSelection(world, playerCharacter) {
      const worldId = world && world._id ? String(world._id) : '';
      const id = playerCharacter && playerCharacter._id ? String(playerCharacter._id) : '';
      const name = playerCharacter && playerCharacter.name ? String(playerCharacter.name) : '';
      return new Player({ id, name, worldId, quests: [] });
    }

    setQuestsFromArray(arr) {
      const list = Array.isArray(arr) ? arr : [];
      this.quests = list.map((q) => {
        if (!Quest) return q;
        // Pass worldId through so quests can initialize/hydrate if needed
        const inst = Quest.from(Object.assign({}, q, { __worldId: this.worldId }));
        if (inst && typeof inst.afterInstantiate === 'function') {
          try { inst.afterInstantiate(); } catch {}
        }
        return inst;
      });
      return this.quests;
    }
  }

  root.Models.Player = Player;
})();
