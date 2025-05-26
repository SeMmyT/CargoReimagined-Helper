# ProExpedite Gmail Helper Chrome Extension

This Chrome extension enhances Gmail interaction for ProExpedite cargo bidding workflows.

## Features

- Open Gmail threads directly from ProExpedite web app
- Automatically prepare replies with bid text
- Multi-profile Gmail account support
- Robust error handling and retry mechanisms

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `extension` directory from this project
5. Note the Extension ID displayed (you'll need this for testing)

### Testing

1. Open `extension/test/test-page.html` in Chrome
2. Replace `YOUR_EXTENSION_ID_HERE` in `test-integration.js` with your actual extension ID
3. Ensure you're logged into Gmail
4. Use the test interface to verify functionality

## Usage

The extension works by receiving messages from the ProExpedite web app:

### Open Gmail Thread
```javascript
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: 'OPEN_GMAIL_THREAD',
  payload: {
    threadId: '17abc123def',
    emailAddress: 'user@gmail.com',
    originalMessageId: 'optional-message-id'
  }
});
```

### Reply to Gmail Thread
```javascript
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: 'REPLY_TO_GMAIL_THREAD',
  payload: {
    threadId: '17abc123def',
    emailAddress: 'user@gmail.com',
    bidText: 'Your bid message here',
    originalMessageId: 'optional-message-id'
  }
});
```

## Development

### File Structure
- `manifest.json` - Extension configuration
- `src/background.js` - Service worker handling external messages
- `src/content_script_gmail.js` - Gmail DOM automation
- `popup.html/js` - Extension popup UI
- `test/` - Test files for development

### Adding Icons
Replace placeholder files in `assets/` with actual PNG icons:
- `icon-16.png` - 16x16 pixels
- `icon-48.png` - 48x48 pixels  
- `icon-128.png` - 128x128 pixels

## Troubleshooting

### Extension not responding
1. Check if extension is enabled in `chrome://extensions/`
2. Verify the sender domain matches `externally_connectable` in manifest
3. Check Chrome DevTools console for errors

### Gmail automation failing
1. Ensure you're logged into Gmail
2. Check if Gmail UI has changed (may need selector updates)
3. Verify content script is injected (check console in Gmail tab)

### Multi-profile issues
- Extension validates tabs to avoid cross-profile access
- Ensure the correct Gmail account is active