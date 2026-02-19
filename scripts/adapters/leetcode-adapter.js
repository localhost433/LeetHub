// Adapter for LeetCode DOM interactions
(function(window) {

  const LeetCodeAdapter = {
    /**
     * Get the submission details URL from the current page
     * @returns {string|null}
     */
    getSubmissionUrl() {
      // 1. Try explicit status column (in submission list)
      const statusRow = document.querySelector('.status-column__3SUg');
      if (statusRow) {
        const link = statusRow.querySelector('a'); 
        if (link) return link.href;
      }
      
      // 2. Try 'result-state' (in explore or success modal)
      const resultState = document.getElementById('result-state');
      if (resultState && resultState.href) {
        return resultState.href;
      }

      // 3. Fallback: Parse from URL if we are ON the submission page
      if (window.location.href.includes('/submissions/detail/')) {
        return window.location.href;
      }

      return null;
    },

    /**
     * Fetch submission details (code, runtime, memory) from LeetCode
     * @param {string} url 
     * @returns {Promise<object>} { code, runtime, memory }
     */
    async fetchSubmissionData(url) {
      if (!url) throw new Error('No submission URL provided');

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch submission: ${response.status}`);
        
        const html = await response.text();
        return this._parseSubmissionHtml(html);
      } catch (error) {
        console.error('LeetCodeAdapter: Fetch failed', error);
        throw error;
      }
    },

    _parseSubmissionHtml(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const scripts = doc.querySelectorAll('script');
      
      let code = null;
      let runtime = 'Unknown';
      let memory = 'Unknown';

      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('pageData')) {
          // Extract code with regex
          const codeMatch = text.match(/submissionCode:\s*'([^']+)'/);
          if (codeMatch && codeMatch[1]) {
            code = this._decodeUnicode(codeMatch[1]);
          }

          // Extract stats if available in the same block
          const runtimeMatch = text.match(/runtime:\s*'([^']+)'/);
          if (runtimeMatch) runtime = runtimeMatch[1];

          const memoryMatch = text.match(/memory:\s*'([^']+)'/);
          if (memoryMatch) memory = memoryMatch[1];
          
          if (code) break;
        }
      }

      if (!code) {
        // Fallback or error?
        // Sometimes code is not in pageData for newer views?
        // But for now we stick to original logic.
        throw new Error('Code not found in submission page');
      }

      return { code, runtime, memory };
    },

    _decodeUnicode(str) {
      // Decode unicode characters like \u003C
      try {
        return JSON.parse(`"${str}"`); 
      } catch (e) {
        return str;
      }
    },

    /**
     * Get the problem slug/title from the current page
     */
    getProblemSlug() {
      // Extract from URL: leetcode.com/problems/two-sum/...
      const match = window.location.pathname.match(/problems\/([^\/]+)/);
      if (match && match[1]) {
        return match[1];
      }
      return 'unknown-problem';
    },

    /**
     * Get problem difficulty
     */
    getDifficulty() {
      // Try generic classes
      if (document.querySelector('.css-t42afm')) return 'Hard'; // These generate classes are bad
      if (document.querySelector('.css-dcmtd5')) return 'Medium';
      if (document.querySelector('.css-14oi08n')) return 'Easy';

      // Try text content if classes fail
      const difficultyElem = document.querySelector('[diff]'); 
      if (difficultyElem) return difficultyElem.getAttribute('diff');
      
      return 'Unknown';
    },

    /**
     * Get problem description and difficulty for README
     */
    getProblemData() {
      const qTitleElem = document.querySelector('[data-cy="question-title"]') || 
                         document.querySelector('.question-title') ||
                         document.querySelector('.css-v3d350');
      
      const qBodyElem = document.querySelector('[data-key="description-content"]') ||
                        document.querySelector('.question-content__JfgR') || 
                        document.querySelector('.content__u3I1');

      if (!qTitleElem || !qBodyElem) {
        return null;
      }

      const title = qTitleElem.textContent;
      const body = qBodyElem.innerHTML;
      const difficulty = this.getDifficulty();
      
      // Basic markdown formatting
      const markdown = `<h2><a href="${window.location.href}">${title}</a></h2><h3>${difficulty}</h3><hr>${body}`;
      
      return { 
        title, 
        body, 
        difficulty, 
        markdown 
      };
    },

  };

  window.LeetHubLeetCodeAdapter = LeetCodeAdapter;

})(window);
