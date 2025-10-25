// Locale model with lazy population of buildings/rooms/containers/items.
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};

  // Item
  class Item {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.type = init.type || '';
      this.description = init.description || '';
    }
    static from(data) {
      if (!data) return new Item();
      return new Item({
        id: String(data._id || data.id || ''),
        name: data.name || '',
        type: data.type || '',
        description: data.description || '',
      });
    }
  }

  // Container
  class Container {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.type = init.type || '';
      this.items = Array.isArray(init.items) ? init.items : [];
    }
    static from(data) {
      if (!data) return new Container();
      const items = Array.isArray(data.items) ? data.items.map(Item.from) : [];
      return new Container({
        id: String(data._id || data.id || ''),
        name: data.name || '',
        type: data.type || '',
        items,
      });
    }
  }

  // Room
  class Room {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.description = init.description || '';
      this.containers = Array.isArray(init.containers) ? init.containers : [];
    }
    static from(data) {
      if (!data) return new Room();
      const containers = Array.isArray(data.containers) ? data.containers.map(Container.from) : [];
      return new Room({
        id: String(data._id || data.id || ''),
        name: data.name || '',
        description: data.description || '',
        containers,
      });
    }
  }

  // Building
  class Building {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.type = init.type || '';
      this.description = init.description || '';
      this.rooms = Array.isArray(init.rooms) ? init.rooms : [];
    }
    static from(data) {
      if (!data) return new Building();
      const rooms = Array.isArray(data.rooms) ? data.rooms.map(Room.from) : [];
      return new Building({
        id: String(data._id || data.id || ''),
        name: data.name || '',
        type: data.type || '',
        description: data.description || '',
        rooms,
      });
    }
  }

  // Locale
  class Locale {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.type = init.type || '';
      this.description = init.description || '';
      this.coordinates = {
        x: Number((init.coordinates && init.coordinates.x) || 0),
        y: Number((init.coordinates && init.coordinates.y) || 0),
      };
      // Biome: may be an id string or a populated object { _id, name, description, locales, terrains }
      this.biome = init.biome || null;
      // References (ids or embedded objects depending on payload)
      this.primary_race = init.primary_race || null; // may be id or object
      this.factions = Array.isArray(init.factions) ? init.factions : [];
      // Characters: store only references (ids and lightweight fields), not full docs
      this.characters = Array.isArray(init.characters) ? init.characters : [];
      this.buildings = Array.isArray(init.buildings) ? init.buildings : [];
      this.special_features = Array.isArray(init.special_features) ? init.special_features : [];
      this.resources = init.resources || {};
      this.population = init.population || 0;

      // Whether nested refs are hydrated (rooms/containers/items/characters populated)
      this._loadedFull = Boolean(init._loadedFull || false);
    }

    static from(data) {
      if (!data) return new Locale();
      // If payload already contains nested buildings, materialize them
      const hasNestedBuildings = Array.isArray(data.buildings) && data.buildings.length && typeof data.buildings[0] === 'object';
      const buildings = hasNestedBuildings ? data.buildings.map(Building.from) : [];
      // Normalize biome (id or object)
      let biome = null;
      if (data.hasOwnProperty('biome')) {
        const b = data.biome;
        if (b && typeof b === 'object') {
          // Keep a light representation if present
          const terrains = Array.isArray(b.terrains)
            ? b.terrains.map((t) => (t && typeof t === 'object') ? String(t._id || t.id || '') : String(t || '')).filter((s) => !!s)
            : [];
          biome = { _id: String(b._id || b.id || ''), name: b.name || '', description: b.description || '', locales: b.locales || {}, terrains };
        } else if (b) {
          biome = String(b);
        }
      }
      // Normalize characters to id references only to avoid duplicating full docs
      const chars = Array.isArray(data.characters) ? data.characters.map((c) => {
        const id = c && typeof c === 'object' ? String((c._id && (c._id._id || c._id)) || c._id || c.id || c) : String(c || '');
        const buildingId = c && c.building ? String(c.building._id || c.building) : '';
        const role = c && c.role ? String(c.role) : undefined;
        const entry = { _id: id };
        if (buildingId) entry.building = { _id: buildingId };
        if (role) entry.role = role;
        return entry;
      }) : [];
      return new Locale({
        id: String(data._id || data.id || ''),
        name: data.name || '',
        type: data.type || '',
        description: data.description || '',
        coordinates: data.coordinates || { x: 0, y: 0 },
        biome,
        primary_race: data.primary_race || null,
        factions: Array.isArray(data.factions) ? data.factions : [],
        characters: chars,
        buildings,
        special_features: Array.isArray(data.special_features) ? data.special_features : [],
        resources: data.resources || {},
        population: data.population || 0,
        _loadedFull: hasNestedBuildings,
      });
    }

    // Ensure nested references are fetched and hydrated when the locale view is opened
    async ensureLoaded(worldId) {
      if (this._loadedFull) return this;
      const wid = String(worldId || (root.Game && root.Game.player && root.Game.player.worldId) || '');
      if (!wid || typeof fetch !== 'function') return this;
      const params = new URLSearchParams({ world_id: wid, x: String(this.coordinates.x), y: String(this.coordinates.y) });
      try {
        const res = await fetch(`/locale/full?${params.toString()}`);
        if (!res.ok) return this;
        const data = await res.json();
        const loc = data && data.locale ? data.locale : null;
        if (!loc) return this;
        const full = Locale.from(loc);
        // Ensure referenced characters are loaded into Game cache, but store only ids locally
        try {
          const g = root.Game;
          const list = Array.isArray(loc.characters) ? loc.characters : [];
          for (const c of list) {
            const doc = (c && c._id && typeof c._id === 'object') ? c._id : (typeof c === 'object' ? c : null);
            if (g && typeof g.rememberCharacter === 'function' && doc && (doc._id || doc.id)) {
              g.rememberCharacter(doc);
            }
          }
        } catch {}
        // Copy hydrated fields onto this instance
        this.biome = full.biome; // populated object if available
        this.primary_race = full.primary_race;
        this.factions = full.factions;
        this.characters = full.characters; // ids + light refs only
        this.buildings = full.buildings;
        this.special_features = full.special_features;
        this.resources = full.resources;
        this.population = full.population;
        this._loadedFull = true;
      } catch (_) { /* network error ignored */ }
      return this;
    }
  }

  root.Models.Item = Item;
  root.Models.Container = Container;
  root.Models.Room = Room;
  root.Models.Building = Building;
  root.Models.Locale = Locale;
})();
