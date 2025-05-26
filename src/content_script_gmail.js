// Create a simple logger for content script
const logger = {
  enabled: true,
  prefix: '[CargoReimagined Content]',
  log: function(...args) {
    if (this.enabled) console.log(this.prefix, ...args);
  },
  info: function(...args) {
    if (this.enabled) console.info(this.prefix, '[INFO]', ...args);
  },
  warn: function(...args) {
    if (this.enabled) console.warn(this.prefix, '[WARN]', ...args);
  },
  error: function(...args) {
    console.error(this.prefix, '[ERROR]', ...args);
  }
};

// Load debug setting
chrome.storage.local.get(['debugLogging'], (result) => {
  logger.enabled = result.debugLogging || false;
});

logger.log('Content script injected into Gmail');

const SELECTORS = {
  threadContainer: '[role="main"]',
  messagesList: '[role="list"][aria-label*="conversation"]',
  lastMessage: '[role="listitem"]:last-child',
  replyButton: '[data-tooltip*="Reply"]:not([aria-label*="Reply all"])',
  replyButtonAlt: '[aria-label*="Reply"][role="button"]:not([aria-label*="Reply all"])',
  composeArea: '[role="textbox"][contenteditable="true"]',
  expandedMessageIndicator: '[aria-expanded="true"]'
};

const RETRY_CONFIG = {
  maxAttempts: 20,
  initialDelay: 50,
  maxDelay: 300,
  backoffFactor: 1.5
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.log('Content script received message:', message);
  
  handleMessage(message).then(response => {
    sendResponse(response);
  }).catch(error => {
    logger.error('Error handling message:', error);
    sendResponse({ error: error.message });
  });
  
  return true;
});

async function handleMessage(message) {
  const { type, bidText } = message;
  
  switch (type) {
    case 'PREPARE_REPLY':
      return await prepareReply(bidText);
    case 'CHECK_GMAIL_STATE':
      return await checkGmailState();
    default:
      throw new Error('Unknown message type: ' + type);
  }
}

async function prepareReply(bidText) {
  if (!bidText) {
    throw new Error('No bid text provided');
  }
  
  logger.info('Preparing reply with bid text');
  
  try {
    await waitForThreadToLoad();
    
    const lastMessage = await findLastMessage();
    
    const replyButton = await findReplyButton(lastMessage);
    
    simulateClick(replyButton);
    
    const composeArea = await waitForComposeArea();
    
    setTextContent(composeArea, bidText);
    
    return { 
      status: 'success', 
      message: 'Reply prepared',
      details: {
        bidTextLength: bidText.length,
        composeAreaFound: true
      }
    };
  } catch (error) {
    logger.error('Failed to prepare reply:', error);
    throw error;
  }
}

async function waitForThreadToLoad() {
  logger.log('Waiting for thread to load...');
  
  await waitForElement(SELECTORS.threadContainer);
  
  // Try multiple approaches to find the messages container
  await waitForCondition(async () => {
    // Check for standard messages list
    const messagesList = document.querySelector(SELECTORS.messagesList);
    if (messagesList && messagesList.children.length > 0) {
      return true;
    }
    
    // Check for messages with .gs class (Gmail's message wrapper)
    const gsMessages = document.querySelectorAll('.gs');
    if (gsMessages.length > 0) {
      return true;
    }
    
    // Check for messages with data-message-id
    const messageIdElements = document.querySelectorAll('[data-message-id]');
    if (messageIdElements.length > 0) {
      return true;
    }
    
    return false;
  });
  
  await new Promise(resolve => setTimeout(resolve, 200));
}

async function findLastMessage() {
  logger.log('Finding last message...');
  
  // First try the standard selector
  let messagesList = document.querySelector(SELECTORS.messagesList);
  
  // If not found, try alternative selectors
  if (!messagesList) {
    // Try finding messages by class names (Gmail often uses these)
    messagesList = document.querySelector('[role="main"] [role="list"]') ||
                   document.querySelector('.AO .nH') ||
                   document.querySelector('[role="main"]');
  }
  
  if (!messagesList) {
    throw new Error('Messages list not found');
  }
  
  // Find messages - try multiple approaches
  let messages = messagesList.querySelectorAll('[role="listitem"]');
  
  // If no messages with listitem role, try other selectors
  if (messages.length === 0) {
    messages = messagesList.querySelectorAll('.gs') || // Gmail message class
               messagesList.querySelectorAll('.adn') || // Alternative message class
               messagesList.querySelectorAll('[data-message-id]'); // Messages with ID
  }
  
  if (messages.length === 0) {
    throw new Error('No messages found in thread');
  }
  
  const lastMessage = messages[messages.length - 1];
  
  const isExpanded = lastMessage.querySelector(SELECTORS.expandedMessageIndicator);
  if (!isExpanded) {
    const expandButton = lastMessage.querySelector('[aria-label*="Expand"]') || 
                        lastMessage.querySelector('[role="button"]');
    if (expandButton) {
      simulateClick(expandButton);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return lastMessage;
}

async function findReplyButton(messageElement) {
  logger.log('Finding reply button...');
  
  // Try standard selectors first
  let replyButton = messageElement.querySelector(SELECTORS.replyButton);
  
  if (!replyButton) {
    replyButton = messageElement.querySelector(SELECTORS.replyButtonAlt);
  }
  
  // Try Gmail-specific class selectors
  if (!replyButton) {
    replyButton = messageElement.querySelector('.aaq') || // Gmail reply button class
                  messageElement.querySelector('.T-I-Js-IF.aaq'); // More specific
  }
  
  // Search through all buttons
  if (!replyButton) {
    const buttons = messageElement.querySelectorAll('[role="button"], .T-I');
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label') || '';
      const tooltip = button.getAttribute('data-tooltip') || '';
      const className = button.className || '';
      
      if ((ariaLabel.includes('Reply') || 
           tooltip.includes('Reply') || 
           className.includes('aaq')) && 
          !ariaLabel.includes('Reply all') && 
          !tooltip.includes('Reply all') &&
          !className.includes('aab')) { // Exclude reply all button
        replyButton = button;
        break;
      }
    }
  }
  
  if (!replyButton) {
    throw new Error('Reply button not found');
  }
  
  // Ensure button is visible and enabled
  if (replyButton.hasAttribute('aria-disabled') && 
      replyButton.getAttribute('aria-disabled') === 'true') {
    throw new Error('Reply button is disabled');
  }
  
  return replyButton;
}

async function waitForComposeArea() {
  logger.log('Waiting for compose area...');
  
  const composeArea = await waitForElement(SELECTORS.composeArea, {
    timeout: 5000
  });
  
  await waitForCondition(() => {
    const area = document.querySelector(SELECTORS.composeArea);
    return area && area.getAttribute('contenteditable') === 'true';
  });
  
  return composeArea;
}

async function checkGmailState() {
  const state = {
    isThreadView: false,
    hasMessages: false,
    composeAreaVisible: false
  };
  
  const threadContainer = document.querySelector(SELECTORS.threadContainer);
  if (threadContainer) {
    state.isThreadView = true;
    
    const messagesList = threadContainer.querySelector(SELECTORS.messagesList);
    if (messagesList) {
      state.hasMessages = messagesList.children.length > 0;
    }
    
    const composeArea = document.querySelector(SELECTORS.composeArea);
    if (composeArea) {
      state.composeAreaVisible = true;
    }
  }
  
  return state;
}

async function waitForElement(selector, options = {}) {
  const {
    parent = document,
    timeout = 10000,
    retryConfig = RETRY_CONFIG
  } = options;
  
  let attempts = 0;
  let delay = retryConfig.initialDelay;
  const startTime = Date.now();
  
  while (attempts < retryConfig.maxAttempts && (Date.now() - startTime) < timeout) {
    const element = parent.querySelector(selector);
    if (element) {
      return element;
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    attempts++;
    delay = Math.min(delay * retryConfig.backoffFactor, retryConfig.maxDelay);
  }
  
  throw new Error(`Element not found: ${selector}`);
}

async function waitForCondition(conditionFn, options = {}) {
  const {
    timeout = 10000,
    retryConfig = RETRY_CONFIG
  } = options;
  
  let attempts = 0;
  let delay = retryConfig.initialDelay;
  const startTime = Date.now();
  
  while (attempts < retryConfig.maxAttempts && (Date.now() - startTime) < timeout) {
    if (await conditionFn()) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    attempts++;
    delay = Math.min(delay * retryConfig.backoffFactor, retryConfig.maxDelay);
  }
  
  throw new Error('Condition not met within timeout');
}

function simulateClick(element) {
  const events = ['mousedown', 'mouseup', 'click'];
  
  events.forEach(eventType => {
    const event = new MouseEvent(eventType, {
      view: window,
      bubbles: true,
      cancelable: true,
      buttons: 1
    });
    element.dispatchEvent(event);
  });
}

function setTextContent(element, text) {
  element.focus();
  
  // Clear existing content
  element.innerHTML = '';
  
  // Split text by newlines and create proper Gmail formatting
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.trim()) {
      element.appendChild(document.createTextNode(line));
    }
    // Add line breaks between lines (except after the last line)
    if (index < lines.length - 1) {
      element.appendChild(document.createElement('br'));
    }
  });
  
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  element.dispatchEvent(inputEvent);
  
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  element.dispatchEvent(changeEvent);
}