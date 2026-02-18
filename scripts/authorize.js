/* 
    (needs patch) 
    IMPLEMENTATION OF AUTHENTICATION ROUTE AFTER REDIRECT FROM GITHUB.
*/

const localAuth = {
  /**
   * Initialize
   */
  init() {
    this.KEY = 'leethub_token';
    this.ACCESS_TOKEN_URL =
      'https://github.com/login/oauth/access_token';
    this.AUTHORIZATION_URL =
      'https://github.com/login/oauth/authorize';
    this.CLIENT_ID = 'beb4f0aa19ab8faf5004';
    this.REDIRECT_URL = 'https://github.com/'; // for example, https://github.com
    this.SCOPES = ['repo'];
  },

  cleanup() {
    chrome.storage.local.set({ pipe_leethub: false, oauth_pkce: null });
  },

  /**
   * Parses Access Code
   *
   * @param url The url containing the access code.
   */
  parseAccessCode(url) {
    if (url.match(/\?error=(.+)/)) {
      this.cleanup();
      chrome.tabs.getCurrent(function (tab) {
        chrome.tabs.remove(tab.id, function () {});
      });
    } else {
      const codeMatch = url.match(/[?&]code=([\w\/\-]+)/);
      const stateMatch = url.match(/[?&]state=([\w\-]+)/);
      const code = codeMatch ? codeMatch[1] : null;
      const state = stateMatch ? stateMatch[1] : null;
      if (!code) {
        this.cleanup();
        chrome.runtime.sendMessage({
          closeWebPage: true,
          isSuccess: false,
        });
        return;
      }

      chrome.storage.local.get('oauth_pkce', (stored) => {
        const pkce = stored ? stored.oauth_pkce : null;
        const isFresh =
          pkce && typeof pkce.ts === 'number' && Date.now() - pkce.ts < 10 * 60 * 1000;
        const stateOk = pkce && pkce.state && state && pkce.state === state;
        const verifier = pkce && pkce.code_verifier ? pkce.code_verifier : null;

        if (!isFresh || !stateOk || !verifier) {
          this.cleanup();
          chrome.runtime.sendMessage({
            closeWebPage: true,
            isSuccess: false,
          });
          return;
        }

        this.requestToken(code, verifier);
      });
    }
  },

  /**
   * Request Token
   *
   * @param code The access code returned by provider.
   */
  requestToken(code) {
    const that = this;
    const data = new FormData();
    data.append('client_id', this.CLIENT_ID);
    data.append('client_secret', this.CLIENT_SECRET);
    data.append('code', code);

    const xhr = new XMLHttpRequest();
    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          that.finish(
            xhr.responseText.match(/access_token=([^&]*)/)[1],
          );
        } else {
          chrome.runtime.sendMessage({
            closeWebPage: true,
            isSuccess: false,
          });
        }
      }
    });
    xhr.open('POST', this.ACCESS_TOKEN_URL, true);
    xhr.send(data);
  },

  /**
   * Finish
   *
   * @param token The OAuth2 token given to the application from the provider.
   */
  finish(token) {
    this.cleanup();
    /* Get username */
    // To validate user, load user object from GitHub.
    const AUTHENTICATION_URL = 'https://api.github.com/user';

    const xhr = new XMLHttpRequest();
    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const username = JSON.parse(xhr.responseText).login;
          chrome.runtime.sendMessage({
            closeWebPage: true,
            isSuccess: true,
            token,
            username,
            KEY: 'leethub_token',
          });
        }
      }
    });
    xhr.open('GET', AUTHENTICATION_URL, true);
    xhr.setRequestHeader('Authorization', `token ${token}`);
    xhr.send();
  },
};

localAuth.init(); // load params.
const link = window.location.href;

/* Check for open pipe */
if (window.location.host === 'github.com') {
  chrome.storage.local.get('pipe_leethub', (data) => {
    if (data && data.pipe_leethub) {
      localAuth.parseAccessCode(link);
    }
  });
}
