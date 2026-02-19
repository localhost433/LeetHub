// Service for handling GitHub Uploads and API interactions
(function(window) {

  // Dependency: LeetHubStorageService must be available
  const getStorageService = () => window.LeetHubStorageService || {
      get: async () => null,
      getStats: async () => null,
      updateStats: async () => {}
  };

  const GitHubService = {
     /**
     * Send upload message to background script
     * @param {string} token 
     * @param {string} hook 
     * @param {string} code 
     * @param {string} directory 
     * @param {string} filename 
     * @param {string} sha 
     * @param {string} msg 
     * @returns {Promise<any>}
     */
    async sendMessage(token, hook, code, directory, filename, sha, msg) {
      if (!window.chrome || !window.chrome.runtime) {
        throw new Error("Chrome API unavailable");
      }
      
      return new Promise((resolve) => {
        window.chrome.runtime.sendMessage({
          action: 'upload',
          content: code,
          directory,
          filename,
          msg,
          sha,
          hook,
        }, (response) => {
           if (window.chrome.runtime.lastError) {
             console.error('GitHubService: Message failed', window.chrome.runtime.lastError);
             resolve({ status: 500, error: window.chrome.runtime.lastError.message });
           } else {
             resolve(response);
           }
        });
      });
    },

    /**
     * Upload or update a file on GitHub 
     * Handles getting stats, checking SHAs, and updating stats.
     */
    async uploadSolution(code, problemName, fileName, msg, action, difficulty = 'Unknown') {
      try {
        const settings = await getStorageService().get([
          'leethub_token',
          'mode_type',
          'leethub_hook',
          'stats',
        ]);
        
        const { leethub_token, mode_type, leethub_hook, stats } = settings || {};

        if (!leethub_token || !leethub_hook) {
          console.error("LeetHub: Missing token or hook configuration.");
          return; 
        }

        if (mode_type !== 'commit') {
             console.log("LeetHub: Mode is not 'commit', skipping upload.");
             return;
        }

        const filePath = problemName + fileName;
        let sha = null;

        if (
          stats &&
          stats.sha &&
          stats.sha[filePath]
        ) {
          sha = stats.sha[filePath];
        }

        // Encode content to Base64 (handle Unicode)
        const encodedContent = btoa(unescape(encodeURIComponent(code)));

        const response = await this.sendMessage(
            leethub_token,
            leethub_hook,
            encodedContent,
            problemName,
            fileName,
            sha,
            msg
        );

        if (response && (response.status === 200 || response.status === 201)) {
            await this._handleSuccess(response, problemName, fileName, difficulty, sha);
        } else {
             console.error("LeetHub: Upload failed", response);
        }

      } catch (error) {
        console.error("LeetHub: GitHub Service Error", error);
      }
    },

    async _handleSuccess(response, problemName, fileName, difficulty, previousSha) {
        const updatedSha = response.data && response.data.content ? response.data.content.sha : null;
        if (!updatedSha) return;

        const statData = (await getStorageService().getStats()) || {
            solved: 0,
            easy: 0,
            medium: 0,
            hard: 0,
            sha: {},
        };

        if (!statData.sha) statData.sha = {};

        const filePath = problemName + fileName;
        
        // Only increment stats if it's a new solution (README usually means first time solve)
        // or specifically tracked logic. The original logic was:
        // if (fileName === 'README.md' && !sha) ...
        if (fileName === 'README.md' && !previousSha) {
          statData.solved = Number(statData.solved || 0) + 1;
          statData.easy += difficulty === 'Easy' ? 1 : 0;
          statData.medium += difficulty === 'Medium' ? 1 : 0;
          statData.hard += difficulty === 'Hard' ? 1 : 0;
        }
        
        statData.sha[filePath] = updatedSha;
        await getStorageService().updateStats(statData);
        
        console.log(`LeetHub: Successfully processed ${fileName}`);
    }
  };

  window.LeetHubGitHubService = GitHubService;

})(window);
