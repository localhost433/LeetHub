/*
  LeetHub - Content Script
  Orchestrates the submission process using Adapters and Services.
*/

(function () {
  // Use getters to ensure late binding if scripts load async (though manifest order should handle it)
  const getAdapter = () => window.LeetHubLeetCodeAdapter;
  const getGitHub = () => window.LeetHubGitHubService;
  const getStorage = () => window.LeetHubStorageService;

  let debounceTimer = null;
  let isProcessing = false;

  // Sync storage on startup
  async function syncStorage() {
    const Storage = getStorage();
    if (!Storage) return;

    const keys = [
      'leethub_token',
      'leethub_username',
      'pipe_leethub',
      'stats',
      'leethub_hook',
      'mode_type',
    ];
    
    const localData = await Storage.get('isSync');
    if (!localData || !localData.isSync) {
        if (chrome.storage.sync) {
            chrome.storage.sync.get(keys, async (data) => {
                if (data) {
                    await Storage.set(data);
                    await Storage.set({ isSync: true });
                    console.log('LeetHub: Synced settings to local storage');
                }
            });
        }
    }
  }

  // Check if we just submitted successfully
  function checkForSuccess(mutations) {
    if (isProcessing) return;

    let isSuccess = false;
    
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            const addedNodes = Array.from(mutation.addedNodes);
            for (const node of addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                
                // Generic check for "Success" or "Accepted" text
                if (node.textContent.includes('Success') || node.textContent.includes('Accepted')) {
                     // Check common success containers
                     if (
                         node.className.includes('success') ||
                         node.querySelector('.success-element') || 
                         node.querySelector('[data-e2e-locator="submission-result-success"]')
                     ) {
                         isSuccess = true;
                         break;
                     }
                     // Fallback: check if we are on submission URL and see "Accepted"
                     if (window.location.href.includes('/submissions/') && node.textContent.includes('Accepted')) {
                        isSuccess = true;
                        break;
                     }
                }
            }
        }
        if (isSuccess) break;
    }

    // Double check document state
    if (!isSuccess) {
       const resultState = document.getElementById('result-state');
       if (resultState && (resultState.innerText === 'Accepted' || resultState.className.includes('success'))) {
           isSuccess = true;
       }
    }

    if (isSuccess) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleSubmission();
      }, 2000); 
    }
  }

  async function handleSubmission() {
    if (isProcessing) return;
    isProcessing = true;
    const Adapter = getAdapter();
    const GitHub = getGitHub();

    try {
      console.log('LeetHub: Detecting submission...');
      
      const submissionUrl = Adapter.getSubmissionUrl();
      if (!submissionUrl) {
          console.log('LeetHub: No submission URL found.');
          return;
      }

      // Fetch submission code
      const data = await Adapter.fetchSubmissionData(submissionUrl);
      if (!data || !data.code) {
          throw new Error('No code found in submission');
      }

      // Fetch problem details
      const problemData = Adapter.getProblemData();
      const difficulty = problemData ? problemData.difficulty : Adapter.getDifficulty();
      const problemSlug = Adapter.getProblemSlug();
      const title = problemData ? problemData.title : problemSlug; // for logging

      // Determine extension
      const extension = getExtension(); 
      const filename = `${title.replace(/\s+/g, '-')}${extension}`; // Basic safeguard
      const msg = `Time: ${data.runtime}, Memory: ${data.memory} - LeetHub`;

      // Upload Code
      await GitHub.uploadSolution(
          data.code,
          title, // problemName in github-service actually means folder name usually
          filename,
          msg,
          'upload', 
          difficulty
      );

      // Upload README 
      if (problemData && problemData.markdown) {
          await GitHub.uploadSolution(
            problemData.markdown,
            title,
            'README.md',
            msg, 
            'upload',
            difficulty
          );
      }

    } catch (err) {
      console.error('LeetHub: Submission handling failed', err);
    } finally {
      isProcessing = false;
    }
  }
  
  function getExtension() {
      const languageElem = document.querySelector('.ant-select-selection-selected-value') || 
                           document.querySelector('[data-cy="lang-select"]');
      const lang = languageElem ? languageElem.innerText : 'python3'; 
      
      const map = {
          'C++': '.cpp',
          'Java': '.java',
          'Python': '.py',
          'Python3': '.py',
          'C': '.c',
          'C#': '.cs',
          'JavaScript': '.js',
          'Ruby': '.rb',
          'Swift': '.swift',
          'Go': '.go',
          'Scala': '.scala',
          'Kotlin': '.kt',
          'Rust': '.rs',
          'PHP': '.php',
          'TypeScript': '.ts',
          'Racket': '.rkt',
          'Erlang': '.erl',
          'Elixir': '.ex',
          'Dart': '.dart'
      };
      return map[lang] || '.txt';
  }

  // --- Initialization ---
  
  // Wait for window load just in case
  if (document.readyState === 'loading') {    
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    syncStorage();
    
    // Manual Import Listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === 'LEETHUB_IMPORT_NOW') {
            console.log('LeetHub: Manual import triggered');
            if (typeof maybeImportExistingLeetCodeSolutions === 'function') {
                maybeImportExistingLeetCodeSolutions().catch(console.error);
                sendResponse({ ok: true });
            } else {
                console.error('LeetHub: Import function not found');
                sendResponse({ ok: false, error: 'Import script not loaded' });
            }
            return true;
        }
        if (message && message.type === 'LEETHUB_IMPORT_STATUS_PING') {
             sendResponse({ ok: true });
             return true;
        }
    });
    
    const observer = new MutationObserver(checkForSuccess);
    if (document.body) {
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        console.log('LeetHub: Observer started');
    } else {
        console.error('LeetHub: document.body not available');
    }

    injectStyles();
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .leethub_progress {
            pointer-events: none;
            width: 2.0em; height: 2.0em;
            border: 0.4em solid transparent; border-color: #eee;
            border-top-color: #3E67EC; border-radius: 50%;
            animation: loadingspin 1s linear infinite;
        } 
        @keyframes loadingspin { 100% { transform: rotate(360deg) }}
    `;
    document.head.append(style);
  }

})();
