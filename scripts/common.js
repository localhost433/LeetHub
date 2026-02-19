/* eslint-disable no-unused-vars */

const toKebabCase = (string) => {

  return string
    .replace(/[^a-zA-Z0-9\. ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

function normalizeLeetCodeImportSettings(raw) {
  const modeRaw = raw && typeof raw === 'object' ? raw.mode : null;
  const scopeRaw = raw && typeof raw === 'object' ? raw.scope : null;
  const mode =
    modeRaw === 'all_submissions' || modeRaw === 'latest_per_lang'
      ? modeRaw
      : DEFAULT_LEETCODE_IMPORT_SETTINGS.mode;
  const scope =
    scopeRaw === 'backfill_and_new' || scopeRaw === 'backfill_only'
      ? scopeRaw
      : DEFAULT_LEETCODE_IMPORT_SETTINGS.scope;
  return { mode, scope };
}

function appendSubmissionIdToFilename(fileName, submissionId) {
  const id = String(submissionId || '').trim();
  if (!id) return fileName;

  const name = String(fileName || '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot > 0 && lastDot < name.length - 1) {
    const base = name.slice(0, lastDot);
    const ext = name.slice(lastDot);
    if (base.endsWith(`_${id}`)) return name;
    return `${base}_${id}${ext}`;
  }
  if (name.endsWith(`_${id}`)) return name;
  return `${name}_${id}`;
}

function hasAnyCodeShaForFolder(shaMap, folder) {
  if (!shaMap || typeof shaMap !== 'object') return false;
  const prefix = String(folder || '');
  if (!prefix) return false;

  // eslint-disable-next-line no-restricted-syntax
  for (const key of Object.keys(shaMap)) {
    if (!key.startsWith(prefix)) continue;
    if (key.endsWith('README.md')) continue;
    if (key.endsWith('NOTES.md')) continue;
    if (key.endsWith('DISCUSSION.md')) continue;
    return true;
  }
  return false;
}

function hasSubmissionIdShaForFolder(shaMap, folder, submissionId) {
  if (!shaMap || typeof shaMap !== 'object') return false;
  const prefix = String(folder || '');
  if (!prefix) return false;
  const id = String(submissionId || '').trim();
  if (!id) return false;

  // Support current `_123` suffix and legacy `__123` suffix.
  const needles = [`_${id}`, `__${id}`];

  // eslint-disable-next-line no-restricted-syntax
  for (const key of Object.keys(shaMap)) {
    if (!key.startsWith(prefix)) continue;
    for (let i = 0; i < needles.length; i += 1) {
      if (key.includes(needles[i])) return true;
    }
  }

  return false;
}

function isExtensionContextInvalidatedError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  return msg.includes('Extension context invalidated');
}

async function safeStorageGet(keys) {
  if (
    !globalThis.chrome ||
    !chrome.storage ||
    !chrome.storage.local ||
    typeof chrome.storage.local.get !== 'function'
  ) {
    return null;
  }
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return null;
    const msg = e && e.message ? String(e.message) : String(e);
    if (
      msg.includes('Cannot read properties of undefined') &&
      msg.includes('local')
    )
      return null;
    throw e;
  }
}

async function safeStorageSet(items) {
  if (
    !globalThis.chrome ||
    !chrome.storage ||
    !chrome.storage.local ||
    typeof chrome.storage.local.set !== 'function'
  ) {
    return false;
  }
  try {
    await chrome.storage.local.set(items);
    return true;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return false;
    const msg = e && e.message ? String(e.message) : String(e);
    if (
      msg.includes('Cannot read properties of undefined') &&
      msg.includes('local')
    )
      return false;
    throw e;
  }
}

function getCookieValue(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

async function leetCodeFetchJson(url, init = {}) {
  const csrf = getCookieValue('csrftoken');
  const headers = new Headers(init.headers || {});
  if (csrf && !headers.has('x-csrftoken'))
    headers.set('x-csrftoken', csrf);
  if (!headers.has('x-requested-with'))
    headers.set('x-requested-with', 'XMLHttpRequest');
  if (!headers.has('accept'))
    headers.set('accept', 'application/json');

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { status: res.status, json, text };
}

async function fetchLeetCodeSubmissionDetail(submissionId) {
  const id = String(submissionId || '').trim();
  if (!id) return { ok: false };

  const urls = [
    `https://leetcode.com/api/submissions/detail/${id}/`,
    `https://leetcode.com/api/submissions/detail/${id}`,
  ];

  const referrer = `https://leetcode.com/submissions/detail/${id}/`;
  let lastStatus = 0;
  let lastHadJson = false;

  // eslint-disable-next-line no-restricted-syntax
  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await leetCodeFetchJson(url, { referrer });
    lastStatus = resp.status;
    if (resp.status !== 200 || !resp.json) continue;
    lastHadJson = true;

    const code =
      resp.json.code ||
      resp.json.submissionCode ||
      resp.json.submission_code ||
      resp.json?.submission?.code ||
      resp.json?.submission?.submissionCode ||
      resp.json?.submission?.submission_code ||
      resp.json?.data?.code ||
      resp.json?.data?.submissionCode ||
      resp.json?.data?.submission_code ||
      null;

    const lang =
      resp.json.lang ||
      resp.json.language ||
      resp.json.lang_name ||
      resp.json?.data?.lang ||
      resp.json?.data?.language ||
      '';

    if (typeof code === 'string' && code.length > 0) {
      return {
        ok: true,
        code,
        lang: lang ? String(lang).toLowerCase() : '',
        status: resp.status,
      };
    }

    // 200 but code not present
    return { ok: false, status: resp.status, hadJson: true };
  }

  return { ok: false, status: lastStatus, hadJson: lastHadJson };
}

async function fetchLeetCodeSubmissionCodeGraphQL(submissionId) {
  const idNum = Number(String(submissionId || '').trim());
  if (!Number.isFinite(idNum) || idNum <= 0)
    return { ok: false, status: 0 };

  const query =
    'query leethubSubmissionDetails($submissionId: Int!) { submissionDetails(submissionId: $submissionId) { code lang { name } } }';

  let lastStatus = 0;
  let lastError = '';

  const res = await leetCodeGraphQL(
    query,
    { submissionId: idNum },
    {
      referrer: `https://leetcode.com/submissions/detail/${idNum}/`,
    },
  );
  lastStatus = res.status;
  if (
    res?.json?.errors &&
    Array.isArray(res.json.errors) &&
    res.json.errors.length > 0
  ) {
    const msg = res.json.errors[0]?.message;
    if (msg) lastError = String(msg);
  }

  const obj = res?.json?.data?.submissionDetails;
  const code = obj?.code;
  const langRaw = obj?.lang;
  const lang =
    typeof langRaw === 'string'
      ? langRaw
      : langRaw && typeof langRaw === 'object'
        ? langRaw.name
        : '';
  if (typeof code === 'string' && code.length > 0) {
    return {
      ok: true,
      code,
      lang: lang ? String(lang).toLowerCase() : '',
      status: res.status,
    };
  }

  return {
    ok: false,
    status: lastStatus || 0,
    error: lastError || '',
  };
}

async function leetCodeGraphQL(query, variables, init = {}) {
  const csrf = getCookieValue('csrftoken');
  const res = await fetch('https://leetcode.com/graphql', {
    ...init,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrftoken': csrf } : {}),
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { status: res.status, json };
}

async function githubPutContent({
  token,
  hook,
  directory,
  filename,
  contentBase64,
  message,
  sha,
}) {
  const url = `https://api.github.com/repos/${hook}/contents/${directory}/${filename}`;
  const body = {
    message,
    content: contentBase64,
    ...(sha ? { sha } : {}),
  };

  let res;
  let text = '';
  let json = null;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      json = null;
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      url,
      error: String(e),
      text: '',
      json: null,
    };
  }

  const ok = res && (res.status === 200 || res.status === 201);
  const newSha = json?.content?.sha || json?.content?.git_sha || '';
  return {
    ok,
    status: res.status,
    url,
    sha: typeof newSha === 'string' ? newSha : '',
    text,
    json,
  };
}

function padProblemId(frontendId) {
  const s = String(frontendId || '').trim();
  if (!s) return null;
  return s.padStart(4, '0');
}

function buildLeetCodeFolderName(frontendId, titleSlug) {
  const id = padProblemId(frontendId);
  if (!id || !titleSlug) return null;
  return `${id}-${titleSlug}`;
}

function decodeLeetCodeEscapedString(raw) {
  if (raw == null) return null;
  const s = String(raw);
  // First try JSON string semantics (handles \n, \t, \", \\uXXXX, etc.)
  try {
    // Escape any unescaped newlines to avoid JSON.parse failures.
    const normalized = s.replace(/\r\n|\r|\n/g, '\\n');
    return JSON.parse(`"${normalized.replace(/"/g, '\\"')}"`);
  } catch (e) {
    // Fallback: only decode \uXXXX.
    return s.replace(/\\u[\dA-F]{4}/gi, (match) =>
      String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16)),
    );
  }
}

function extractStringLiteralAfter(text, startIndex) {
  if (startIndex < 0) return null;

  // Find the first quote after ':'
  const colon = text.indexOf(':', startIndex);
  if (colon < 0) return null;

  let i = colon + 1;
  while (i < text.length && /\s/.test(text[i])) i += 1;

  const quote = text[i];
  if (quote !== '"' && quote !== "'") return null;
  i += 1;

  let out = '';
  let escaped = false;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return { raw: out, quote };
    }
    out += ch;
  }
  return null;
}

function extractLeetCodeSubmissionCodeFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  // Newer LeetCode pages are Next.js and often embed data in __NEXT_DATA__.
  try {
    const nextTag =
      '<script id="__NEXT_DATA__" type="application/json">';
    const start = html.indexOf(nextTag);
    if (start >= 0) {
      const jsonStart = start + nextTag.length;
      const end = html.indexOf('</script>', jsonStart);
      if (end > jsonStart) {
        const jsonText = html.slice(jsonStart, end).trim();
        const nextJson = jsonText ? JSON.parse(jsonText) : null;

        const visited = new Set();
        const stack = [nextJson];
        let bestCode = null;
        let bestScore = 0;

        while (stack.length) {
          const cur = stack.pop();
          if (!cur || typeof cur !== 'object') continue;
          if (visited.has(cur)) continue;
          visited.add(cur);

          if (Array.isArray(cur)) {
            for (let i = 0; i < cur.length; i += 1)
              stack.push(cur[i]);
            continue;
          }

          const keys = Object.keys(cur);
          for (let i = 0; i < keys.length; i += 1) {
            const k = keys[i];
            const v = cur[k];
            if (v && typeof v === 'object') stack.push(v);

            // Prefer explicit submissionCode, but also consider code.
            if (
              typeof v === 'string' &&
              (k === 'submissionCode' || k === 'code')
            ) {
              const s = v;
              // Heuristic: code tends to have newlines/semicolons/braces.
              const score =
                (s.includes('\n') ? 2 : 0) +
                (/[{};]/.test(s) ? 1 : 0) +
                Math.min(5, Math.floor(s.length / 500));
              if (score > bestScore && s.length > 0) {
                bestScore = score;
                bestCode = s;
              }
            }
          }
        }

        if (typeof bestCode === 'string' && bestCode.length > 0)
          return bestCode;
      }
    }
  } catch (e) {
    // ignore, fall back to string-literal scanning
  }

  const keys = ['"submissionCode"', 'submissionCode'];
  for (let k = 0; k < keys.length; k += 1) {
    let idx = 0;
    while (idx >= 0) {
      idx = html.indexOf(keys[k], idx);
      if (idx < 0) break;

      const lit = extractStringLiteralAfter(html, idx);
      if (lit && typeof lit.raw === 'string' && lit.raw.length > 0) {
        // If it came from JSON "..." then lit.raw still contains escape sequences.
        // If it came from JS '...' it also typically contains \uXXXX.
        const decoded = decodeLeetCodeEscapedString(lit.raw);
        if (decoded && decoded.length > 0) return decoded;
      }
      idx += keys[k].length;
    }
  }

  // Legacy fallback (older pages had submissionCode near editCodeUrl)
  const firstIndex = html.indexOf('submissionCode');
  const lastIndex = html.indexOf('editCodeUrl');
  if (firstIndex >= 0 && lastIndex > firstIndex) {
    const slicedText = html.slice(firstIndex, lastIndex);
    const firstInverted = slicedText.indexOf("'");
    const lastInverted = slicedText.lastIndexOf("'");
    if (firstInverted >= 0 && lastInverted > firstInverted) {
      const codeUnicoded = slicedText.slice(
        firstInverted + 1,
        lastInverted,
      );
      const decoded = decodeLeetCodeEscapedString(codeUnicoded);
      if (decoded && decoded.length > 0) return decoded;
    }
  }

  return null;
}

function difficultyLabelFromLevel(level) {
  if (level === 1) return 'Easy';
  if (level === 2) return 'Medium';
  if (level === 3) return 'Hard';
  return '';
}

async function fetchAllSolvedProblems() {
  const resp = await leetCodeFetchJson(
    'https://leetcode.com/api/problems/all/',
  );
  if (resp.status !== 200 || !resp.json) {
    return { ok: false, status: resp.status, solved: [] };
  }

  const pairs = resp.json.stat_status_pairs;
  if (!Array.isArray(pairs)) {
    return { ok: false, status: resp.status, solved: [] };
  }

  const solved = [];
  pairs.forEach((p) => {
    const status = p?.status || p?.stat?.status;
    if (status !== 'ac') return;
    const frontendId = p?.stat?.frontend_question_id;
    const titleSlug = p?.stat?.question__title_slug;
    const title = p?.stat?.question__title;
    const level = p?.difficulty?.level;
    if (!frontendId || !titleSlug) return;
    solved.push({
      frontendId,
      titleSlug,
      title: title || titleSlug,
      difficulty: difficultyLabelFromLevel(level),
    });
  });

  // Deterministic order
  solved.sort((a, b) => Number(a.frontendId) - Number(b.frontendId));
  return { ok: true, status: resp.status, solved };
}

async function fetchAcceptedSubmissionListGraphQL(
  titleSlug,
  options = {},
) {
  const pageSize = Math.max(
    1,
    Math.min(50, Number(options.pageSize || 50)),
  );
  const maxPages = Math.max(
    1,
    Math.min(40, Number(options.maxPages || 10)),
  );

  const submissions = [];
  let lastKey = null;

  for (let page = 0; page < maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await leetCodeGraphQL(
      'query leethubSubmissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) { submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) { hasNext lastKey submissions { id statusDisplay lang } } }',
      {
        questionSlug: titleSlug,
        offset: 0,
        limit: pageSize,
        lastKey,
      },
      {
        referrer: `https://leetcode.com/problems/${titleSlug}/submissions/`,
      },
    );

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        reason: 'unauthorized',
        submissions: [],
      };
    }

    const list = res?.json?.data?.submissionList;
    const batch = list?.submissions;
    if (!Array.isArray(batch) || batch.length === 0) break;

    batch.forEach((s) => {
      const disp = String(
        s?.statusDisplay || s?.status_display || '',
      ).toLowerCase();
      const isAccepted = disp === 'accepted' || disp === 'ac';
      if (!isAccepted) return;
      const id = s?.id ? String(s.id) : '';
      if (!id) return;
      submissions.push({
        id,
        apiLang: s?.lang ? String(s.lang).toLowerCase() : '',
      });
    });

    const hasNext = Boolean(list?.hasNext);
    const nextKey = list?.lastKey ? String(list.lastKey) : null;
    if (!hasNext || !nextKey) break;
    lastKey = nextKey;
  }

  if (submissions.length === 0) {
    return {
      ok: false,
      status: 200,
      reason: 'no_accepted',
      submissions: [],
    };
  }

  // Dedupe by id, keep newest-first ordering.
  const seen = new Set();
  const out = [];
  submissions.forEach((s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  });

  return { ok: true, status: 200, submissions: out };
}

// End of common utils



