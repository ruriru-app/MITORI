(function initMitoriChecklistStorage(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriChecklistStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStorageApi(root) {
  const DB_NAME = 'MITORI_CHECKLIST_DB_V1';
  const DB_VERSION = 1;
  const STORE_NAME = 'workspace';
  const CURRENT_KEY = 'current';

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('チェック表の端末内保存に失敗しました'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('チェック表の端末内保存に失敗しました'));
      transaction.onabort = () => reject(transaction.error || new Error('チェック表の端末内保存が中断されました'));
    });
  }

  async function openDb(indexedDBImpl = root.indexedDB) {
    if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') {
      throw new Error('このブラウザはチェック表の端末内保存に対応していません');
    }
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    return requestResult(request);
  }

  async function readCurrentState(db) {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(CURRENT_KEY));
    await transactionDone(transaction);
    return result === undefined ? null : clone(result);
  }

  async function writeCurrentState(db, state) {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(clone(state), CURRENT_KEY);
    await transactionDone(transaction);
  }

  async function clearCurrentState(db) {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(CURRENT_KEY);
    await transactionDone(transaction);
  }

  function createSaveQueue({ write, onStatus = () => {}, delayMs = 250, now = () => new Date().toISOString() }) {
    let pending = null;
    let dirty = false;
    let timer = null;
    let drainPromise = null;
    let lastSavedAt = null;

    function report(status, error = null) {
      onStatus(Object.freeze({ status, savedAt: lastSavedAt, error }));
    }

    async function drain() {
      while (pending !== null) {
        const snapshot = pending;
        pending = null;
        report('saving');
        try {
          await write(snapshot);
          lastSavedAt = now();
        } catch (error) {
          if (pending === null) pending = snapshot;
          dirty = true;
          report('error', error);
          throw error;
        }
      }
      dirty = false;
      report('saved');
    }

    function flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!drainPromise) drainPromise = drain().finally(() => { drainPromise = null; });
      return drainPromise;
    }

    function enqueue(state) {
      pending = clone(state);
      dirty = true;
      report('dirty');
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush().catch(() => {});
      }, Math.max(0, delayMs));
    }

    return Object.freeze({
      enqueue,
      schedule: enqueue,
      flush,
      retry: flush,
      isDirty: () => dirty,
      getPending: () => pending === null ? null : clone(pending),
      getLastSavedAt: () => lastSavedAt
    });
  }

  async function requestPersistentStorage(storageManager = root.navigator && root.navigator.storage) {
    if (!storageManager || typeof storageManager.persist !== 'function') return false;
    try { return Boolean(await storageManager.persist()); } catch { return false; }
  }

  async function openChecklistStorage(options = {}) {
    const db = await openDb(options.indexedDB || root.indexedDB);
    const listeners = new Set();
    let currentStatus = Object.freeze({ status: 'loading', savedAt: null, error: null });

    function publish(next) {
      currentStatus = Object.freeze({
        status: next.status,
        savedAt: next.savedAt === undefined ? currentStatus.savedAt : next.savedAt,
        error: next.error || null
      });
      listeners.forEach(listener => listener(currentStatus));
    }

    const saveQueue = createSaveQueue({
      write: state => writeCurrentState(db, state),
      onStatus: publish,
      delayMs: options.delayMs,
      now: options.now
    });

    function subscribeStatus(listener) {
      if (typeof listener !== 'function') throw new TypeError('保存状態の通知先が必要です');
      listeners.add(listener);
      listener(currentStatus);
      return () => listeners.delete(listener);
    }

    function setOffline(isOffline) {
      if (isOffline) publish({ status: 'offline', savedAt: currentStatus.savedAt });
      else publish({ status: saveQueue.isDirty() ? 'dirty' : 'saved', savedAt: currentStatus.savedAt });
    }

    return Object.freeze({
      load: () => readCurrentState(db),
      save: state => saveQueue.enqueue(state),
      flush: () => saveQueue.flush(),
      clear: () => clearCurrentState(db),
      requestPersistence: () => requestPersistentStorage(options.storageManager),
      subscribeStatus,
      setOffline,
      saveQueue,
      getStatus: () => currentStatus
    });
  }

  return Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    CURRENT_KEY,
    openDb,
    readCurrentState,
    writeCurrentState,
    clearCurrentState,
    createSaveQueue,
    requestPersistentStorage,
    openChecklistStorage
  });
});
