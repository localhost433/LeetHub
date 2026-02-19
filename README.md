# LeetHub

Chrome extension (Manifest V3) that commits your accepted solutions from LeetCode and GeeksforGeeks to a GitHub repository.

## What it does

- When you get an **Accepted** submission, the extension creates/updates a folder for that problem in your configured GitHub repo.
- It uploads your solution file(s) and a `README.md` for the problem.
- It tracks solved counts and file SHAs in `chrome.storage.local` to avoid duplicate commits.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`LeetHub`).

## First-time setup

1. Click the extension icon.
2. Authenticate with GitHub using one of these:
   - **Fine-grained PAT (recommended)**: create a fine-grained Personal Access Token restricted to a single repository, then paste it into the popup and click **Save token**.
   - **OAuth (convenient)**: click **Authorize with GitHub** and complete the OAuth flow.
3. On the setup (welcome) page, choose one:
   - **Create repo** (new repo), or
   - **Link repo** (use an existing repo).

### Using an existing repo (sync)

If you link a repo that already contains solutions, LeetHub performs a one-time sync that:

- Scans the repo file tree.
- Seeds the internal `stats.sha` map so future uploads update existing files instead of re-creating them.
- Updates the solved count based on existing problem folders.

## Usage

- LeetCode: solve a problem -> submit -> once it shows **Accepted**, the extension commits to GitHub.
- GeeksforGeeks: same idea—when the submission is accepted, it commits to GitHub.

You can view your linked repo and progress stats from the extension popup.

## Development

Install dev dependencies:

```bash
npm run setup
```

Common commands:

```bash
npm run format
npm run format-test
npm run lint
npm run lint-test
```

## Troubleshooting

- **Auth loops / no token saved**: finish the GitHub OAuth flow and ensure you didn’t block GitHub cookies/popups.
- **Nothing uploads after AC**: confirm a repo is linked (mode is `commit`), and check extension errors in `chrome://extensions` -> **Service worker** -> **Inspect**.
- **GitHub API errors / rate limits**: syncing very large repos can take time and can hit rate limits.

## Privacy

- Stores the GitHub token in `chrome.storage.local`.
- Sends requests only to `github.com`, `api.github.com`, `leetcode.com`, and `practice.geeksforgeeks.org`.

## Security note (GitHub permissions)

- Creating a new repo does **not** automatically limit a GitHub OAuth token to that repo. OAuth scopes are account-wide.
- If you want repo-scoped access, use a **fine-grained PAT** restricted to the single repo you want LeetHub to write to (grant **Contents: Read and write**).
- LeetHub’s OAuth flow uses **PKCE** (no embedded client secret), but it’s still broader access than a repo-restricted fine-grained PAT.

### Tutorial: Create a fine-grained PAT (recommended)

Goal: create a token that can only write to **one** repository.

1. Open GitHub token settings:
   - <https://github.com/settings/personal-access-tokens/new>
2. Under **Token name**, pick any name (e.g. `leethub`).
3. Set an **Expiration** (recommended).
4. Under **Repository access**, choose:
   - **Only select repositories** -> pick the repo you want LeetHub to write to.
5. Under **Permissions** -> **Repository permissions**, set:
   - **Contents**: **Read and write**
   - **Metadata**: **Read-only** (usually required)
6. Click **Generate token**.
7. Copy it immediately (GitHub won’t show it again).
8. In the extension popup -> paste into **Fine-grained token** -> click **Save token**.

Notes:

- If your repo is owned by an organization, the org may need to allow/approve fine-grained PATs.
- If you get `403` errors while uploading, your token likely lacks **Contents: Read and write** or the repo wasn’t selected.
