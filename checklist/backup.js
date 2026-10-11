(function initMitoriChecklistBackup(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriChecklistBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBackupApi(root) {
  const APP_ID = 'MITORI_CHECKLIST_BACKUP_V1';
  const FORMAT_VERSION = 1;
  function clone(value) { return structuredClone(value); }
  function createdAtValue(now) { return typeof now === 'string' ? now : (now instanceof Date ? now : new Date(now || Date.now())).toISOString(); }

  function model() {
    if (!root.MitoriChecklistModel) throw new Error('MITORIチェック表のデータ検証を開始できません');
    return root.MitoriChecklistModel;
  }

  function createBackup(state, catalogSnapshot, now = new Date()) {
    return {
      appId: APP_ID,
      formatVersion: FORMAT_VERSION,
      createdAt: createdAtValue(now),
      state: clone(model().migrateState(state)),
      catalogSnapshot: clone(catalogSnapshot && typeof catalogSnapshot === 'object' ? catalogSnapshot : { classes: [] })
    };
  }

  function serializeBackup(envelope) { return JSON.stringify(envelope, null, 2); }

  function parseEnvelope(raw) {
    let envelope;
    try { envelope = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); }
    catch { throw new Error('バックアップJSONを読み取れません'); }
    if (!envelope || envelope.appId !== APP_ID) throw new Error('MITORIチェック表のバックアップではありません');
    if (Number(envelope.formatVersion) > FORMAT_VERSION) throw new Error('このアプリより新しいバックアップ形式です');
    if (Number(envelope.formatVersion) !== FORMAT_VERSION) throw new Error('対応していないバックアップ形式です');
    if (!envelope.createdAt || Number.isNaN(Date.parse(envelope.createdAt))) throw new Error('バックアップの作成日時が不正です');
    envelope.state = model().migrateState(envelope.state);
    if (!envelope.catalogSnapshot || !Array.isArray(envelope.catalogSnapshot.classes)) throw new Error('バックアップのクラス照合情報が不正です');
    return envelope;
  }

  function compareCatalog(snapshot, currentCatalog) {
    const differences = [];
    const currentById = new Map((currentCatalog?.classes || []).map(item => [String(item.id), item]));
    for (const previous of snapshot?.classes || []) {
      const current = currentById.get(String(previous.id));
      if (!current) { differences.push({ code:'missing-class', classId:previous.id, previous:clone(previous) }); continue; }
      if (String(previous.school || '') !== String(current.school || '') || String(previous.name || '') !== String(current.name || '')) {
        differences.push({ code:'changed-class', classId:previous.id, previous:{ school:previous.school, name:previous.name }, current:{ school:current.school, name:current.name } });
      }
      const currentStudents = new Map((current.students || []).map(student => [String(student.id), student]));
      for (const student of previous.students || []) {
        const currentStudent = currentStudents.get(String(student.id));
        if (!currentStudent) { differences.push({ code:'missing-student', classId:previous.id, studentId:student.id, previous:clone(student) }); continue; }
        const previousNumber = String(student.number ?? student.no ?? '');
        const currentNumber = String(currentStudent.number ?? currentStudent.no ?? '');
        if (previousNumber !== currentNumber || String(student.name || '') !== String(currentStudent.name || '') || String(student.kana || '') !== String(currentStudent.kana || '')) {
          differences.push({ code:'changed-student', classId:previous.id, studentId:student.id, previous:clone(student), current:clone(currentStudent) });
        }
      }
    }
    return differences;
  }

  function inspectRestore(raw, currentCatalog) {
    const envelope = parseEnvelope(raw);
    return {
      envelope,
      state: clone(envelope.state),
      differences: compareCatalog(envelope.catalogSnapshot, currentCatalog || { classes: [] }),
      summary: summarizeBackup(envelope)
    };
  }

  function restoreBackup(inspected) {
    if (!inspected?.state) throw new Error('復元するチェック表データがありません');
    return clone(model().migrateState(inspected.state));
  }

  function summarizeBackup(envelope) {
    const state = envelope.state || {};
    return {
      createdAt: envelope.createdAt,
      classCount: state.classes?.length || 0,
      studentCount: (state.classes || []).reduce((sum, item) => sum + (item.students?.length || 0), 0),
      activeSheetCount: (state.sheetDefinitions || []).filter(item => !item.archivedAt).length,
      archivedSheetCount: (state.sheetDefinitions || []).filter(item => item.archivedAt).length,
      groupCount: state.groups?.length || 0,
      paletteCount: state.preferences?.palettes?.length || 0
    };
  }

  function backupFilename(now = new Date()) {
    let parts;
    if (typeof now === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.test(now)) parts = now.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/).slice(1);
    else {
      const date = now instanceof Date ? now : new Date(now);
      parts = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0'), String(date.getHours()).padStart(2,'0'), String(date.getMinutes()).padStart(2,'0')];
    }
    return `MITORI-checklist-backup-${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}.json`;
  }

  function downloadBackup(state, catalogSnapshot, now = new Date()) {
    const blob = new Blob([serializeBackup(createBackup(state, catalogSnapshot, now))], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFilename(now);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return anchor.download;
  }

  function clearChecklistData() { return model().createBlankState(); }

  return Object.freeze({ APP_ID, FORMAT_VERSION, createBackup, serializeBackup, inspectRestore, restoreBackup, summarizeBackup, backupFilename, downloadBackup, clearChecklistData, compareCatalog });
});
