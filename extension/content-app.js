function sendStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) return;
    window.postMessage({ source: 'licita-control-extension', type: 'STATUS', payload: response.payload }, location.origin);
  });
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'licita-control-app') return;
  if (event.data.type === 'GET_STATUS') sendStatus();
  if (event.data.type === 'PREPARE_JOB') {
    chrome.runtime.sendMessage({ type: 'PREPARE_JOB', payload: event.data.payload }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) return;
      window.postMessage({ source: 'licita-control-extension', type: 'PACKAGE_ACCEPTED', payload: response.payload }, location.origin);
    });
  }
});

sendStatus();
