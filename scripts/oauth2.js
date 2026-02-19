(function initOAuth2Global() {
  if (globalThis.oAuth2) return;

  globalThis.oAuth2 = {
    init() {
      this.KEY = 'leethub_token';
      this.ACCESS_TOKEN_URL =
        'https://github.com/login/oauth/access_token';
      this.AUTHORIZATION_URL =
        'https://github.com/login/oauth/authorize';
      this.CLIENT_ID = 'beb4f0aa19ab8faf5004';
      this.REDIRECT_URL = 'https://github.com/'; // must match OAuth app callback URL
      this.SCOPES = ['repo'];
    },

    async sha256(bytes) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return new Uint8Array(digest);
    },

    base64UrlEncode(bytes) {
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    },

    randomString(lengthBytes = 32) {
      const bytes = new Uint8Array(lengthBytes);
      crypto.getRandomValues(bytes);
      return this.base64UrlEncode(bytes);
    },

    async begin() {
      this.init();

      const codeVerifier = this.randomString(32);
      const codeChallenge = this.base64UrlEncode(
        await this.sha256(new TextEncoder().encode(codeVerifier))
      );
      const state = this.randomString(16);

      const params = new URLSearchParams({
        client_id: this.CLIENT_ID,
        redirect_uri: this.REDIRECT_URL,
        scope: this.SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const url = `${this.AUTHORIZATION_URL}?${params.toString()}`;

      chrome.storage.local.set(
        {
          pipe_leethub: true,
          oauth_pkce: {
            code_verifier: codeVerifier,
            state,
            ts: Date.now(),
          },
        },
        () => {
          chrome.tabs.create({ url, active: true }, () => {
            window.close();
          });
        }
      );
    },
  };
})();
