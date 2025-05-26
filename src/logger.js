// Debug logging system with toggle
class Logger {
  constructor() {
    this.enabled = false;
    this.logPrefix = '[CargoReimagined Extension]';
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['debugLogging']);
      this.enabled = result.debugLogging || false;
    } catch (e) {
      // Storage might not be available in content scripts immediately
      this.enabled = false;
    }
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    try {
      await chrome.storage.local.set({ debugLogging: enabled });
    } catch (e) {
      console.warn('Failed to save debug setting:', e);
    }
  }

  log(...args) {
    if (this.enabled) {
      console.log(this.logPrefix, ...args);
    }
  }

  info(...args) {
    if (this.enabled) {
      console.info(this.logPrefix, '[INFO]', ...args);
    }
  }

  warn(...args) {
    if (this.enabled) {
      console.warn(this.logPrefix, '[WARN]', ...args);
    }
  }

  error(...args) {
    // Always log errors
    console.error(this.logPrefix, '[ERROR]', ...args);
  }

  group(label) {
    if (this.enabled) {
      console.group(this.logPrefix + ' ' + label);
    }
  }

  groupEnd() {
    if (this.enabled) {
      console.groupEnd();
    }
  }

  table(data) {
    if (this.enabled) {
      console.table(data);
    }
  }

  time(label) {
    if (this.enabled) {
      console.time(this.logPrefix + ' ' + label);
    }
  }

  timeEnd(label) {
    if (this.enabled) {
      console.timeEnd(this.logPrefix + ' ' + label);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = logger;
}