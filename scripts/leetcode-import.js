/* eslint-disable no-unused-vars */

// Imports from other scripts assumed global via manifest order:
// leetCodeApiLangToExt, normalizeLeetCodeImportSettings, appendSubmissionIdToFilename, 
// hasAnyCodeShaForFolder, hasSubmissionIdShaForFolder, isExtensionContextInvalidatedError, 
// safeStorageGet, safeStorageSet, getCookieValue, leetCodeFetchJson, fetchLeetCodeSubmissionDetail,
// fetchLeetCodeSubmissionCodeGraphQL, leetCodeGraphQL, githubPutContent, padProblemId, 
// buildLeetCodeFolderName, extractLeetCodeSubmissionCodeFromHtml, difficultyLabelFromLevel, 
// fetchAllSolvedProblems, fetchAcceptedSubmissionListGraphQL

/* Helper to map API language to extension */

function langToExt(apiLangRaw) {
  const apiLang = String(apiLangRaw || '')
    .trim()
    .toLowerCase();
  if (!apiLang) return null;

  if (leetCodeApiLangToExt && leetCodeApiLangToExt[apiLang])
    return leetCodeApiLangToExt[apiLang];

  // Common variants
  if (apiLang.startsWith('python')) return '.py';
  if (apiLang === 'py') return '.py';
  if (apiLang.includes('javascript')) return '.js';
  if (apiLang.includes('typescript')) return '.ts';
  if (apiLang.includes('csharp') || apiLang === 'c#') return '.cs';
  if (apiLang.includes('golang') || apiLang === 'go') return '.go';
  if (apiLang.includes('c++') || apiLang === 'cpp') return '.cpp';
  if (apiLang === 'mysql' || apiLang.includes('sql')) return '.sql';
  if (apiLang === 'bash' || apiLang === 'shell') return '.sh';

  return null;
}

async function maybeImportExistingLeetCodeSolutions() {
  // Prevent re-entry
  if (window.leetCodeImportInProgress) return;

  if (
    !document ||
    !document.location ||
    !String(document.location.host).includes('leetcode.com')
  )
    return;

  const data = await safeStorageGet([
    'leethub_token',
    'leethub_hook',
    'mode_type',
    'leetcode_import',
    'leetcode_import_settings',
  ]);
  if (!data) return;

  try {
    const token = data?.leethub_token;
    const hook = data?.leethub_hook;
    const mode = data?.mode_type;
    const importState = data?.leetcode_import || {};
    const settings = normalizeLeetCodeImportSettings(
      data?.leetcode_import_settings,
    );
    const done = importState && importState.done === true;

    // Auto-retry legacy runs that incorrectly ended as "done" with zero imports.
    const legacyDoneZero =
      done === true &&
      Number(importState.uploaded || 0) === 0 &&
      (!importState.strategy ||
        importState.strategy === 'submissions_api');

    if (
      !token ||
      !hook ||
      mode !== 'commit' ||
      (done && !legacyDoneZero)
    )
      return;

    if (window.leetCodeImportInProgress) return;

    window.leetCodeImportInProgress = true;
    try {
      const strategy = 'problems_all';
      const maxUploadsPerRun = 10;
      const startIndex = Number(importState.index || 0);
      const uploadedThisRun = new Set();

      const skip = {
        already_present: 0,
        no_meta: 0,
        no_accepted: 0,
        unauthorized: 0,
        unknown_lang: 0,
        no_code: 0,
        detail_http_401_403: 0,
        detail_http_404: 0,
        detail_http_429: 0,
        detail_http_302: 0,
        detail_http_other: 0,
        detail_http_200_no_code: 0,
        detail_graphql_fail: 0,
        detail_graphql_200_no_code: 0,
        detail_graphql_401_403: 0,
        detail_graphql_429: 0,
        detail_graphql_other: 0,
        detail_graphql_last_status: 0,
        detail_graphql_last_error: '',
        detail_html_200: 0,
        detail_html_404: 0,
        detail_html_other: 0,
        detail_html_has_next_data: 0,
        detail_html_has_submission_code: 0,
        detail_html_200_no_code: 0,
        github_fail: 0,
        github_401_403: 0,
        github_404: 0,
        github_409_422: 0,
        github_other: 0,
        github_last_status: 0,
        github_last_path: '',
        no_folder: 0,
      };

      let uploadedCount = Number(importState.uploaded || 0);

      // If hook changed underneath, restart.
      if (importState.hook && importState.hook !== hook) {
        uploadedCount = 0;
      }

      const wroteStart = await safeStorageSet({
        leetcode_import: {
          done: false,
          strategy,
          index: startIndex,
          total: 0,
          uploaded: uploadedCount,
          ts: Date.now(),
          phase: 'fetch_solved',
          hook,
        },
      });
      if (!wroteStart) return;

      const solvedResp = await fetchAllSolvedProblems();
      if (!solvedResp.ok) {
        await safeStorageSet({
          leetcode_import: {
            done: false,
            strategy,
            index: startIndex,
            total: 0,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'error',
            hook,
            last_http_status: solvedResp.status,
            last_error:
              'Failed to load solved problem list from LeetCode (are you logged in?)',
          },
        });
        return;
      }

      const solved = solvedResp.solved;
      const total = solved.length;
      if (!Array.isArray(solved) || total === 0) {
        await safeStorageSet({
          leetcode_import: {
            done: true,
            strategy,
            index: 0,
            total,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'done',
            hook,
            last_error:
              'No solved problems detected (or LeetCode returned none).',
          },
        });
        return;
      }

      const statsObj = (await safeStorageGet('stats')) || {};
      let stats = statsObj?.stats;
      if (
        !stats ||
        typeof stats !== 'object' ||
        Object.keys(stats).length === 0
      ) {
        stats = {
          solved: 0,
          easy: 0,
          medium: 0,
          hard: 0,
          sha: {},
        };
      }
      if (!stats.sha || typeof stats.sha !== 'object') stats.sha = {};
      const knownSha = stats.sha;

      let index = legacyDoneZero ? 0 : startIndex;
      let uploadsThisRun = 0;

      while (index < total && uploadsThisRun < maxUploadsPerRun) {
        const item = solved[index];
        const titleSlug = item.titleSlug;
        const folder = buildLeetCodeFolderName(
          item.frontendId,
          titleSlug,
        );
        const difficultyImport = item.difficulty || '';
        const title = item.title || titleSlug;

        await safeStorageSet({
          leetcode_import: {
            done: false,
            strategy,
            index,
            total,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'processing',
            hook,
            current: titleSlug,
          },
        });

        if (!folder) {
          skip.no_folder += 1;
          index += 1;
          continue;
        }

        const acceptedList = await fetchAcceptedSubmissionListGraphQL(
          titleSlug,
          {
            pageSize: settings.mode === 'all_submissions' ? 50 : 50,
            maxPages: settings.mode === 'all_submissions' ? 10 : 2,
          },
        );

        if (!acceptedList.ok) {
          if (acceptedList.reason === 'unauthorized')
            skip.unauthorized += 1;
          else if (acceptedList.reason === 'no_accepted')
            skip.no_accepted += 1;
          else skip.no_meta += 1;
          index += 1;
          continue;
        }

        const accepted = acceptedList.submissions;
        const targets = [];

        if (settings.mode === 'all_submissions') {
          accepted.forEach((s) => targets.push(s));
        } else {
          const seenLang = new Set();
          accepted.forEach((s) => {
            const lang = String(s?.apiLang || '').toLowerCase();
            if (!lang) return;
            if (seenLang.has(lang)) return;
            seenLang.add(lang);
            targets.push(s);
          });
        }

        if (targets.length === 0) {
          skip.no_accepted += 1;
          index += 1;
          continue;
        }

        const hadAnyCodeBefore = hasAnyCodeShaForFolder(
          knownSha,
          folder,
        );
        let bumpedProblemStats = false;

        let advanceIndex = true;
        // eslint-disable-next-line no-restricted-syntax
        for (const t of targets) {
          if (uploadsThisRun >= maxUploadsPerRun) {
            advanceIndex = false;
            break;
          }

          const ext = langToExt(t.apiLang);
          if (!ext) {
            skip.unknown_lang += 1;
            continue;
          }

          const submissionId = t.id;

          // Cross-mode dedupe: if this submission was already committed under
          // any naming scheme, don't re-commit it when settings change.
          if (
            hasSubmissionIdShaForFolder(
              knownSha,
              folder,
              submissionId,
            )
          ) {
            skip.already_present += 1;
            continue;
          }

          // Stable filename across settings: `${folder}${ext}` + `_<submissionId>`.
          const codeFilename = appendSubmissionIdToFilename(
            `${folder}${ext}`,
            submissionId,
          );

          const codeFilePathKey = folder + codeFilename;
          if (uploadedThisRun.has(codeFilePathKey)) continue;

          // Already uploaded?
          if (knownSha && knownSha[codeFilePathKey]) {
            skip.already_present += 1;
            continue;
          }

          const detailUrl = `https://leetcode.com/submissions/detail/${submissionId}/`;
          const detailJson =
            await fetchLeetCodeSubmissionDetail(submissionId);
          if (detailJson.status === 401 || detailJson.status === 403)
            skip.detail_http_401_403 += 1;
          else if (detailJson.status === 404)
            skip.detail_http_404 += 1;
          else if (detailJson.status === 429)
            skip.detail_http_429 += 1;
          else if (detailJson.status === 302)
            skip.detail_http_302 += 1;
          else if (detailJson.status === 200 && detailJson.hadJson)
            skip.detail_http_200_no_code += 1;
          else if (detailJson.status && detailJson.status !== 200)
            skip.detail_http_other += 1;

          let codeText = detailJson.ok ? detailJson.code : null;

          if (!codeText) {
            const gqlDetail =
              await fetchLeetCodeSubmissionCodeGraphQL(submissionId);
            if (gqlDetail.ok) codeText = gqlDetail.code;
            else {
              skip.detail_graphql_fail += 1;
              skip.detail_graphql_last_status = gqlDetail.status || 0;
              if (gqlDetail.status === 200)
                skip.detail_graphql_200_no_code += 1;
              if (
                gqlDetail.error &&
                !skip.detail_graphql_last_error
              ) {
                skip.detail_graphql_last_error = String(
                  gqlDetail.error,
                ).slice(0, 160);
              }
              if (
                gqlDetail.status === 401 ||
                gqlDetail.status === 403
              )
                skip.detail_graphql_401_403 += 1;
              else if (gqlDetail.status === 429)
                skip.detail_graphql_429 += 1;
              else if (gqlDetail.status)
                skip.detail_graphql_other += 1;
            }
          }
          if (!codeText) {
            const detailRes = await fetch(detailUrl, {
              credentials: 'include',
              headers: { accept: 'text/html' },
            });
            if (detailRes.status === 200) skip.detail_html_200 += 1;
            else if (detailRes.status === 404)
              skip.detail_html_404 += 1;
            else skip.detail_html_other += 1;
            const html = await detailRes.text();
            if (html && html.includes('__NEXT_DATA__'))
              skip.detail_html_has_next_data += 1;
            if (html && html.includes('submissionCode'))
              skip.detail_html_has_submission_code += 1;
            codeText = extractLeetCodeSubmissionCodeFromHtml(html);
            if (!codeText && detailRes.status === 200)
              skip.detail_html_200_no_code += 1;
          }
          if (!codeText) {
            skip.no_code += 1;
            continue;
          }

          const readme = `# ${padProblemId(item.frontendId) || ''}. ${title}\n## ${difficultyImport}\n\nhttps://leetcode.com/problems/${titleSlug}/\n`;

          const readmeKey = folder + 'README.md';
          const readmeSha = knownSha[readmeKey] || null;
          const codeSha = knownSha[codeFilePathKey] || null;

          // Upload README (best-effort; code upload determines "imported" count)
          const readmeRes = await githubPutContent({
            token,
            hook,
            directory: folder,
            filename: 'README.md',
            contentBase64: btoa(unescape(encodeURIComponent(readme))),
            message: readmeMsg,
            sha: readmeSha,
          });
          if (readmeRes.ok && readmeRes.sha) {
            knownSha[readmeKey] = readmeRes.sha;
          } else if (!readmeRes.ok) {
            skip.github_fail += 1;
            skip.github_last_status = readmeRes.status || 0;
            skip.github_last_path = `${folder}/README.md`;
            if (readmeRes.status === 401 || readmeRes.status === 403)
              skip.github_401_403 += 1;
            else if (readmeRes.status === 404) skip.github_404 += 1;
            else if (
              readmeRes.status === 409 ||
              readmeRes.status === 422
            )
              skip.github_409_422 += 1;
            else skip.github_other += 1;
          }

          // Upload code (required)
          const codeRes = await githubPutContent({
            token,
            hook,
            directory: folder,
            filename: codeFilename,
            contentBase64: btoa(
              unescape(encodeURIComponent(codeText)),
            ),
            message: submitMsg,
            sha: codeSha,
          });

          if (!codeRes.ok) {
            skip.github_fail += 1;
            skip.github_last_status = codeRes.status || 0;
            skip.github_last_path = `${folder}/${codeFilename}`;
            if (codeRes.status === 401 || codeRes.status === 403)
              skip.github_401_403 += 1;
            else if (codeRes.status === 404) skip.github_404 += 1;
            else if (codeRes.status === 409 || codeRes.status === 422)
              skip.github_409_422 += 1;
            else skip.github_other += 1;

            await safeStorageSet({
              leetcode_import: {
                done: false,
                strategy,
                index,
                total,
                uploaded: uploadedCount,
                ts: Date.now(),
                phase: 'error',
                hook,
                current: titleSlug,
                skip,
                last_github_status: skip.github_last_status,
                last_github_path: skip.github_last_path,
                last_error: `GitHub upload failed (status ${skip.github_last_status}) at ${skip.github_last_path}. Check token permissions and repo access.`,
              },
            });
            return;
          }

          if (codeRes.sha) {
            knownSha[codeFilePathKey] = codeRes.sha;
          }

          // Bump problem stats at most once per folder if this is the first code
          // we have for the problem.
          if (!hadAnyCodeBefore && !bumpedProblemStats && !codeSha) {
            bumpedProblemStats = true;
            stats.solved += 1;
            stats.easy += difficultyImport === 'Easy' ? 1 : 0;
            stats.medium += difficultyImport === 'Medium' ? 1 : 0;
            stats.hard += difficultyImport === 'Hard' ? 1 : 0;
          }

          await safeStorageSet({ stats });

          uploadedThisRun.add(codeFilePathKey);
          uploadedCount += 1;
          uploadsThisRun += 1;

          await new Promise((r) => setTimeout(r, 750));
        }

        if (advanceIndex) index += 1;

        await safeStorageSet({
          leetcode_import: {
            done: false,
            strategy,
            index,
            total,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'running',
            hook,
            settings,
          },
        });
      }

      if (index >= total) {
        const allSkipped =
          uploadedCount === 0 &&
          skip.no_meta +
            skip.no_accepted +
            skip.unauthorized +
            skip.unknown_lang +
            skip.no_code +
            skip.already_present +
            skip.no_folder >
            0;
        const lastError = allSkipped
          ? `Imported 0; skipped: already_present=${skip.already_present}, no_meta=${skip.no_meta}, no_accepted=${skip.no_accepted}, unauthorized=${skip.unauthorized}, unknown_lang=${skip.unknown_lang}, no_code=${skip.no_code}, detail_200_no_code=${skip.detail_http_200_no_code}, detail_401_403=${skip.detail_http_401_403}, detail_404=${skip.detail_http_404}, detail_429=${skip.detail_http_429}, detail_302=${skip.detail_http_302}, detail_http_other=${skip.detail_http_other}, detail_gql_fail=${skip.detail_graphql_fail}, gql_200_no_code=${skip.detail_graphql_200_no_code}, gql_401_403=${skip.detail_graphql_401_403}, gql_429=${skip.detail_graphql_429}, gql_other=${skip.detail_graphql_other}, gql_last_status=${skip.detail_graphql_last_status}, gql_last_error=${skip.detail_graphql_last_error || 'none'}, html_200=${skip.detail_html_200}, html_404=${skip.detail_html_404}, html_other=${skip.detail_html_other}, html_next=${skip.detail_html_has_next_data}, html_subcode=${skip.detail_html_has_submission_code}, html_200_no_code=${skip.detail_html_200_no_code}, github_fail=${skip.github_fail}, gh_401_403=${skip.github_401_403}, gh_404=${skip.github_404}, gh_409_422=${skip.github_409_422}, gh_other=${skip.github_other}, gh_last_status=${skip.github_last_status}, gh_last_path=${skip.github_last_path || 'none'}.`
          : '';
        await safeStorageSet({
          leetcode_import: {
            done: true,
            strategy,
            index,
            total,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'done',
            hook,
            skip,
            ...(lastError ? { last_error: lastError } : {}),
          },
        });
      } else {
        await safeStorageSet({
          leetcode_import: {
            done: false,
            strategy,
            index,
            total,
            uploaded: uploadedCount,
            ts: Date.now(),
            phase: 'paused',
            hook,
            skip,
          },
        });
      }
    } catch (e) {
      // Leave state as not-done so we can retry later.
      try {
        await safeStorageSet({
          leetcode_import: {
            done: false,
            strategy: 'problems_all',
            index: Number(importState.index || 0),
            total: Number(importState.total || 0),
            offset: Number(importState.offset || 0),
            uploaded: Number(importState.uploaded || 0),
            ts: Date.now(),
            phase: 'error',
            hook,
            last_error: String(e),
          },
        });
      } catch (e2) {
        if (!isExtensionContextInvalidatedError(e2)) throw e2;
      }
    } finally {
      window.leetCodeImportInProgress = false;
    }
  } catch (e) {
    window.leetCodeImportInProgress = false;
    if (!isExtensionContextInvalidatedError(e)) {
      // eslint-disable-next-line no-console
      console.warn('LeetHub import failed', e);
    }
  }
}
