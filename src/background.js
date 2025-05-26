// Import logger
importScripts('logger.js');

logger.log('Service Worker initialized');

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed');
  // Enable debug logging by default in development
  chrome.storage.local.set({ debugLogging: true });
});

// Handle internal messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_DEBUG_LOGGING') {
    logger.setEnabled(message.enabled);
    sendResponse({ success: true });
  }
  return false;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  logger.log('Received external message:', message);
  logger.log('From sender:', sender);
  
  const isValidSender = sender.url && 
    (sender.url.includes('.proexpedite.web.app') || 
     sender.url.includes('localhost:') || 
     sender.url.includes('127.0.0.1:'));
  
  if (!isValidSender) {
    logger.error('Invalid sender:', sender.url);
    sendResponse({ error: 'Unauthorized sender' });
    return false;
  }
  
  handleExternalMessage(message, sendResponse);
  
  return true;
});

async function handleExternalMessage(message, sendResponse) {
  try {
    const { type, payload } = message;
    
    switch (type) {
      case 'OPEN_GMAIL_THREAD':
        const openResult = await handleOpenGmailThread(payload);
        sendResponse(openResult);
        break;
        
      case 'REPLY_TO_GMAIL_THREAD':
        const replyResult = await handleReplyToGmailThread(payload);
        sendResponse(replyResult);
        break;
        
      case 'CHECK_EXTENSION':
        sendResponse({ status: 'active', version: chrome.runtime.getManifest().version });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type: ' + type });
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
}

async function handleOpenGmailThread(payload) {
  const { threadId, emailAddress, originalMessageId } = payload;
  
  if (!threadId || !emailAddress) {
    throw new Error('Missing required parameters: threadId and emailAddress');
  }
  
  logger.info('Opening Gmail thread:', { threadId, emailAddress, originalMessageId });
  
  const gmailTab = await findOrCreateGmailTab(emailAddress);
  
  const authUserIndex = await extractAuthUserIndex(emailAddress);
  const threadUrl = `https://mail.google.com/mail/u/${authUserIndex}/?tab=rm&ogbl#inbox/${threadId}`;
  
  await navigateToThread(gmailTab, threadUrl, threadId, originalMessageId, authUserIndex);
  
  return { status: 'success', message: 'Thread opened', tabId: gmailTab.id };
}

async function handleReplyToGmailThread(payload) {
  const { threadId, bidText, emailAddress, originalMessageId } = payload;
  
  if (!threadId || !bidText || !emailAddress) {
    throw new Error('Missing required parameters: threadId, bidText, and emailAddress');
  }
  
  logger.info('Replying to Gmail thread:', { threadId, emailAddress, originalMessageId });
  
  const gmailTab = await findOrCreateGmailTab(emailAddress);
  
  const authUserIndex = await extractAuthUserIndex(emailAddress);
  const threadUrl = `https://mail.google.com/mail/u/${authUserIndex}/?tab=rm&ogbl#inbox/${threadId}`;
  
  await navigateToThread(gmailTab, threadUrl, threadId, originalMessageId, authUserIndex);
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Ensure content script is injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: gmailTab.id },
      files: ['src/content_script_gmail.js']
    });
    logger.log('Content script injected successfully');
  } catch (e) {
    logger.log('Content script may already be injected:', e.message);
  }
  
  // Wait a bit for content script to initialize
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const response = await chrome.tabs.sendMessage(gmailTab.id, {
    type: 'PREPARE_REPLY',
    bidText: bidText
  });
  
  return { status: 'success', message: 'Reply prepared', response };
}

async function findOrCreateGmailTab(emailAddress) {
  const authUserIndex = await extractAuthUserIndex(emailAddress);
  
  const allTabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
  
  const validGmailTabs = [];
  for (const tab of allTabs) {
    try {
      await chrome.tabs.get(tab.id);
      validGmailTabs.push(tab);
    } catch (e) {
      logger.log('Tab from another profile, skipping:', tab.id);
    }
  }
  
  for (const tab of validGmailTabs) {
    if (tab.url && tab.url.includes(`/mail/u/${authUserIndex}/`)) {
      logger.info('Found existing Gmail tab for user:', authUserIndex);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return tab;
    }
  }
  
  const currentWindow = await chrome.windows.getCurrent();
  const newTab = await chrome.tabs.create({
    url: `https://mail.google.com/mail/u/${authUserIndex}/`,
    active: true,
    windowId: currentWindow.id
  });
  
  return newTab;
}

async function extractAuthUserIndex(emailAddress) {
  // Check if user has set a default account
  const settings = await chrome.storage.local.get(['defaultGmailAccount']);
  if (settings.defaultGmailAccount && settings.defaultGmailAccount !== '-1') {
    logger.info(`Using user-selected Gmail account: ${settings.defaultGmailAccount}`);
    return settings.defaultGmailAccount;
  }
  
  // Otherwise, try to find an existing Gmail tab for this email
  const allTabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
  
  for (const tab of allTabs) {
    try {
      await chrome.tabs.get(tab.id);
      
      // Check if the tab title contains the email address
      if (tab.title && tab.title.toLowerCase().includes(emailAddress.toLowerCase())) {
        // Extract the index from the URL
        const match = tab.url.match(/\/mail\/u\/(\d+)\//);
        if (match) {
          logger.info(`Found Gmail tab for ${emailAddress} at index ${match[1]}`);
          return match[1];
        }
      }
    } catch (e) {
      // Tab from another profile, skip
    }
  }
  
  // If no matching tab found, default to 0
  logger.warn(`No existing Gmail tab found for ${emailAddress}, defaulting to index 0`);
  return '0';
}

async function navigateToThread(tab, threadUrl, threadId, originalMessageId, authUserIndex) {
  await chrome.tabs.update(tab.id, { url: threadUrl });
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const listener = (tabId, changeInfo, updatedTab) => {
      if (tabId !== tab.id || resolved) return;
      
      if (changeInfo.status === 'complete') {
        const currentUrl = updatedTab.url || '';
        
        if (!currentUrl.includes(`#inbox/${threadId}`) && 
            !currentUrl.includes('#search/') && 
            originalMessageId) {
          
          chrome.tabs.onUpdated.removeListener(listener);
          resolved = true;
          
          const searchUrl = `https://mail.google.com/mail/u/${authUserIndex}/#search/rfc822msgid:${originalMessageId}`;
          chrome.tabs.update(tab.id, { url: searchUrl });
          
          const searchListener = (searchTabId, searchChangeInfo) => {
            if (searchTabId === tab.id && searchChangeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(searchListener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(searchListener);
          
        } else if (currentUrl.includes(`#inbox/${threadId}`) || currentUrl.includes('#search/')) {
          chrome.tabs.onUpdated.removeListener(listener);
          resolved = true;
          resolve();
        }
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    setTimeout(() => {
      if (!resolved) {
        chrome.tabs.onUpdated.removeListener(listener);
        resolved = true;
        resolve();
      }
    }, 10000);
  });
}