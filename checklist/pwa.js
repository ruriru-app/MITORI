(function initMitoriPwa(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriPwa = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPwaApi(root) {
  async function init({ flushChecklist = async () => {}, saveMitori = () => {}, setOffline = () => {}, documentRef = root.document } = {}) {
    if (!root.navigator?.serviceWorker || root.location?.protocol === 'file:') return { supported:false };
    const updateBar = documentRef?.getElementById('pwaUpdateBar');
    const updateButton = documentRef?.getElementById('pwaUpdateBtn');
    let waitingWorker = null;
    let switching = false;

    const showWaiting = worker => {
      waitingWorker = worker;
      if (updateBar) updateBar.hidden = false;
    };
    const updateOnlineState = () => setOffline(root.navigator.onLine === false);
    root.addEventListener?.('online', updateOnlineState);
    root.addEventListener?.('offline', updateOnlineState);
    updateOnlineState();

    if (updateButton) updateButton.addEventListener('click', async () => {
      if (!waitingWorker || switching) return;
      switching = true;
      updateButton.disabled = true;
      updateButton.textContent = '保存して更新中…';
      try {
        saveMitori();
        await flushChecklist();
        waitingWorker.postMessage({ type:'SKIP_WAITING' });
      } catch (error) {
        switching = false;
        updateButton.disabled = false;
        updateButton.textContent = '保存して更新';
        throw error;
      }
    });

    root.navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (switching) root.location.reload();
    });
    const registration = await root.navigator.serviceWorker.register('./sw.js', { scope:'./' });
    if (registration.waiting) showWaiting(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && root.navigator.serviceWorker.controller) showWaiting(installing);
      });
    });
    try { await root.navigator.storage?.persist?.(); } catch {}
    return { supported:true, registration };
  }

  return Object.freeze({ init });
});
