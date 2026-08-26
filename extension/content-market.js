function reportMarketplaceActivity() {
  chrome.runtime.sendMessage({ type: 'MARKETPLACE_SEEN' }, () => { void chrome.runtime.lastError; });
}

reportMarketplaceActivity();
window.addEventListener('focus', reportMarketplaceActivity);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reportMarketplaceActivity(); });
