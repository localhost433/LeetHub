/*
  LeetHub - Content Script
  Detects new accepted submissions via URL changes and uploads them to GitHub.
  Uses the same GraphQL/REST utilities as the import flow (common.js).
*/

(async function () {
  console.log('LeetHub: Initializing...');

  // Expect safeStorageGet/safeStorageSet, leetCodeGraphQL, fetchLeetCodeSubmissionCodeGraphQL,
  // fetchLeetCodeSubmissionDetail, githubPutContent, buildLeetCodeFolderName, padProblemId,
  // appendSubmissionIdToFilename, hasSubmissionIdShaForFolder, hasAnyCodeShaForFolder,
  // langToExt — all loaded via manifest before this script.

  const config = await safeStorageGet(['leethub_token', 'leethub_hook']);
  if (!config.leethub_token || !config.leethub_hook) {
    console.log('LeetHub: No token/hook found, skipping submission watcher');
    return;
  }

  /* Trigger bulk import if needed */
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

  // Submission detail URL pattern: /problems/{slug}/submissions/{id}/
  const SUBMISSION_URL_RE = /\/problems\/([^/]+)\/submissions\/(\d+)\/?/;

  let lastUrl = location.href;
  let lastProcessedId = null;

  // Intercept history.pushState / replaceState so we never miss URL changes
  // that happen without a subsequent DOM mutation (common in React/Next.js SPAs).
  function onUrlChange() {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      maybeHandleUrl(url);
    }
  }

  const _origPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPush(...args);
    onUrlChange();
  };
  const _origReplace = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    _origReplace(...args);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);

  // MutationObserver as a belt-and-suspenders fallback
  const navObserver = new MutationObserver(onUrlChange);
  navObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Also handle direct load onto a submission URL
  maybeHandleUrl(location.href);

  function maybeHandleUrl(url) {
    const m = url.match(SUBMISSION_URL_RE);
    if (!m) return;
    const slug = m[1];
    const submissionId = m[2];
    if (submissionId === lastProcessedId) return;
    lastProcessedId = submissionId;
    // Small delay so LeetCode's own fetch has time to complete
    setTimeout(() => processSubmission(slug, submissionId), 1500);
  }

  async function processSubmission(slug, submissionId) {
    try {
      console.log(`LeetHub: Processing submission ${submissionId} for ${slug}`);

      const data = await safeStorageGet(['leethub_token', 'leethub_hook', 'stats']);
      if (!data.leethub_token || !data.leethub_hook) return;

      const token = data.leethub_token;
      const hook = data.leethub_hook;
      const stats =
        data.stats && typeof data.stats === 'object'
          ? data.stats
          : { solved: 0, easy: 0, medium: 0, hard: 0, sha: {} };
      if (!stats.sha || typeof stats.sha !== 'object') stats.sha = {};
      const shaMap = stats.sha;

      // Fetch submission (checks accepted status + gets code in one call)
      const submission = await fetchSubmissionDetails(submissionId);
      if (!submission) {
        console.log('LeetHub: Could not fetch submission details');
        return;
      }
      if (!submission.accepted) {
        console.log('LeetHub: Submission not accepted, skipping');
        return;
      }
      if (!submission.code) {
        console.log('LeetHub: No code in submission');
        return;
      }

      // Fetch problem metadata
      const problem = await fetchProblemDetails(slug);
      const frontendId = problem?.frontendId;
      const title = problem?.title || slug;
      const difficulty = problem?.difficulty || '';

      const folder = buildLeetCodeFolderName(frontendId, slug);
      if (!folder) {
        console.log('LeetHub: Could not build folder name');
        return;
      }

      // Dedup: already uploaded this exact submission?
      if (hasSubmissionIdShaForFolder(shaMap, folder, submissionId)) {
        console.log('LeetHub: Already uploaded submission', submissionId);
        return;
      }

      const ext = langToExt(submission.lang);
      if (!ext) {
        console.log('LeetHub: Unknown language', submission.lang);
        return;
      }

      const codeFilename = appendSubmissionIdToFilename(`${folder}${ext}`, submissionId);
      const codeFilePathKey = `${folder}/${codeFilename}`;
      const readmeKey = `${folder}/README.md`;
      const codeSha = shaMap[codeFilePathKey] || null;
      const readmeSha = shaMap[readmeKey] || null;
      const hadAnyCodeBefore = hasAnyCodeShaForFolder(shaMap, folder);

      const commitMsg = buildCommitMsg(title, difficulty, submission.runtimePercentile, submission.memoryPercentile);
      const readmeContent = `# ${padProblemId(frontendId) || ''}. ${title}\n## ${difficulty}\n\nhttps://leetcode.com/problems/${slug}/\n`;

      // Upload README (best-effort)
      const readmeRes = await githubPutContent({
        token,
        hook,
        directory: folder,
        filename: 'README.md',
        contentBase64: btoa(unescape(encodeURIComponent(readmeContent))),
        message: readmeMsg,
        sha: readmeSha,
      });
      if (readmeRes.ok && readmeRes.sha) {
        shaMap[readmeKey] = readmeRes.sha;
      }

      // Upload code
      const codeRes = await githubPutContent({
        token,
        hook,
        directory: folder,
        filename: codeFilename,
        contentBase64: btoa(unescape(encodeURIComponent(submission.code))),
        message: commitMsg,
        sha: codeSha,
      });

      if (!codeRes.ok) {
        console.error('LeetHub: Code upload failed', codeRes.status, codeRes.json);
        return;
      }

      if (codeRes.sha) shaMap[codeFilePathKey] = codeRes.sha;

      // Update problem stats once per problem (first time we have any code)
      if (!hadAnyCodeBefore && !codeSha) {
        stats.solved = (stats.solved || 0) + 1;
        if (difficulty === 'Easy') stats.easy = (stats.easy || 0) + 1;
        else if (difficulty === 'Medium') stats.medium = (stats.medium || 0) + 1;
        else if (difficulty === 'Hard') stats.hard = (stats.hard || 0) + 1;
      }

      stats.sha = shaMap;
      await safeStorageSet({ stats });
      console.log(`LeetHub: Successfully uploaded ${folder}/${codeFilename}`);
    } catch (err) {
      console.error('LeetHub: processSubmission failed', err);
    }
  }

  function buildCommitMsg(title, difficulty, runtimePct, memoryPct) {
    let msg = `${submitMsg} - ${title}`;
    if (difficulty) msg += ` | ${difficulty}`;
    if (runtimePct != null) msg += ` | Runtime: ${runtimePct.toFixed(2)}%`;
    if (memoryPct != null) msg += ` | Memory: ${memoryPct.toFixed(2)}%`;
    return msg;
  }

  /**
   * Fetch submission details via GraphQL.
   * Returns { accepted, code, lang, runtimePercentile, memoryPercentile } or null on failure.
   * Falls back to REST API if GraphQL returns no code.
   */
  async function fetchSubmissionDetails(submissionId) {
    const idNum = Number(submissionId);
    const query =
      'query leethubSubDetails($submissionId: Int!) { submissionDetails(submissionId: $submissionId) { statusCode code lang { name } runtimePercentile memoryPercentile } }';

    const res = await leetCodeGraphQL(query, { submissionId: idNum });
    const d = res?.json?.data?.submissionDetails;

    if (d && typeof d.code === 'string' && d.code.length > 0) {
      return {
        accepted: d.statusCode === 10,
        code: d.code,
        lang: d.lang?.name || '',
        runtimePercentile: d.runtimePercentile ?? null,
        memoryPercentile: d.memoryPercentile ?? null,
      };
    }

    // GraphQL returned no code — fall back to REST
    const rest = await fetchLeetCodeSubmissionDetail(submissionId);
    if (!rest.ok || !rest.code) return null;

    // REST API doesn't reliably return statusCode; assume accepted if we got code
    // (non-accepted submissions rarely have browseable detail pages for non-owners)
    return {
      accepted: true,
      code: rest.code,
      lang: rest.lang || '',
      runtimePercentile: null,
      memoryPercentile: null,
    };
  }

  /**
   * Fetch problem title, frontendId, and difficulty via GraphQL.
   */
  async function fetchProblemDetails(titleSlug) {
    const query =
      'query leethubProblem($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title difficulty } }';
    const res = await leetCodeGraphQL(query, { titleSlug });
    const q = res?.json?.data?.question;
    if (!q) return null;
    return {
      frontendId: q.questionFrontendId,
      title: q.title,
      difficulty: q.difficulty,
    };
  }
})();
