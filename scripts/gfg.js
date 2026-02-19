/* Commit messages */
let START_MONITOR = true;




function findGfgLanguage() {
  const ele =
    document.getElementsByClassName('divider text')[0].innerText;
  const lang = ele.split('(')[0].trim();
  if (lang.length > 0 && languages[lang]) {
    return languages[lang];
  }
  return null;
}

function findTitle() {
  const ele = document.querySelector(
    '[class^="problems_header_content__title"] > h3',
  ).innerText;
  if (ele !== null && ele !== undefined) {
    return ele;
  }
  return '';
}

function findDifficulty() {
  const ele = document.querySelectorAll(
    '[class^="problems_header_description"]',
  )[0].children[0].innerText;

  if (ele !== null && ele !== undefined) {
    if (ele.trim() === 'Basic' || ele.trim() === 'School') {
      return 'Easy';
    }
    return ele;
  }
  return '';
}

function getProblemStatement() {
  const ele = document.querySelector(
    '[class^="problems_problem_content"]',
  );
  return `${ele.outerHTML}`;
}

function getCode() {
  const scriptContent = `
  try {
    const editor = ace.edit("ace-editor");
    const editorContent = editor.getValue();
    const para = document.createElement("pre");
    para.innerText = editorContent;
    para.setAttribute("id","codeDataLeetHub");
    document.body.appendChild(para);
  } catch (e) {}
  `;

  const script = document.createElement('script');
  script.id = 'tmpScript';
  script.appendChild(document.createTextNode(scriptContent));
  (
    document.body ||
    document.head ||
    document.documentElement
  ).appendChild(script);
  const node = document.getElementById('codeDataLeetHub');
  const text = node ? node.innerText : '';
  if (node && node.parentNode) node.parentNode.removeChild(node);

  return text || '';
}

/* Monitor for GFG submission success */
const gfgObserver = new MutationObserver((mutations) => {
  if (
    !window.location.href.includes(
      'practice.geeksforgeeks.org/problems',
    )
  ) {
    return;
  }

  // Check if we need to attach listener to submit button
  const submitBtn = document
    .evaluate(
      ".//button[text()='Submit']",
      document.body,
      null,
      XPathResult.ANY_TYPE,
      null,
    )
    .iterateNext();

  if (
    submitBtn &&
    !submitBtn.hasAttribute('data-leethub-monitored')
  ) {
    submitBtn.setAttribute('data-leethub-monitored', 'true');
    submitBtn.addEventListener('click', function () {
      START_MONITOR = true;
      monitorSubmissionResult();
    });
  }
});

function monitorSubmissionResult() {
  const submissionObserver = new MutationObserver((mutations) => {
    const outputElem = document.querySelectorAll(
      '[class^="problems_content"]',
    );
    if (!outputElem || outputElem.length === 0) return;

    const output = outputElem[0].innerText;

    if (
      output.includes('Problem Solved Successfully') &&
      START_MONITOR
    ) {
      START_MONITOR = false;
      submissionObserver.disconnect();

      const title = findTitle().trim();
      const difficulty = findDifficulty();
      let problemStatement = getProblemStatement();
      let code = getCode();
      const language = findGfgLanguage();

      const probName = `${title} - GFG`;
      problemStatement = `# ${title}\n## ${difficulty}\n${problemStatement}`;

      // Use new GitHub Service
      // Ensure these global services are available (loaded via manifest)
      const GitHub = window.LeetHubGitHubService || { uploadSolution: async () => {} };

      if (language !== null) {
        // Upload README
        GitHub.uploadSolution(
          problemStatement, // pass raw string, service handles encoding
          probName,
          'README.md',
          readmeMsg,
          'upload',
          difficulty
        );

        if (code !== '') {
          setTimeout(function () {
            // Upload Code
            GitHub.uploadSolution(
              code, // pass raw string
              probName,
              toKebabCase(title + language),
              submitMsg,
              'upload',
              difficulty
            );
          }, 1000);
        }
      }
    } else if (output.includes('Compilation Error')) {
      submissionObserver.disconnect();
    } else if (
      !START_MONITOR &&
      (output.includes('Compilation Error') ||
        output.includes('Correct Answer'))
    ) {
      submissionObserver.disconnect();
    }
  });

  const targetNode = document.body; // Or a more specific container if generic enough
  submissionObserver.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Timeout to stop observing if nothing happens after 30s
  setTimeout(() => {
    submissionObserver.disconnect();
  }, 30000);
}

// Start monitoring
setTimeout(() => {
  gfgObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}, 1000);
