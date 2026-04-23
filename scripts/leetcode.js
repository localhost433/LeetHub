/*
  LeetHub - Content Script
  Orchestrates the submission process using Adapters and Services.
*/

(async function () {
  console.log('LeetHub: Initializing...');

  // 1. Dependency Check
  // We expect these to be loaded by manifest.json before this script runs
  if (!window.LeetHubGitHubService || !window.LeetHubLeetCodeAdapter || !window.LeetHubStorageService) {
    console.error('LeetHub: Critical dependencies missing.');
    return;
  }

  const Adapter = window.LeetHubLeetCodeAdapter;
  const GitHub = window.LeetHubGitHubService;
  const Storage = window.LeetHubStorageService;

  // 2. Configuration (Lazy Read)
  const config = await Storage.get(['leethub_token', 'leethub_hook']);
  if (!config.leethub_token) {
    console.log('LeetHub: No token found, skipping');
    return;
  }

  /* Sync any existing solutions (import) if configured */
  if (typeof maybeImportExistingLeetCodeSolutions === 'function') {
    maybeImportExistingLeetCodeSolutions();
  }

  /* Listen for manual import triggers from popup */
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'LEETHUB_IMPORT_NOW') {
      console.log('LeetHub: Manual import triggered');
      if (typeof maybeImportExistingLeetCodeSolutions === 'function') {
        maybeImportExistingLeetCodeSolutions();
      }
    }
  });

  // 3. Observer - specific targeting
  const observer = new MutationObserver(handleMutations);
  
  // Only observe the specific app container usually found in LeetCode
  // LeetCode's SPA root is usually #app or body if not found
  const appNode = document.querySelector('#app') || document.body;
  if(appNode) {
      observer.observe(appNode, { childList: true, subtree: true });
  }

  let debounce = null;

  function handleMutations(mutations) {
    // FAST FAIL: specific success modal or result element directly
    // Do NOT iterate mutations unless absolutely necessary for granular diffing
    
    // Selectors for success elements on LeetCode
    const successSelectors = [
         '[data-e2e-locator="submission-result-success"]', // New UI
        '.success-element', // Old UI
        'div.success', // Generic
    ];

    const successElem = document.querySelector(successSelectors.join(','));
    
    // Also check for the "Accepted" text in the result-state if element exists
    const resultState = document.getElementById('result-state');
    const isAccepted = resultState && (resultState.innerText === 'Accepted' || resultState.className.includes('success'));

    if ((successElem || isAccepted) && !debounce) {
        console.log('LeetHub: Submission detected.');
        debounce = setTimeout(() => {
            processSubmission();
            debounce = null; 
        }, 2000); // Wait for animation/data to settle
    }
  }

  async function processSubmission() {
    try {
      console.log('LeetHub: Processing submission...');
      
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
      const title = problemData ? problemData.title : problemSlug; 

      // Determine extension
      const extension = getExtension(); 
      const filename = `${title.replace(/\s+/g, '-')}${extension}`; 
      const msg = `Time: ${data.runtime}, Memory: ${data.memory} - LeetHub`;

      // Upload Code
      /* The GitHub service currently expects individual params, not a data object. 
         We should use the existing sendMessage method or the properties exposed on window.LeetHubGitHubService 
         checking github-service.js: it exposes `sendMessage` but also `uploadSolution`?
         Ah, github-service.js in the earlier read_file output only showed `sendMessage` clearly in the top.
         Let's assume we use sendMessage to keep it simple and aligned with background.js handling 'upload'
      */
      
      await chrome.runtime.sendMessage({
          action: 'upload',
          content: data.code,
          directory: title, // Folder name
          filename: filename,
          msg: msg,
          hook: config.leethub_hook,
          // We can add SHA management if we want to update, but let's stick to simple upload first
      });
      
      console.log('LeetHub: Code uploaded successfully');

      // Upload README 
      if (problemData && problemData.markdown) {
          await chrome.runtime.sendMessage({
            action: 'upload',
            content: problemData.markdown,
            directory: title,
            filename: 'README.md',
            msg: msg, 
            hook: config.leethub_hook
          });
          console.log('LeetHub: README uploaded successfully');
      }

    } catch (err) {
      console.error('LeetHub: Submission handling failed', err);
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

})();
