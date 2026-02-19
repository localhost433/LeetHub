// Service for handling chrome.storage interactions
// Encapsulates keys and access patterns
(function(window) {
  const StorageService = {
    // Keys used in local storage
    KEYS: {
      TOKEN: 'leethub_token',
      HOOK: 'leethub_hook',
      MODE: 'mode_type',
      STATS: 'stats'
    },

    /**
     * Safely get values from chrome.storage.local
     * @param {string|string[]} keys 
     * @returns {Promise<object|null>}
     */
    async get(keys) {
      if (
        !window.chrome ||
        !window.chrome.storage ||
        !window.chrome.storage.local ||
        typeof window.chrome.storage.local.get !== 'function'
      ) {
        return null;
      }
      try {
        return await new Promise((resolve) => {
          window.chrome.storage.local.get(keys, (result) => resolve(result));
        });
      } catch (e) {
        console.error('StorageService: Failed to get data', e);
        return null; // Return null on error
      }
    },

    /**
     * Set values in chrome.storage.local
     * @param {object} data 
     * @returns {Promise<void>}
     */
    async set(data) {
       if (
        !window.chrome ||
        !window.chrome.storage ||
        !window.chrome.storage.local ||
        typeof window.chrome.storage.local.set !== 'function'
      ) {
        return;
      }
      try {
        return await new Promise((resolve) => {
          window.chrome.storage.local.set(data, () => {
             if (window.chrome.runtime.lastError) {
               console.error('StorageService: Set error', window.chrome.runtime.lastError);
             }
             resolve();
          });
        });
      } catch (e) {
        console.error('StorageService: Failed to set data', e);
      }
    },
    
    // Specific helpers
    async getStats() {
      const result = await this.get(this.KEYS.STATS);
      return result ? result[this.KEYS.STATS] : null;
    },

    async updateStats(newStats) {
      await this.set({ [this.KEYS.STATS]: newStats });
    }
  };

  // Expose globally
  window.LeetHubStorageService = StorageService;

})(window);
