(function initChecklistPaletteSettings(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriChecklistPaletteSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPaletteSettingsApi() {
  function clone(value) { return structuredClone(value); }
  function generatedId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

  function createDraft(palette) {
    if (!palette || typeof palette !== 'object') throw new TypeError('編集するパレットが見つかりません');
    return clone(palette);
  }

  function blankDraft({ id = generatedId('palette'), nowIso = new Date().toISOString() } = {}) {
    return { id, name: '新しいパレット', size: 'standard', scoringEnabled: false, entries: [], preset: null, createdAt: nowIso, updatedAt: nowIso };
  }

  function moveEntry(draft, entryId, amount) {
    const next = createDraft(draft);
    const from = next.entries.findIndex(entry => entry.id === entryId);
    if (from < 0) return next;
    const to = Math.max(0, Math.min(next.entries.length - 1, from + Number(amount || 0)));
    if (to === from) return next;
    const [entry] = next.entries.splice(from, 1);
    next.entries.splice(to, 0, entry);
    return next;
  }

  function updateEntry(draft, entryId, changes) {
    const next = createDraft(draft);
    const index = next.entries.findIndex(entry => entry.id === entryId);
    if (index < 0) throw new TypeError('編集するボタンが見つかりません');
    next.entries[index] = { ...next.entries[index], ...clone(changes), id: entryId };
    return next;
  }

  function removeEntry(draft, entryId) {
    const next = createDraft(draft);
    next.entries = next.entries.filter(entry => entry.id !== entryId);
    return next;
  }

  function addEntry(draft, input = {}) {
    const next = createDraft(draft);
    const entryId = input.id || generatedId(`${next.id}-entry`);
    next.entries.push({
      id: entryId,
      label: String(input.label || '新規'),
      color: input.color || 'cream',
      score: input.score === undefined ? null : input.score,
      action: input.action || 'mark',
      slotSpan: Number(input.slotSpan) === 2 ? 2 : 1,
      visible: input.visible !== false
    });
    return next;
  }

  function toPaletteInput(draft) {
    const next = createDraft(draft);
    return {
      id: next.id,
      name: next.name,
      size: next.size,
      scoringEnabled: next.scoringEnabled === true,
      entries: next.entries.map(entry => clone(entry)),
      preset: null,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt
    };
  }

  return Object.freeze({ createDraft, blankDraft, moveEntry, updateEntry, removeEntry, addEntry, toPaletteInput });
});
