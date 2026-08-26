const MARKETPLACE_ACTIVITY_KEY = 'marketplaceLastSeen';
const JOBS_KEY = 'preparedJobs';
const MAX_JOBS = 20;

function validTenderCode(value) {
  return typeof value === 'string' && /^\d{1,12}-\d{1,12}-(?:COT\d{2}|[A-Z][A-Z0-9]{0,3}\d{2})$/.test(value);
}

async function status() {
  const stored = await chrome.storage.local.get(MARKETPLACE_ACTIVITY_KEY);
  const lastSeen = typeof stored[MARKETPLACE_ACTIVITY_KEY] === 'number' ? stored[MARKETPLACE_ACTIVITY_KEY] : null;
  return { marketplaceOpen: lastSeen !== null && Date.now() - lastSeen < 10 * 60 * 1000, lastSeen };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'MARKETPLACE_SEEN') {
    void chrome.storage.local.set({ [MARKETPLACE_ACTIVITY_KEY]: Date.now() }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'GET_STATUS') {
    void status().then((payload) => sendResponse({ ok: true, payload }));
    return true;
  }
  if (message?.type === 'PREPARE_JOB') {
    const code = message.payload?.code;
    if (!validTenderCode(code)) {
      sendResponse({ ok: false, error: 'Código inválido.' });
      return false;
    }
    void chrome.storage.local.get(JOBS_KEY).then(async (stored) => {
      const jobs = Array.isArray(stored[JOBS_KEY]) ? stored[JOBS_KEY] : [];
      const job = { code, stage: message.payload?.stage === 'lista' ? 'lista' : 'revision', createdAt: new Date().toISOString() };
      await chrome.storage.local.set({ [JOBS_KEY]: [job, ...jobs.filter((item) => item?.code !== code)].slice(0, MAX_JOBS) });
      sendResponse({ ok: true, payload: job });
    });
    return true;
  }
  return false;
});
