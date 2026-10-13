(function initMitoriPwa(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriPwa = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPwaApi(root) {
  async function init({ flushChecklist = async () => {}, saveMitori = () => {}, setOffline = () => {}, documentRef = root.document, rootRef = root } = {}) {
    const host = rootRef || root;
    if (!host.navigator?.serviceWorker || host.location?.protocol === 'file:') return { supported:false };
    const updateBar = documentRef?.getElementById('pwaUpdateBar');
    const updateButton = documentRef?.getElementById('pwaUpdateBtn');
    let registration = null;
    let waitingWorker = null;
    let switching = false;

    const showWaiting = worker => {
      waitingWorker = worker;
      if (updateBar) updateBar.hidden = false;
    };
    const observeInstalling = worker => {
      if (!worker) return;
      const updateState = () => {
        if (worker.state === 'installed' && host.navigator.serviceWorker.controller) showWaiting(worker);
      };
      worker.addEventListener?.('statechange', updateState);
      updateState();
    };
    const waitUntilInstalled = worker => {
      if (!worker || worker.state === 'installed') return Promise.resolve(worker || null);
      if (worker.state === 'redundant') return Promise.resolve(null);
      return new Promise(resolve => worker.addEventListener?.('statechange', () => {
        if (worker.state === 'installed') resolve(worker);
        if (worker.state === 'redundant') resolve(null);
      }));
    };
    const setBusy = busy => {
      if (updateButton) {
        updateButton.disabled = busy;
        updateButton.textContent = busy ? '保存して更新中…' : '保存して更新';
      }
    };
    const saveAndUpdate = async () => {
      if (switching) return;
      switching = true;
      setBusy(true);
      try {
        await saveMitori();
        await flushChecklist();
        const candidate = registration?.waiting || waitingWorker || registration?.installing;
        const installed = await waitUntilInstalled(candidate);
        const worker = registration?.waiting || installed;
        if (worker) {
          waitingWorker = worker;
          worker.postMessage({ type:'SKIP_WAITING' });
          return;
        }
        switching = false;
        setBusy(false);
        host.location.reload();
      } catch (error) {
        switching = false;
        setBusy(false);
        throw error;
      }
    };
    const updateOnlineState = () => setOffline(host.navigator.onLine === false);
    host.addEventListener?.('online', updateOnlineState);
    host.addEventListener?.('offline', updateOnlineState);
    updateOnlineState();

    host.navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (switching) host.location.reload();
    });
    registration = await host.navigator.serviceWorker.register('./sw.js', { scope:'./' });
    if (registration.waiting) showWaiting(registration.waiting);
    observeInstalling(registration.installing);
    registration.addEventListener('updatefound', () => observeInstalling(registration.installing));
    updateButton?.addEventListener('click', saveAndUpdate);
    try { await host.navigator.storage?.persist?.(); } catch {}
    return { supported:true, registration };
  }

  return Object.freeze({ init });
});
