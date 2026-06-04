/* eslint-disable no-undef */

const RETRY_QUEUE_KEY = 'leethub_retry_queue';
const MAX_ATTEMPTS = 2;
const RETRY_ALARM = 'leethub_retry';

/**
 * Handles incoming messages from content scripts or authorize.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  routeMessage(request).then(sendResponse).catch(err => {
      console.error("Background error:", err);
      sendResponse({ error: err.message });
  });
  return true; // async
});

async function routeMessage(request) {
    if (request && request.closeWebPage === true) {
        return handleAuthMessage(request);
    }
    switch (request.action) {
        case 'upload':
            return handleUpload(request);
        case 'get':
            return handleGet(request);
        default:
             // If it's an auth message or other legacy message, handle it or ignore
             return null;
    }
}
/* ... existing code ... */
async function handleGet(request) {
  const { directory, filename, hook } = request;
  const { leethub_token } =
    await chrome.storage.local.get('leethub_token');

  if (!leethub_token) {
    return {
      status: 401,
      error: 'No LeetHub token found in storage',
    };
  }

  const URL = `https://api.github.com/repos/${hook}/contents/${directory}/${filename}`;

  try {
    const response = await fetch(URL, {
      method: 'GET',
      headers: {
        Authorization: `token ${leethub_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const data = await response.json();

    if (response.ok) {
      return { status: response.status, data };
    } else {
      console.error('GitHub Get Failed', data);
      return { status: response.status, error: data.message };
    }
  } catch (error) {
    console.error('Network Error', error);
    return { status: 500, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// Retry queue
// ---------------------------------------------------------------------------

function isRetryable(status) {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

async function enqueueRetry(request) {
  const stored = await chrome.storage.local.get(RETRY_QUEUE_KEY);
  const queue = stored[RETRY_QUEUE_KEY] || [];
  queue.push({ request, attempts: 1 });
  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: queue });
  chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
}

async function processRetryQueue() {
  const stored = await chrome.storage.local.get(RETRY_QUEUE_KEY);
  const queue = stored[RETRY_QUEUE_KEY] || [];
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    const result = await attemptUpload(item.request);
    if (result.status === 200 || result.status === 201) {
      console.log(`LeetHub: Retry succeeded for ${item.request.filename}`);
    } else if (item.attempts < MAX_ATTEMPTS && isRetryable(result.status)) {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    } else {
      console.error(`LeetHub: Dropping ${item.request.filename} after ${item.attempts} attempt(s)`);
    }
  }

  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: remaining });
  if (remaining.length) {
    chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 2 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) processRetryQueue();
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function attemptUpload({ content, directory, filename, msg, sha, hook }) {
  const { leethub_token } = await chrome.storage.local.get('leethub_token');

  if (!leethub_token) {
    return { status: 401, error: 'No LeetHub token found in storage' };
  }

  const url = `https://api.github.com/repos/${hook}/contents/${directory}/${filename}`;
  const headers = {
    Authorization: `token ${leethub_token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  const body = { message: msg, content };
  if (sha) body.sha = sha;

  try {
    let response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    let data = await response.json().catch(() => null);

    // 422 with no SHA supplied: the file already exists but we didn't send its
    // current SHA. Fetch the real SHA and retry once so a stale/missing local
    // SHA never permanently blocks an upload.
    if (response.status === 422 && !sha) {
      const getRes = await fetch(url, {
        headers: {
          Authorization: `token ${leethub_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (getRes.ok) {
        const getJson = await getRes.json().catch(() => null);
        const existingSha = getJson && getJson.sha;
        if (existingSha) {
          body.sha = existingSha;
          response = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
          });
          data = await response.json().catch(() => null);
        }
      }
    }

    if (response.ok || response.status === 201) {
      return { status: response.status, data };
    }

    console.error('GitHub Upload Failed', data);
    return {
      status: response.status,
      error: (data && data.message) || 'Unknown error',
    };
  } catch (error) {
    console.error('Network Error', error);
    return { status: 500, error: error.message };
  }
}

/* ... existing code ... */
async function handleUpload(request) {
  const { content, directory, filename, msg, sha, hook } = request;
  const result = await attemptUpload({ content, directory, filename, msg, sha, hook });

  if (isRetryable(result.status)) {
    await enqueueRetry({ content, directory, filename, msg, sha, hook });
  }

  return result;
}
