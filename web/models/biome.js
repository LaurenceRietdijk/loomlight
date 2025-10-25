// Lightweight Biome model for the browser.
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};

  class Biome {
    constructor(init = {}) {
      this.id = init.id || '';
      this.name = init.name || '';
      this.description = init.description || '';
      // terrains is an array of terrain id strings (or objects with _id)
      this.terrains = Array.isArray(init.terrains) ? init.terrains : [];
      // locales is a Map-like object of { [localeType: string]: boolean }
      this.locales = init.locales || {};
    }

    static from(data) {
      if (!data) return new Biome();
      const id = String(data._id || data.id || '');
      // Normalize potential Mongoose Map to plain object
      let locales = {};
      try {
        const src = data.locales || {};
        if (src && typeof src === 'object') {
          if (typeof src.forEach === 'function' && typeof src.get === 'function') {
            // Mongoose Map
            src.forEach((v, k) => { locales[String(k)] = Boolean(v); });
          } else {
            locales = Object.fromEntries(Object.entries(src).map(([k, v]) => [String(k), Boolean(v)]));
          }
        }
      } catch (_) { locales = {}; }
      // Normalize terrains to array of id strings
      const terrains = Array.isArray(data.terrains)
        ? data.terrains.map((t) => (t && typeof t === 'object') ? String(t._id || t.id || '') : String(t || ''))
                       .filter((s) => !!s)
        : [];
      return new Biome({
        id,
        name: data.name || '',
        description: data.description || '',
        terrains,
        locales,
      });
    }
  }

  root.Models.Biome = Biome;
})();
