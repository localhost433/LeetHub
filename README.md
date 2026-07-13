# LeetHub

Chrome extension (Manifest V3) that commits your accepted solutions from LeetCode to a GitHub repository.

## Credits

This project is a fork in the LeetHub ecosystem:

- Original LeetHub by Qasim Wani: https://github.com/QasimWani/LeetHub
- LeetHub-3.0 reference implementation (LeetCode.com + LeetCode.cn): https://github.com/raphaelheinz/LeetHub-3.0

## What it does

- **Automated Submission Handling**: When you submit a solution on LeetCode and it gets **Accepted**, the extension automatically creates/updates a folder for that problem in your configured GitHub repo.
- **Backfill Import**: Once a repo is linked, the extension backfills your existing accepted solutions from LeetCode in the background, a batch at a time, while you have LeetCode open. It runs once; use **Retry import** in the popup to run it again.
- **Deduplication**: It tracks solved counts and file SHAs in `chrome.storage.local` to avoid duplicate commits.

## Comparison vs LeetHub-3.0

LeetHub-3.0 (raphaelheinz) focuses on LeetCode compatibility and adds:

- **LeetCode.cn** support in addition to LeetCode.com.
- A **manual synchronization** button (including syncing previously-selected submissions).
- Notes about UI compatibility (old layout vs dynamic layout).

This fork’s notable additions/changes:

- **Manifest V3 + stricter CSP** with PAT-only auth (fine-grained PAT recommended).
- **Repo sync seeding**: scans an existing repo and seeds `stats.sha` to avoid duplicate uploads.
- **Backfill import**: imports existing accepted solutions from LeetCode in background batches after a repo is linked.
- **Multi-accepted handling options**: latest accepted per language, or keep all accepted submissions (suffix filenames with `_<submissionId>`). **Apply to** decides whether that choice covers newly accepted submissions as well, or only the backfill.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`LeetHub`).

## First-time setup

1. Click the extension icon.
2. Authenticate with GitHub using a **fine-grained Personal Access Token** restricted to a single repository (see the tutorial below), then paste it into the popup and click **Save token**.
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
npm test
```

## Troubleshooting

- **Token rejected / not saved**: the token is validated against the GitHub API when you save it; make sure it’s a fine-grained PAT with **Contents: Read and write** on the target repo and that it hasn’t expired.
- **Nothing uploads after AC**: confirm a repo is linked (mode is `commit`), and check extension errors in `chrome://extensions` -> **Service worker** -> **Inspect**.
- **GitHub API errors / rate limits**: syncing very large repos can take time and can hit rate limits.

## Privacy

- Stores the GitHub token in `chrome.storage.local`.
- Sends requests only to `api.github.com` and `leetcode.com`.

## Security note (GitHub permissions)

- LeetHub authenticates with a **fine-grained PAT** only. Restrict it to the single repo you want LeetHub to write to and grant just **Contents: Read and write**.
- The token is held by the background service worker and used only for `api.github.com` calls; it is never exposed to LeetCode page contexts.

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
