(function initMitoriFullBackup(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMitoriFullBackupApi(root) {
  const APP_ID = 'MITORI_FULL_BACKUP_V1';
  const FORMAT_VERSION = 1;
  const DB_NAME = 'MITORI_BACKUP_SUPPORT_V1';
  const DB_VERSION = 1;
  const STORE_NAME = 'items';
  const HANDLE_KEY = 'primary-file-handle';
  const SAFETY_KEY = 'pre-restore-safety';

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isoValue(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error('バックアップ日時が不正です');
    return date.toISOString();
  }

  function createBackup(mitoriState, checklistState, now = new Date(), appVersion = '') {
    return {
      appId: APP_ID,
      formatVersion: FORMAT_VERSION,
      createdAt: isoValue(now),
      appVersion: String(appVersion || ''),
      mitoriState: clone(mitoriState && typeof mitoriState === 'object' ? mitoriState : {}),
      checklistState: clone(checklistState && typeof checklistState === 'object' ? checklistState : {}),
    };
  }

  function serializeBackup(envelope) {
    return JSON.stringify(envelope, null, 2);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function validObjectArray(value) {
    return Array.isArray(value) && value.every(isObject);
  }

  function parseBackup(raw) {
    let envelope;
    try { envelope = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); }
    catch { throw new Error('バックアップファイルを読み取れません'); }
    if (!envelope || envelope.appId !== APP_ID) throw new Error('MITORI全体のバックアップではありません');
    if (Number(envelope.formatVersion) > FORMAT_VERSION) throw new Error('このMITORIより新しいバックアップ形式です');
    if (Number(envelope.formatVersion) !== FORMAT_VERSION) throw new Error('対応していないバックアップ形式です');
    envelope.createdAt = isoValue(envelope.createdAt);
    if (!isObject(envelope.mitoriState)) throw new Error('MITORI本体のデータが不正です');
    const main = envelope.mitoriState;
    const mainObjectArrays = ['classes', 'sharedClasses', 'records', 'grades', 'subjects', 'tagSets', 'lessonLists', 'archivedTiles', 'performanceTests', 'criteriaSets'];
    const mainMaps = ['board', 'classData', 'sharedClassData', 'timetable', 'termSettings', 'weeklyPlan', 'performanceResults'];
    if (mainObjectArrays.some(key => !validObjectArray(main[key])) || !Array.isArray(main.classLayout) || mainMaps.some(key => !isObject(main[key]))) throw new Error('MITORI本体のデータが不正です');
    if (!isObject(envelope.checklistState)
      || envelope.checklistState.appId !== 'MITORI_CHECKLIST'
      || !Number.isFinite(Number(envelope.checklistState.schemaVersion))
      || !validObjectArray(envelope.checklistState.sheetDefinitions)) throw new Error('チェック表のデータが不正です');
    envelope.appVersion = String(envelope.appVersion || '');
    return clone(envelope);
  }

  async function commitRestore({ previous, next, writeMitori, writeChecklist }) {
    if (!isObject(previous) || !isObject(next) || typeof writeMitori !== 'function' || typeof writeChecklist !== 'function') throw new Error('復元処理の準備が不正です');
    try {
      await writeChecklist(clone(next.checklistState));
      await writeMitori(clone(next.mitoriState));
    } catch (error) {
      const rollbackErrors = [];
      try { await writeChecklist(clone(previous.checklistState)); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      try { await writeMitori(clone(previous.mitoriState)); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      if (rollbackErrors.length) error.rollbackErrors = rollbackErrors;
      throw error;
    }
  }

  async function saveRequiredSafetyBackup(store, envelope) {
    try {
      if (!store || typeof store.saveSafetyBackup !== 'function') throw new Error('support store unavailable');
      await store.saveSafetyBackup(clone(envelope));
    } catch (error) {
      const safeError = new Error('復元前の安全退避を作成できないため、復元を中止しました');
      safeError.cause = error;
      throw safeError;
    }
  }

  function overwriteStatus(remoteEnvelope, lastKnownCreatedAt) {
    if (!remoteEnvelope) return 'empty';
    const remoteTime = Date.parse(remoteEnvelope.createdAt || '');
    const knownTime = Date.parse(lastKnownCreatedAt || '');
    if (!Number.isFinite(knownTime)) return 'unknown-existing';
    return remoteTime > knownTime ? 'remote-newer' : 'known';
  }

  function isReminderDue(settings, now = new Date()) {
    const intervalDays = Number(settings?.intervalDays || 0);
    if (!(intervalDays > 0)) return false;
    const base = Date.parse(settings?.lastBackupAt || settings?.firstSeenAt || '');
    const current = Date.parse(isoValue(now));
    if (!Number.isFinite(base)) return false;
    return current - base >= intervalDays * 86400000;
  }

  function summarizeBackup(envelope) {
    const main = envelope?.mitoriState || {};
    const checklist = envelope?.checklistState || {};
    const sheets = Array.isArray(checklist.sheetDefinitions) ? checklist.sheetDefinitions : [];
    return {
      createdAt: envelope?.createdAt || '',
      sharedClassCount: Array.isArray(main.sharedClasses) ? main.sharedClasses.length : 0,
      lessonTileCount: Array.isArray(main.classes) ? main.classes.length : 0,
      recordCount: Array.isArray(main.records) ? main.records.length : 0,
      performanceTestCount: Array.isArray(main.performanceTests) ? main.performanceTests.length : 0,
      activeChecklistCount: sheets.filter(item => !item?.archivedAt).length,
      archivedChecklistCount: sheets.filter(item => item?.archivedAt).length,
    };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('バックアップ設定の保存に失敗しました'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('バックアップ設定の保存に失敗しました'));
      transaction.onabort = () => reject(transaction.error || new Error('バックアップ設定の保存が中断されました'));
    });
  }

  async function openSupportStore(indexedDBImpl = root.indexedDB) {
    if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') throw new Error('このブラウザでは保存先を記憶できません');
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    const db = await requestResult(request);
    async function read(key) {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
      await transactionDone(transaction);
      return value === undefined ? null : value;
    }
    async function write(key, value) {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);
      await transactionDone(transaction);
    }
    async function remove(key) {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      await transactionDone(transaction);
    }
    return Object.freeze({
      loadHandle: () => read(HANDLE_KEY),
      saveHandle: value => write(HANDLE_KEY, value),
      clearHandle: () => remove(HANDLE_KEY),
      loadSafetyBackup: () => read(SAFETY_KEY),
      saveSafetyBackup: value => write(SAFETY_KEY, clone(value)),
      clearSafetyBackup: () => remove(SAFETY_KEY),
    });
  }

  return Object.freeze({
    APP_ID,
    FORMAT_VERSION,
    DB_NAME,
    STORE_NAME,
    createBackup,
    serializeBackup,
    parseBackup,
    commitRestore,
    saveRequiredSafetyBackup,
    overwriteStatus,
    isReminderDue,
    summarizeBackup,
    openSupportStore,
  });
});
