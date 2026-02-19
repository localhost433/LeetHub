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

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function saveTokenAndProceed(token) {
  const trimmed = (token || '').trim();
  if (!trimmed) {
    setNotice('auth_error', 'Please paste a token.');
    return;
  }

  setNotice('auth_error', 'Validating token…');
  const { status, json } = await fetchJson('https://api.github.com/user', trimmed);
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
  const welcomeUrl = chrome.runtime.getURL('welcome.html');
  const welcomeLink = document.getElementById('welcome_URL');
  const hookLink = document.getElementById('hook_URL');
  if (welcomeLink) welcomeLink.href = welcomeUrl;
  if (hookLink) hookLink.href = welcomeUrl;

  hide('auth_mode');
  hide('hook_mode');
  hide('commit_mode');

  const { leethub_token: token } = await chrome.storage.local.get(
    'leethub_token',
  );

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

  const { status } = await fetchJson('https://api.github.com/user', token);
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

  const { mode_type: mode } = await chrome.storage.local.get('mode_type');
  if (mode === 'commit') {
    show('commit_mode');
    const { stats, leethub_hook: hook } = await chrome.storage.local.get([
      'stats',
      'leethub_hook',
    ]);
    if (stats && typeof stats === 'object') {
      setText('p_solved', String(stats.solved ?? 0));
      setText('p_solved_easy', String(stats.easy ?? 0));
      setText('p_solved_medium', String(stats.medium ?? 0));
      setText('p_solved_hard', String(stats.hard ?? 0));
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

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({
          leethub_token: null,
          leethub_username: null,
          leethub_hook: null,
          mode_type: null,
          stats: null,
        });
        window.close();
      });
    }
  } else {
    show('hook_mode');
  }
});
