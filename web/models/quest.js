// Lightweight Quest model for the browser (no bundler).
// Exposes window.Models.Quest with helpers to deserialize API payloads.
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};

  // Base class
  class Quest {
    constructor(init = {}) {
      this.id = init.id || '';
      this.title = init.title || '';
      this.description = init.description || '';
      this.questType = init.questType || '';
      this.state = init.state || '';
      // Common optional fields
      this.enemiesRemaining = Number(init.enemiesRemaining || 0);
      this.targetLocale = init.targetLocale || null; // id or object
      this.count = Number(init.count || 0);
      this.quantity = Number(init.quantity || 0);
      this.resourceName = init.resourceName || '';
      this.targetFaction = init.targetFaction || null;
      this.targetCharacter = init.targetCharacter || null;
    }

    // Default text, may be overridden by subclasses
    async getProgress(worldId) {
      try { console.log('[Quest] getProgress (base)', { type: this.questType, id: this.id, worldId }); } catch {}
      // Generic fallback based on known fields
      const t = (this.questType || '').toLowerCase();
      if (t === 'kill') {
        const who = this.targetFaction ? 'enemies' : (this.targetCharacter ? 'target(s)' : 'enemies');
        return `Defeat ${Number(this.count || 1)} ${who}`;
      }
      if (t === 'fetch') {
        return `Collect ${Number(this.quantity || 1)} item(s)`;
      }
      if (t === 'deliver') {
        return `Deliver ${Number(this.quantity || 1)} item(s)`;
      }
      if (t === 'gather') {
        const resName = this.resourceName ? String(this.resourceName) : 'resources';
        return `Gather ${Number(this.quantity || 1)} ${resName}`;
      }
      if (t === 'explore') {
        return `Explore the target area`;
      }
      if (t === 'clear') {
        const n = Number(this.enemiesRemaining || 0);
        return `${n} enemies remaining`;
      }
      return '';
    }

    // Factory
    static from(data) {
      const questType = String((data?.questType || data?.type || '')).trim();
      const base = {
        id: String(data?._id || data?.id || ''),
        title: data?.title || '',
        description: data?.description || '',
        questType,
        state: data?.state || '',
        enemiesRemaining: Number(data?.enemiesRemaining || 0),
        targetLocale: data?.targetLocale || null,
        count: data?.count,
        quantity: data?.quantity,
        resourceName: data?.resourceName,
        targetFaction: data?.targetFaction || null,
        targetCharacter: data?.targetCharacter || null,
      };
      const low = questType.toLowerCase();
      switch (low) {
        case 'clear': return new ClearQuest(base);
        case 'kill': return new KillQuest(base);
        case 'fetch': return new FetchQuest(base);
        case 'deliver': return new DeliverQuest(base);
        case 'gather': return new GatherQuest(base);
        case 'explore': return new ExploreQuest(base);
        default: return new Quest(base);
      }
    }
  }

  class ClearQuest extends Quest {
    constructor(init = {}) {
      super(init);
      this.progressText = '';
      // Initial compute (non-blocking, no hydration)
      try { this.getProgress(init.__worldId || (root.Game && root.Game.player && root.Game.player.worldId) || '', { hydrateIfNeeded: false }); } catch {}
      // Subscribe to local character kill events when accepted
      const state = String(this.state || '').toLowerCase();
      if (state === 'acepted') this._attachDeathListener();
    }

    _attachDeathListener() {
      if (!(root.Game && typeof root.Game.on === 'function')) return;
      const handler = async (payload) => {
        try {
          const ch = payload && payload.character ? payload.character : null;
          if (!ch) return;
          const locId = this._targetLocaleId();
          if (!locId) return;
          const cid = ch && ch.location && ch.location.locale ? String(ch.location.locale._id || ch.location.locale) : '';
          if (cid && cid === String(locId)) {
            await this.getProgress((root.Game && root.Game.player && root.Game.player.worldId) || '', { hydrateIfNeeded: false });
          }
        } catch {}
      };
      this._deathHandler = handler;
      root.Game.on('character:killed', handler);
    }

    _targetLocaleId() {
      let locId = this.targetLocale;
      if (locId && typeof locId === 'object') return String(locId._id || locId.id || '');
      return String(locId || '');
    }

    async getProgress(worldId, opts = {}) {
      try { console.log('[Quest] getProgress (Clear)', { id: this.id, worldId, opts }); } catch {}
      try {
        const gid = (root.Game && typeof root.Game.getLocale === 'function') ? root.Game : null;
        let locId = this._targetLocaleId();
        let active = NaN;
        if (gid && locId) {
          // Prefer hydrated locale data
          let loc = root.Game.getLocale(locId);
          let isHydrated = !!(loc && typeof loc._loadedFull === 'boolean' && loc._loadedFull);
          if (!isHydrated && opts && opts.hydrateIfNeeded) {
            const Locale = root.Models && root.Models.Locale ? root.Models.Locale : null;
            const world = String(worldId || (root.Game && root.Game.player && root.Game.player.worldId) || '');
            try {
              if (loc && typeof loc.ensureLoaded === 'function') {
                await loc.ensureLoaded(world);
              } else if (Locale && this.targetLocale && typeof this.targetLocale === 'object') {
                const tmp = Locale.from(this.targetLocale);
                if (typeof tmp.ensureLoaded === 'function') await tmp.ensureLoaded(world);
                loc = tmp;
              }
            } catch (_) {}
            isHydrated = !!(loc && typeof loc._loadedFull === 'boolean' && loc._loadedFull);
          }
          if (isHydrated && loc && Array.isArray(loc.characters)) {
            active = loc.characters.reduce((sum, ch) => {
              const id = ch && (ch._id || ch.id) ? String(ch._id || ch.id) : '';
              const doc = (id && root.Game && typeof root.Game.getCharacterLocal === 'function')
                ? root.Game.getCharacterLocal(id)
                : null;
              if (!doc) return sum;
              const status = String((doc && doc.status) || '');
              return status !== 'dead' ? sum + 1 : sum;
            }, 0);
          } else {
            // Fallback: use any locally known characters matching the locale
            const chars = (typeof root.Game.getAllCharacters === 'function') ? root.Game.getAllCharacters() : [];
            const list = Array.isArray(chars) ? chars.filter(c => {
              const cid = c && c.location && c.location.locale ? String(c.location.locale._id || c.location.locale) : '';
              return cid && cid === String(locId);
            }) : [];
            if (list.length) {
              active = list.reduce((sum, c) => (String(c && c.status) !== 'dead' ? sum + 1 : sum), 0);
            }
          }
        }
        if (!Number.isNaN(active)) {
          this.enemiesRemaining = active;
          this.progressText = `${active} enemies remaining`;
          try { console.log('[Quest] progress computed (Clear)', { id: this.id, progressText: this.progressText }); } catch {}
          return this.progressText;
        }
        const n = Number(this.enemiesRemaining || 0);
        this.progressText = `${n} enemies remaining`;
        try { console.log('[Quest] progress fallback (Clear)', { id: this.id, progressText: this.progressText }); } catch {}
        return this.progressText;
      } catch (_) {
        const n = Number(this.enemiesRemaining || 0);
        this.progressText = `${n} enemies remaining`;
        try { console.log('[Quest] progress error (Clear)', { id: this.id, progressText: this.progressText }); } catch {}
        return this.progressText;
      }
    }
  }

  class KillQuest extends Quest {}
  class FetchQuest extends Quest {}
  class DeliverQuest extends Quest {}
  class GatherQuest extends Quest {}
  class ExploreQuest extends Quest {}

  root.Models.Quest = Quest;
})();
