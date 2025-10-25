// Simple Game container to hold session-scoped state like the Player.
// Provides a singleton at window.Game and the class at window.Models.Game.
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};

  class Game {
    constructor() {
      this.player = null;
      this.locales = []; // array of Locale instances
      this.localesById = {}; // id -> Locale
      // Biomes cache (global)
      this.biomes = [];
      this.biomesById = {};
      // Terrains cache (global)
      this.terrains = [];
      this.terrainsById = {};
      // Characters cache (raw docs as returned by API)
      this.characters = [];
      this.charactersById = {}; // id -> Character instance
      // Simple event bus
      this._events = new Map();
    }
    setPlayer(player) { this.player = player; return this.player; }
    clear() { this.player = null; this.clearLocales(); this.clearCharacters(); }

    clearLocales() { this.locales = []; this.localesById = {}; }
    clearBiomes() { this.biomes = []; this.biomesById = {}; }
    clearTerrains() { this.terrains = []; this.terrainsById = {}; }
    setLocalesFromArray(arr) {
      const Locale = (window.Models && window.Models.Locale) ? window.Models.Locale : null;
      this.clearLocales();
      (Array.isArray(arr) ? arr : []).forEach((raw) => {
        const loc = Locale ? Locale.from(raw) : raw;
        const id = loc && (loc.id || String(raw?._id || ''));
        if (id) {
          this.localesById[String(id)] = loc;
          this.locales.push(loc);
        }
      });
      return this.locales;
    }
    setBiomesFromArray(arr) {
      const Biome = (window.Models && window.Models.Biome) ? window.Models.Biome : null;
      this.clearBiomes();
      (Array.isArray(arr) ? arr : []).forEach((raw) => {
        const b = Biome ? Biome.from(raw) : raw;
        const id = b && (b.id || String(raw?._id || ''));
        if (id) {
          this.biomesById[String(id)] = b;
          this.biomes.push(b);
        }
      });
      return this.biomes;
    }
    setTerrainsFromArray(arr) {
      this.clearTerrains();
      (Array.isArray(arr) ? arr : []).forEach((raw) => {
        if (!raw) return;
        const id = raw.id || raw._id;
        if (!id) return;
        const key = String(id);
        this.terrainsById[key] = raw;
        this.terrains.push(raw);
      });
      return this.terrains;
    }
    getLocale(id) { return this.localesById ? this.localesById[String(id)] : undefined; }
    getAllLocales() { return Array.isArray(this.locales) ? this.locales.slice() : []; }
    getBiome(id) { return this.biomesById ? this.biomesById[String(id)] : undefined; }
    getAllBiomes() { return Array.isArray(this.biomes) ? this.biomes.slice() : []; }
    getTerrain(id) { return this.terrainsById ? this.terrainsById[String(id)] : undefined; }
    getAllTerrains() { return Array.isArray(this.terrains) ? this.terrains.slice() : []; }

    // --- Characters (lazy, on-demand fetch + cache) ---
    clearCharacters() { this.characters = []; this.charactersById = {}; }
    setCharactersFromArray(arr) {
      this.clearCharacters();
      (Array.isArray(arr) ? arr : []).forEach((raw) => {
        const id = raw && (String(raw._id || raw.id || ''));
        if (id) {
          this.charactersById[id] = raw;
          this.characters.push(raw);
        }
      });
      return this.characters;
    }
    rememberCharacter(raw) {
      if (!raw) return null;
      const id = String(raw._id || raw.id || '');
      if (!id) return raw;
      const Character = (window.Models && window.Models.Character) ? window.Models.Character : null;
      const existing = this.charactersById[id];
      if (existing) {
        // merge known fields
        Object.assign(existing, raw || {});
        return existing;
      }
      const inst = Character ? Character.from(raw) : raw;
      this.charactersById[id] = inst;
      this.characters.push(inst);
      return inst;
    }
    getCharacterLocal(id) { return this.charactersById ? this.charactersById[String(id)] : undefined; }
    getAllCharacters() { return Array.isArray(this.characters) ? this.characters.slice() : []; }

    /**
     * Get a character by id. Returns cached copy if present; otherwise
     * fetches from the server and caches the result.
     * opts: { worldId?: string, full?: boolean }
     */
    async getCharacter(id, opts = {}) {
      const key = String(id || '');
      if (!key) return undefined;
      const local = this.getCharacterLocal(key);
      if (local) return local;

      const worldId = String(opts.worldId || (this.player && this.player.worldId) || '');
      if (!worldId || typeof fetch !== 'function') return undefined;

      try {
        const params = new URLSearchParams({ world_id: worldId, character_id: key });
        const path = opts.full ? '/character/full' : '/character';
        const res = await fetch(`${path}?${params.toString()}`);
        if (!res.ok) return undefined;
        const data = await res.json();
        const raw = data && data.character ? data.character : null;
        if (raw && (raw._id || raw.id)) return this.rememberCharacter(raw);
      } catch (_) { /* ignore network errors */ }
      return undefined;
    }

    // --- Simple event bus ---
    on(evt, fn) {
      if (!evt || typeof fn !== 'function') return;
      const key = String(evt);
      const list = this._events.get(key) || [];
      list.push(fn);
      this._events.set(key, list);
    }
    off(evt, fn) {
      const key = String(evt || '');
      if (!key || !this._events.has(key)) return;
      if (!fn) { this._events.delete(key); return; }
      const list = (this._events.get(key) || []).filter(f => f !== fn);
      this._events.set(key, list);
    }
    emit(evt, payload) {
      const list = this._events.get(String(evt)) || [];
      for (const fn of list) { try { fn(payload); } catch {} }
    }
  }

  root.Models.Game = Game;
  // Create/replace singleton instance
  root.Game = new Game();
})();
