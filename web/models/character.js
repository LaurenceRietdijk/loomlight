// Lightweight Character model with local events and kill()
(function () {
  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Models = root.Models || {};

  class Character {
    constructor(init = {}) {
      // core ids + compatibility with server docs
      this.id = String(init.id || init._id || '');
      this._id = this.id; // maintain _id for UI code
      // copy common fields from init to preserve UI expectations
      const fields = ['name','title','description','personality','gender','age','race','role','status','faction','quests','home','work','location'];
      for (const k of fields) { if (k in init) this[k] = init[k]; }
      // simple events
      this._events = new Map();
    }

    static from(data) {
      if (!data) return new Character();
      return new Character(data);
    }

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
    _emit(evt, payload) {
      const list = this._events.get(String(evt)) || [];
      for (const fn of list) { try { fn(payload); } catch {} }
    }

    // Local-only kill: updates status and emits events
    kill() {
      this.status = 'dead';
      this._emit('killed', { character: this });
      try { if (root.Game && typeof root.Game.emit === 'function') root.Game.emit('character:killed', { character: this }); } catch {}
      return this;
    }
  }

  root.Models.Character = Character;
})();

