/* eslint-disable no-undef */

/**
 * Handles incoming messages from content scripts or authorize.js
 */
chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (request.action === 'upload') {
      handleUpload(request).then(sendResponse);
      return true; // Keep channel open for async response
    }
    if (request.action === 'get') {
      handleGet(request).then(sendResponse);
      return true;
    }

    if (request && request.closeWebPage === true) {
      handleAuthMessage(request, sender);
    }
  },
);
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
/* ... existing code ... */
async function handleUpload(request) {
  const { content, directory, filename, msg, sha, hook } = request;
  const { leethub_token } =
    await chrome.storage.local.get('leethub_token');

  if (!leethub_token) {
    return {
      status: 401,
      error: 'No LeetHub token found in storage',
    };
  }

  const URL = `https://api.github.com/repos/${hook}/contents/${directory}/${filename}`;
  const body = {
    message: msg,
    content: content,
  };
  if (sha) {
    body.sha = sha;
  }

  try {
    const response = await fetch(URL, {
      method: 'PUT',
      headers: {
        Authorization: `token ${leethub_token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.ok || response.status === 201) {
      return { status: response.status, data };
    } else {
      console.error('GitHub Upload Failed', data);
      return {
        status: response.status,
        error: data.message || 'Unknown error',
      };
    }
  } catch (error) {
    console.error('Network Error', error);
    return { status: 500, error: error.message };
  }
}
