/* global oAuth2 */

function show(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setNotice(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

function renderImportStatus(importState) {
  const el = document.getElementById('import_status');
  if (!el) return;

  if (!importState || typeof importState !== 'object') {
    el.hidden = true;
    el.textContent = '';
    return;
  }

  const done = importState.done === true;
  const phase = importState.phase ? String(importState.phase) : '';
  const strategy = importState.strategy
    ? String(importState.strategy)
    : '';
  const index = Number(importState.index || 0);
  const total = Number(importState.total || 0);
  const offset = Number(importState.offset || 0);
  const uploaded = Number(importState.uploaded || 0);
  const current = importState.current
    ? String(importState.current)
    : '';
  const lastError = importState.last_error
    ? String(importState.last_error)
    : '';
  const lastGithubStatus = Number(
    importState.last_github_status || 0,
  );
  const lastGithubPath = importState.last_github_path
    ? String(importState.last_github_path)
    : '';
  const githubInfo = lastGithubStatus
    ? ` GitHub last: ${lastGithubStatus}${lastGithubPath ? ` ${lastGithubPath}` : ''}.`
    : '';

  if (done) {
    el.textContent = `LeetCode import: done (imported ${uploaded}).${lastError ? ` ${lastError}` : ''}${githubInfo}`;
    el.hidden = false;
    return;
  }

  if (phase === 'error') {
    el.textContent = `LeetCode import: error${lastError ? ` — ${lastError}` : ''}${githubInfo}`;
    el.hidden = false;
    return;
  }

  if (phase) {
    const progress =
      total > 0
        ? `${Math.min(index, total)}/${total}`
        : strategy
          ? strategy
          : `offset ${offset}`;
    el.textContent = `LeetCode import: ${phase}${current ? ` (${current})` : ''} — ${progress}, imported ${uploaded}.${githubInfo}`;
    el.hidden = false;
    return;
  }

  el.hidden = true;
  el.textContent = '';
}

function normalizeLeetCodeImportSettings(raw) {
  const modeRaw = raw && typeof raw === 'object' ? raw.mode : null;
  const scopeRaw = raw && typeof raw === 'object' ? raw.scope : null;
  return {
    mode:
      modeRaw === 'all_submissions' || modeRaw === 'latest_per_lang'
        ? modeRaw
        : 'latest_per_lang',
    scope:
      scopeRaw === 'backfill_and_new' || scopeRaw === 'backfill_only'
        ? scopeRaw
        : 'backfill_only',
  };
}

async function pingActiveLeetCodeTab(message) {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs && tabs[0];
    const url = tab && tab.url ? String(tab.url) : '';
    if (!tab || !tab.id || !url.includes('leetcode.com')) return;
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // Ignore; popup can still refresh storage-only state.
  }
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return {
    status: res.status,
    json: await res.json().catch(() => ({})),
  };
}

async function saveTokenAndProceed(token) {
  const trimmed = (token || '').trim();
  if (!trimmed) {
    setNotice('auth_error', 'Please paste a token.');
    return;
  }

  setNotice('auth_error', 'Validating token…');
  const { status, json } = await fetchJson(
    'https://api.github.com/user',
    trimmed,
  );
  if (status === 401 || status === 403) {
    setNotice('auth_error', 'Token is invalid or lacks permissions.');
    return;
  }

  const username = json && json.login ? String(json.login) : null;
  await chrome.storage.local.set({
    leethub_token: trimmed,
    leethub_username: username,
  });

  setNotice('auth_error', null);
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  window.close();
}

document.addEventListener('DOMContentLoaded', async () => {
  const authenticateBtn = document.getElementById('authenticate');
  const savePatBtn = document.getElementById('save_pat');
  const patInput = document.getElementById('pat_token');
  const logoutBtn = document.getElementById('logout');
  const refreshBtn = document.getElementById('refresh_status');
  const retryBtn = document.getElementById('retry_import');
  const lcModeEl = document.getElementById('lc_import_mode');
  const lcScopeEl = document.getElementById('lc_import_scope');
  const welcomeUrl = chrome.runtime.getURL('welcome.html');
  const welcomeLink = document.getElementById('welcome_URL');
  const hookLink = document.getElementById('hook_URL');
  if (welcomeLink) welcomeLink.href = welcomeUrl;
  if (hookLink) hookLink.href = welcomeUrl;

  hide('auth_mode');
  hide('hook_mode');
  hide('commit_mode');

  const { leethub_token: token } =
    await chrome.storage.local.get('leethub_token');

  if (!token) {
    show('auth_mode');
    if (authenticateBtn) {
      authenticateBtn.addEventListener('click', () => oAuth2.begin());
    }

    if (savePatBtn) {
      savePatBtn.addEventListener('click', async () => {
        await saveTokenAndProceed(patInput ? patInput.value : '');
      });
    }

    if (patInput) {
      patInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await saveTokenAndProceed(patInput.value);
        }
      });
    }

    return;
  }

  const { status } = await fetchJson(
    'https://api.github.com/user',
    token,
  );
  if (status === 401) {
    await chrome.storage.local.set({ leethub_token: null });
    show('auth_mode');
    if (authenticateBtn) {
      authenticateBtn.addEventListener('click', () => oAuth2.begin());
    }

    if (savePatBtn) {
      savePatBtn.addEventListener('click', async () => {
        await saveTokenAndProceed(patInput ? patInput.value : '');
      });
    }

    if (patInput) {
      patInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await saveTokenAndProceed(patInput.value);
        }
      });
    }

    return;
  }

  const { mode_type: mode } =
    await chrome.storage.local.get('mode_type');
  if (mode === 'commit') {
    show('commit_mode');
    const refreshCommitMode = async () => {
      const {
        stats,
        leethub_hook: hook,
        leetcode_import: leetcodeImport,
        leetcode_import_settings: leetCodeSettings,
      } = await chrome.storage.local.get([
        'stats',
        'leethub_hook',
        'leetcode_import',
        'leetcode_import_settings',
      ]);

      if (stats && typeof stats === 'object') {
        setText('p_solved', String(stats.solved ?? 0));
        setText('p_solved_easy', String(stats.easy ?? 0));
        setText('p_solved_medium', String(stats.medium ?? 0));
        setText('p_solved_hard', String(stats.hard ?? 0));
      }

      renderImportStatus(leetcodeImport);

      const normalizedSettings =
        normalizeLeetCodeImportSettings(leetCodeSettings);
      if (lcModeEl) lcModeEl.value = normalizedSettings.mode;
      if (lcScopeEl) lcScopeEl.value = normalizedSettings.scope;

      if (!leetCodeSettings) {
        await chrome.storage.local.set({
          leetcode_import_settings: normalizedSettings,
        });
      }
      const repoUrlEl = document.getElementById('repo_url');
      if (repoUrlEl && hook) {
        repoUrlEl.innerHTML = '';
        const a = document.createElement('a');
        a.target = 'blank';
        a.href = `https://github.com/${hook}`;
        a.textContent = hook;
        repoUrlEl.appendChild(a);
      }
    };

    await refreshCommitMode();

    const saveSettings = async () => {
      const next = normalizeLeetCodeImportSettings({
        mode: lcModeEl ? lcModeEl.value : undefined,
        scope: lcScopeEl ? lcScopeEl.value : undefined,
      });
      await chrome.storage.local.set({
        leetcode_import_settings: next,
      });
    };

    if (lcModeEl) {
      lcModeEl.addEventListener('change', async () => {
        await saveSettings();
        await refreshCommitMode();
      });
    }
    if (lcScopeEl) {
      lcScopeEl.addEventListener('change', async () => {
        await saveSettings();
        await refreshCommitMode();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await refreshCommitMode();
        await pingActiveLeetCodeTab({
          type: 'LEETHUB_IMPORT_STATUS_PING',
        });
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        const { leetcode_import: current } =
          await chrome.storage.local.get('leetcode_import');
        await chrome.storage.local.set({
          leetcode_import: {
            done: false,
            strategy: 'problems_all',
            index: 0,
            total: 0,
            uploaded: Number(current?.uploaded || 0),
            ts: Date.now(),
            phase: 'queued',
          },
        });
        await refreshCommitMode();
        await pingActiveLeetCodeTab({ type: 'LEETHUB_IMPORT_NOW' });
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({
          leethub_token: null,
          leethub_username: null,
          leethub_hook: null,
          mode_type: null,
          stats: null,
          leetcode_import: null,
        });
        window.close();
      });
    }
  } else {
    show('hook_mode');
  }
});
