// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  const gmailUserSelect = document.getElementById('gmail-user');
  const debugToggle = document.getElementById('debug-toggle');
  const statusEl = document.getElementById('status');

  // Load saved settings
  const settings = await chrome.storage.local.get(['defaultGmailAccount', 'debugLogging']);
  
  // Set Gmail account selector
  if (settings.defaultGmailAccount !== undefined) {
    gmailUserSelect.value = settings.defaultGmailAccount;
  } else {
    gmailUserSelect.value = '-1'; // Auto-detect by default
  }
  
  // Set debug toggle
  debugToggle.checked = settings.debugLogging || false;

  // Save Gmail account preference
  gmailUserSelect.addEventListener('change', async (e) => {
    const value = e.target.value;
    await chrome.storage.local.set({ defaultGmailAccount: value });
    showStatus('Settings saved', 'success');
  });

  // Save debug toggle preference
  debugToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ debugLogging: enabled });
    
    // Notify background script to update logger
    try {
      await chrome.runtime.sendMessage({ 
        type: 'UPDATE_DEBUG_LOGGING', 
        enabled: enabled 
      });
    } catch (e) {
      // Background script will pick up the change from storage
    }
    
    showStatus(`Debug logging ${enabled ? 'enabled' : 'disabled'}`, 'success');
  });

  function showStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    
    // Clear status after 2 seconds
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 2000);
  }
});