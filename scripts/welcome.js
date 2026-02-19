function $(selector) {
  const nodes = Array.from(document.querySelectorAll(selector));
  const api = {
    val() {
      return nodes[0] ? nodes[0].value : undefined;
    },
    text(value) {
      if (value === undefined) return nodes[0]?.textContent;
      nodes.forEach((n) => {
        n.textContent = value;
      });
      return api;
    },
    html(value) {
      if (value === undefined) return nodes[0]?.innerHTML;
      nodes.forEach((n) => {
        n.innerHTML = value;
      });
      return api;
    },
    show() {
      nodes.forEach((n) => {
        n.hidden = false;
        if (n.style) n.style.display = '';
      });
      return api;
    },
    hide() {
      nodes.forEach((n) => {
        n.hidden = true;
        if (n.style) n.style.display = 'none';
      });
      return api;
    },
    attr(name, value) {
      nodes.forEach((n) => {
        if (name === 'disabled') {
          n.disabled = Boolean(value);
          return;
        }
        if (value === null || value === undefined) {
          n.removeAttribute(name);
        } else {
          n.setAttribute(name, String(value));
        }
      });
      return api;
    },
    on(eventName, handler) {
      nodes.forEach((n) => n.addEventListener(eventName, handler));
      return api;
    },
    focus() {
      nodes[0]?.focus();
      return api;
    },
  };
  return api;
}

function clearElement(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function appendLink(el, href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noreferrer';
  el.appendChild(a);
  return a;
}

function renderSuccessRepoMessage(kind, repoUrl, repoName) {
  const el = document.getElementById('success');
  if (!el) return;
  clearElement(el);

  el.append(document.createTextNode(`Successfully ${kind} `));
  appendLink(el, repoUrl, repoName);
  el.append(document.createTextNode('. Start '));
  appendLink(el, 'https://leetcode.com', 'LeetCoding');
  el.append(document.createTextNode('!'));
}

function renderSyncMessage(hook, solvedCount) {
  const el = document.getElementById('success');
  if (!el) return;
  clearElement(el);
  el.append(
    document.createTextNode(
      `Synced ${solvedCount} existing problem folders from `,
    ),
  );
  appendLink(el, `https://github.com/${hook}`, hook);
  el.append(document.createTextNode('.'));
}

function renderSyncingMessage(hook) {
  const el = document.getElementById('success');
  if (!el) return;
  clearElement(el);
  el.append(
    document.createTextNode('Syncing existing solutions from '),
  );
  appendLink(el, `https://github.com/${hook}`, hook);
  el.append(document.createTextNode('...'));
}

function renderLinkingError(name, detail) {
  const el = document.getElementById('error');
  if (!el) return;
  clearElement(el);
  el.append(document.createTextNode('Error linking '));
  appendLink(el, `https://github.com/${name}`, name);
  el.append(document.createTextNode(' to LeetHub.'));
  el.appendChild(document.createElement('br'));
  el.append(document.createTextNode(detail));
}

const option = () => {
  return $('#type').val();
};

const repositoryName = () => {
  return $('#name').val().trim();
};

/* Status codes for creating of repo */

const statusCode = (res, status, name) => {
  switch (status) {
    case 304:
      $('#success').hide();
      $('#error').text(
        `Error creating ${name} - Unable to modify repository. Try again later!`,
      );
      $('#error').show();
      break;

    case 400:
      $('#success').hide();
      $('#error').text(
        `Error creating ${name} - Bad POST request, make sure you're not overriding any existing scripts`,
      );
      $('#error').show();
      break;

    case 401:
      $('#success').hide();
      $('#error').text(
        `Error creating ${name} - Unauthorized access to repo. Try again later!`,
      );
      $('#error').show();
      break;

    case 403:
      $('#success').hide();
      $('#error').text(
        `Error creating ${name} - Forbidden access to repository. Try again later!`,
      );
      $('#error').show();
      break;

    case 422:
      $('#success').hide();
      $('#error').text(
        `Error creating ${name} - Unprocessable Entity. Repository may have already been created. Try Linking instead (select 2nd option).`,
      );
      $('#error').show();
      break;

    default:
      /* Change mode type to commit */
      chrome.storage.local.set({ mode_type: 'commit' }, () => {
        $('#error').hide();
        renderSuccessRepoMessage('created', res.html_url, name);
        $('#success').show();
        $('#unlink').show();
        /* Show new layout */
        document.getElementById('hook_mode').style.display = 'none';
        document.getElementById('commit_mode').style.display =
          'inherit';
      });
      /* Set Repo Hook */
      chrome.storage.local.set(
        {
          leethub_hook: res.full_name,
          leetcode_import: {
            done: false,
            strategy: 'problems_all',
            index: 0,
            total: 0,
            uploaded: 0,
            ts: Date.now(),
          },
        },
        () => {
          console.log('Successfully set new repo hook');
        },
      );

      chrome.storage.local.get('leethub_token', (t) => {
        if (t && t.leethub_token && res && res.full_name) {
          syncExistingSolutions(t.leethub_token, res.full_name);
        }
      });

      break;
  }
};

const createRepo = (token, name) => {
  const AUTHENTICATION_URL = 'https://api.github.com/user/repos';
  let data = {
    name,
    private: true,
    auto_init: true,
    description: 'LeetHub solutions repository (auto-synced).',
  };
  data = JSON.stringify(data);

  const xhr = new XMLHttpRequest();
  xhr.addEventListener('readystatechange', function () {
    if (xhr.readyState === 4) {
      if (xhr.responseText && xhr.responseText.length > 0) {
        try {
          statusCode(JSON.parse(xhr.responseText), xhr.status, name);
        } catch (e) {
          console.error('Failed to parse response:', e);
          statusCode({}, xhr.status, name);
        }
      } else {
        statusCode({}, xhr.status, name);
      }
    }
  });

  xhr.open('POST', AUTHENTICATION_URL, true);
  xhr.setRequestHeader('Authorization', `token ${token}`);
  xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
  xhr.send(data);
};

const githubFetchJson = async (url, token) => {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = {};
  }
  return { status: res.status, json };
};

const syncExistingSolutions = async (token, hook) => {
  if (!token || !hook) return;

  try {
    renderSyncingMessage(hook);
    $('#success').show();

    const repoResp = await githubFetchJson(
      `https://api.github.com/repos/${hook}`,
      token,
    );
    if (repoResp.status !== 200) return;

    const branch = repoResp.json.default_branch || 'main';
    const refResp = await githubFetchJson(
      `https://api.github.com/repos/${hook}/git/refs/heads/${branch}`,
      token,
    );
    const commitSha = refResp.json?.object?.sha;
    if (!commitSha) return;

    const commitResp = await githubFetchJson(
      `https://api.github.com/repos/${hook}/git/commits/${commitSha}`,
      token,
    );
    const treeSha = commitResp.json?.tree?.sha;
    if (!treeSha) return;

    const treeResp = await githubFetchJson(
      `https://api.github.com/repos/${hook}/git/trees/${treeSha}?recursive=1`,
      token,
    );
    const items = treeResp.json?.tree;
    if (!Array.isArray(items)) return;

    const additions = {};
    const solvedDirs = new Set();

    items.forEach((item) => {
      if (
        !item ||
        item.type !== 'blob' ||
        typeof item.path !== 'string'
      ) {
        return;
      }
      const parts = item.path.split('/');
      if (parts.length !== 2) return;
      const [dir, file] = parts;
      if (!dir || !file) return;

      additions[dir + file] = item.sha;
      if (file === 'README.md') solvedDirs.add(dir);
    });

    chrome.storage.local.get('stats', (s) => {
      let { stats } = s;
      if (!stats || typeof stats !== 'object') {
        stats = { solved: 0, easy: 0, medium: 0, hard: 0, sha: {} };
      }
      if (!stats.sha || typeof stats.sha !== 'object') stats.sha = {};

      stats.sha = { ...stats.sha, ...additions };
      stats.solved = Math.max(
        Number(stats.solved || 0),
        solvedDirs.size,
      );

      chrome.storage.local.set({ stats }, () => {
        if (stats && stats.solved) {
          $('#p_solved').text(stats.solved);
          $('#p_solved_easy').text(stats.easy || 0);
          $('#p_solved_medium').text(stats.medium || 0);
          $('#p_solved_hard').text(stats.hard || 0);
        }
        renderSyncMessage(hook, solvedDirs.size);
        $('#success').show();
      });
    });
  } catch (e) {
    console.error('Sync existing solutions failed', e);
  }
};

/* Status codes for linking of repo */
const linkStatusCode = (status, name) => {
  let bool = false;
  switch (status) {
    case 301:
      $('#success').hide();
      renderLinkingError(
        name,
        'This repository has been moved permanently. Try creating a new one.',
      );
      $('#error').show();
      break;

    case 403:
      $('#success').hide();
      renderLinkingError(
        name,
        'Forbidden action. Please make sure you have the right access to this repository.',
      );
      $('#error').show();
      break;

    case 404:
      $('#success').hide();
      renderLinkingError(
        name,
        'Resource not found. Make sure you enter the right repository name.',
      );
      $('#error').show();
      break;

    default:
      bool = true;
      break;
  }
  $('#unlink').show();
  return bool;
};

/* 
    Method for linking hook with an existing repository 
    Steps:
    1. Check if existing repository exists and the user has write access to it.
    2. Link Hook to it (chrome Storage).
*/
const linkRepo = (token, name) => {
  const AUTHENTICATION_URL = `https://api.github.com/repos/${name}`;

  const xhr = new XMLHttpRequest();
  xhr.addEventListener('readystatechange', function () {
    if (xhr.readyState === 4) {
      let res = {};
      try {
        res = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (e) {
        res = {};
      }
      const bool = linkStatusCode(xhr.status, name);
      if (xhr.status === 200) {
        // BUG FIX
        if (!bool) {
          // unable to gain access to repo in commit mode. Must switch to hook mode.
          /* Set mode type to hook */
          chrome.storage.local.set({ mode_type: 'hook' }, () => {
            console.log(`Error linking ${name} to LeetHub`);
          });
          /* Set Repo Hook to NONE */
          chrome.storage.local.set({ leethub_hook: null }, () => {
            console.log('Defaulted repo hook to NONE');
          });

          /* Hide accordingly */
          document.getElementById('hook_mode').style.display =
            'inherit';
          document.getElementById('commit_mode').style.display =
            'none';
        } else {
          /* Change mode type to commit */
          /* Save repo url to chrome storage */
          chrome.storage.local.set(
            { mode_type: 'commit', repo: res.html_url },
            () => {
              $('#error').hide();
              renderSuccessRepoMessage('linked', res.html_url, name);
              $('#success').show();
              $('#unlink').show();
            },
          );
          /* Set Repo Hook */
          chrome.storage.local.set(
            {
              leethub_hook: res.full_name,
              leetcode_import: {
                done: false,
                strategy: 'problems_all',
                index: 0,
                total: 0,
                uploaded: 0,
                ts: Date.now(),
              },
            },
            () => {
              console.log('Successfully set new repo hook');
              /* Get problems solved count */
              chrome.storage.local.get('stats', (psolved) => {
                const { stats } = psolved;
                if (stats && stats.solved) {
                  $('#p_solved').text(stats.solved);
                  $('#p_solved_easy').text(stats.easy);
                  $('#p_solved_medium').text(stats.medium);
                  $('#p_solved_hard').text(stats.hard);
                }
              });

              if (token && res && res.full_name) {
                chrome.storage.local.get('stats', (existing) => {
                  const existingStats = existing?.stats;
                  const hasSha =
                    existingStats &&
                    existingStats.sha &&
                    Object.keys(existingStats.sha).length > 0;
                  if (!hasSha)
                    syncExistingSolutions(token, res.full_name);
                });
              }
            },
          );
          /* Hide accordingly */
          document.getElementById('hook_mode').style.display = 'none';
          document.getElementById('commit_mode').style.display =
            'inherit';
        }
      }
    }
  });

  xhr.open('GET', AUTHENTICATION_URL, true);
  xhr.setRequestHeader('Authorization', `token ${token}`);
  xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
  xhr.send();
};

const unlinkRepo = () => {
  /* Set mode type to hook */
  chrome.storage.local.set({ mode_type: 'hook' }, () => {
    console.log(`Unlinking repo`);
  });
  /* Set Repo Hook to NONE */
  chrome.storage.local.set(
    { leethub_hook: null, leetcode_import: null },
    () => {
      console.log('Defaulted repo hook to NONE');
    },
  );

  /* Hide accordingly */
  document.getElementById('hook_mode').style.display = 'inherit';
  document.getElementById('commit_mode').style.display = 'none';
};

/* Check for value of select tag, Get Started disabled by default */

$('#type').on('change', function () {
  const valueSelected = this.value;
  if (valueSelected) {
    $('#hook_button').attr('disabled', false);
  } else {
    $('#hook_button').attr('disabled', true);
  }
});

$('#hook_button').on('click', () => {
  /* on click should generate: 1) option 2) repository name */
  if (!option()) {
    $('#error').text(
      'No option selected - Pick an option from dropdown menu below that best suits you!',
    );
    $('#error').show();
  } else if (!repositoryName()) {
    $('#error').text(
      'No repository name added - Enter the name of your repository!',
    );
    $('#name').focus();
    $('#error').show();
  } else {
    $('#error').hide();
    $('#success').text('Attempting to create Hook... Please wait.');
    $('#success').show();

    /* 
      Perform processing
      - step 1: Check if current stage === hook.
      - step 2: store repo name as repoName in chrome storage.
      - step 3: if (1), POST request to repoName (iff option = create new repo) ; else display error message.
      - step 4: if proceed from 3, hide hook_mode and display commit_mode (show stats e.g: files pushed/questions-solved/leaderboard)
    */
    chrome.storage.local.get('leethub_token', (data) => {
      const token = data.leethub_token;
      if (token === null || token === undefined) {
        /* Not authorized yet. */
        $('#error').text(
          'Authorization error - Grant LeetHub access to your GitHub account to continue (launch extension to proceed)',
        );
        $('#error').show();
        $('#success').hide();
      } else if (option() === 'new') {
        createRepo(token, repositoryName());
      } else {
        chrome.storage.local.get('leethub_username', (data2) => {
          const username = data2.leethub_username;
          if (!username) {
            /* Improper authorization. */
            $('#error').text(
              'Improper Authorization error - Grant LeetHub access to your GitHub account to continue (launch extension to proceed)',
            );
            $('#error').show();
            $('#success').hide();
          } else {
            linkRepo(token, `${username}/${repositoryName()}`, false);
          }
        });
      }
    });
  }
});

$('#unlink a').on('click', () => {
  unlinkRepo();
  $('#unlink').hide();
  $('#success').text(
    'Successfully unlinked your current git repo. Please create/link a new hook.',
  );
});

/* Detect mode type */
chrome.storage.local.get('mode_type', (data) => {
  const mode = data.mode_type;

  if (mode && mode === 'commit') {
    /* Check if still access to repo */
    chrome.storage.local.get('leethub_token', (data2) => {
      const token = data2.leethub_token;
      if (token === null || token === undefined) {
        /* Not authorized yet. */
        $('#error').text(
          'Authorization error - Grant LeetHub access to your GitHub account to continue (click LeetHub extension on the top right to proceed)',
        );
        $('#error').show();
        $('#success').hide();
        /* Hide accordingly */
        document.getElementById('hook_mode').style.display =
          'inherit';
        document.getElementById('commit_mode').style.display = 'none';
      } else {
        /* Get access to repo */
        chrome.storage.local.get('leethub_hook', (repoName) => {
          const hook = repoName.leethub_hook;
          if (!hook) {
            /* Not authorized yet. */
            $('#error').text(
              'Improper Authorization error - Grant LeetHub access to your GitHub account to continue (click LeetHub extension on the top right to proceed)',
            );
            $('#error').show();
            $('#success').hide();
            /* Hide accordingly */
            document.getElementById('hook_mode').style.display =
              'inherit';
            document.getElementById('commit_mode').style.display =
              'none';
          } else {
            /* Username exists, at least in storage. Confirm this */
            linkRepo(token, hook);
          }
        });
      }
    });

    document.getElementById('hook_mode').style.display = 'none';
    document.getElementById('commit_mode').style.display = 'inherit';
  } else {
    document.getElementById('hook_mode').style.display = 'inherit';
    document.getElementById('commit_mode').style.display = 'none';
  }
});
