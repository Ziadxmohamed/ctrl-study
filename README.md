# CTRL Study

A mobile-first educational video library for GitHub Pages. Students choose a subject, an approved teacher/channel, and a lesson. Search and filters query the local approved library only. There is no YouTube search, URL entry, trending page, or Shorts feed in the student interface.

Arabic RTL is the default; the language button switches to English LTR. Includes subjects, teachers, recently added lessons, continue learning, local playback progress, completion markers, and an installable PWA shell. No application backend, runtime framework, analytics, student account, or client-side credentials are required.

## Architecture

```text
Administrator edits data/subjects.json + data/approved-channels.json
                         ↓ authorized GitHub commit
YouTube Data API → scheduled GitHub Action (secret key)
                         ↓ resolve channels + paginate uploads + verify videos
       data/channels.json + videos.json + sync-status.json
                         ↓ GitHub Pages deployment
              Vanilla HTML / CSS / JavaScript
```

The administrator approves **channels**, never individual videos. Every public, embeddable upload from an approved channel is eligible. Channel approval is therefore approval of its future uploads, not a human review of each lesson. Assign subject, teacher and grade at channel level. A channel spanning many subjects will still have one assigned subject; use additional configuration entries to present the same channel under different subjects if desired.

Source configuration and generated metadata are separate. The browser intersects generated data with the current approved channel IDs, canonical source URLs, resolved YouTube IDs and enabled status. Deleted, disabled or changed channel approvals cannot inherit a previous channel's lesson library. All text uses DOM text nodes; image hosts are allowlisted.

## Quick start

Requires Python 3 for local serving; Node.js 22+ for sync and tests. Student deployment has no Node requirement.

```sh
cd /path/to/ctrl-study
npm ci
npm test
npm run validate
npm run serve
```

Open <http://localhost:8080>. Do not open `index.html` using `file://`: JSON fetching, modules and service workers require HTTP. Localhost is allowed for service workers; production requires HTTPS.

The published configuration approves only **محمد صلاح — بسطتهالك** (`@mohamedsalah.bassthalk`), assigned to Arabic. Seven subjects are provided; subjects without an approved channel have an intentional empty state. Edit the approval configuration to add or replace channels. Lessons are populated from the official API and remain subject to their owners' availability and embed policies. Clearly marked demo data remains isolated in `tests/fixtures/` for reproducible tests and is not part of the published website.

## Exact GitHub deployment steps

1. Create a GitHub repository named, for example, `ctrl-study`. These workflows use a `main` branch. If you use another default branch, change the branch and checkout conditions in `.github/workflows/pages.yml` and `test.yml`.
2. Upload this project's files, including the hidden `.github` folder. Alternatively, from this directory:

   ```sh
   git init -b main
   git add .
   git commit -m "Create CTRL Study"
   git remote add origin https://github.com/USERNAME/ctrl-study.git
   git push -u origin main
   ```

   If macOS Git asks you to accept the Xcode license, review and accept it yourself in Terminal before using Git, or upload through GitHub’s website. If a Git repository already exists, skip `git init`. Replace `USERNAME` and the repository name. Authenticate with GitHub using your normal authorized Git client; never put a token in a remote URL or source file.
3. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. In **Settings → Actions → General**, enable repository workflows. The sync job requests `contents: write` to commit generated JSON; ensure organization policies allow this. The deploy job requests only `pages: write` and `id-token: write`, with read-only checkout in the build job.
5. Add the **`YOUTUBE_API_KEY`** repository secret as described below. This is the only user-configured secret. GitHub supplies `GITHUB_TOKEN` automatically.
6. Replace demo channels using the configuration editor or GitHub file editor. Commit the configuration to `main`.
7. Open **Actions → Sync YouTube channels → Run workflow → main → Run workflow**. Inspect the summary and `data/sync-status.json` for per-channel errors.
8. After sync finishes successfully, **Deploy CTRL Study** runs automatically and publishes the latest `main`. For the first deployment or a retry, run **Actions → Deploy CTRL Study → Run workflow** yourself.
9. Open `https://USERNAME.github.io/ctrl-study/`. Check your configured subjects, teachers, and a lesson on a phone.

All asset, JSON, manifest, worker and administration paths are relative. Browser tests serve at `/repository/`, rather than `/`, to verify project-site hosting. Custom domains also work.

Generated commits use `GITHUB_TOKEN`; these commits do not trigger ordinary push workflows. The explicit `workflow_run` trigger deploys after a successful sync or channel-add workflow, checking the workflow's branch and conclusion. It checks out `main` and never executes an artifact from the triggering workflow. Branch protection that rejects bot pushes will cause synchronization to fail at `git push`; choose a permitted dedicated publishing branch and update workflows, or have a repository administrator integrate the generated changes. Do not bypass protection by exposing a personal token.

## Create and store the YouTube API key

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create or choose a project.
2. Go to **APIs & Services → Library**. Find **YouTube Data API v3** and click **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key and restrict its allowed API to **YouTube Data API v3**. The caller is GitHub Actions, not the browser; HTTP-referrer restrictions will not work. GitHub-hosted runner IPs are variable. For fixed source-IP restrictions, use an appropriately secured self-hosted runner.
5. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**. Name it exactly `YOUTUBE_API_KEY` and paste the value.
6. Never paste the key into a JSON file, browser code, admin editor, README, or committed `.env` file. `.env.example` contains a dummy value and is not part of the published site. The script reads the environment; it does not load `.env` automatically.

For local synchronization in zsh, read the key without including its value in shell history:

```sh
read -rs 'YOUTUBE_API_KEY?YouTube API key: '
export YOUTUBE_API_KEY
npm run sync
unset YOUTUBE_API_KEY
```

Use API metrics/quotas in Google Cloud to monitor usage. Public channel metadata needs an API key; no OAuth student sign-in is used.

## Administrator workflow

### Add a channel from the admin page

Open `/admin/`, enter the administration credential and choose whether to remember it on this browser. This is a repository-scoped fine-grained token with Actions read/write permission, separate from the YouTube API key. Remembering is opt-in and stores the token in localStorage; logout deletes it. The public page is not itself an authentication boundary: publishing is authorized by the remote API.

Enter the channel URL, subject, optional teacher and grade, then publish. The page shows queued/synchronizing/publishing progress, monitors the exact workflow run ID, and confirms success only after the live library contains the requested configuration and synchronized videos. Adding an existing normalized URL updates its configuration without duplication. Publication errors remain visible in the page.

The add-channel workflow synchronizes only its target and preserves other channel data; scheduled synchronization still scans all approved channels. Both workflows share a concurrency group. Runner queue time and the separate deployment job still add latency. Source configuration can be edited through reviewed repository changes.

### Supported channel URLs

- `https://www.youtube.com/@handle` or `youtube.com/@handle`
- `https://www.youtube.com/channel/UC…` (a valid 24-character ID)
- `https://www.youtube.com/user/username`
- Normal `/videos`, `/featured`, `/playlists`, `/about`, `/shorts`, `/streams` suffixes on a handle or channel ID are normalized to the channel itself.

Legacy `/c/custom-name` URLs cannot be reliably mapped through an exact official API lookup. The editor rejects them with guidance to copy the channel's `@handle` or `/channel/UC…` URL. It does not guess through unrestricted search or scrape arbitrary pages. Individual video, playlist, shortened-video and arbitrary-host URLs are rejected.

### Configuration example

`data/approved-channels.json` is an array:

```json
[
  {
    "id": "math-teacher",
    "url": "https://www.youtube.com/@khanacademy",
    "subject": "mathematics",
    "teacher": "Khan Academy",
    "grade": "Year 10",
    "enabled": true,
    "order": 0,
    "dateAdded": "2026-10-04T00:00:00Z"
  }
]
```

Internal IDs must be unique lowercase slugs; changing an ID creates a new channel identity. `subject` must match a configured subject. `grade` is a free-form label. Use `""` for all grades. Smaller `order` values appear first. Keep `dateAdded` when editing an existing record. Generated `channels.json` stores resolved metadata keyed by the internal ID; `videos.json` links each lesson using `channelKey` and the official `channelId`.

### Configure subjects and localization

`data/subjects.json` contains ordered records like:

```json
{"id":"mathematics","name":{"ar":"الرياضيات","en":"Mathematics"},"icon":"∑","order":0}
```

The subject array order controls display; the editor reorders both the array and `order`. Subject names have Arabic and English variants; UI messages live in `assets/js/i18n.js`. Teachers, grades and API lesson titles are shown as supplied rather than machine-translated. Language preference is stored locally. Modern browsers must support JavaScript modules and `AbortController`. Adding a language requires adding a message dictionary and adapting the language toggle/direction rule.

## Automatic synchronization and reliability

`.github/workflows/sync-youtube.yml` runs every hour at minute 17 UTC, with manual dispatch available. GitHub scheduled jobs may be delayed and run only on the default branch. GitHub may disable schedules in inactive public repositories; check Actions if refreshes stop.

The Node script:

1. Validates subject and approval configuration before making API calls.
2. Resolves each enabled channel through `channels.list` using its exact handle, ID or username.
3. Reads its uploads playlist, paginating at 50 items per request.
4. Fetches video status and metadata in batches of 50 using `videos.list`.
5. Includes public embeddable videos, excluding missing/deleted/private/non-embeddable videos and upcoming broadcasts. Sorts newest first.
6. Writes generated data and per-channel synchronization status. The workflow commits changed JSON and deploys.

The app has no Shorts **discovery feed**. YouTube's public video API does not provide a reliable Shorts classification; short uploads from an approved channel may appear as regular lessons. Duration heuristics would wrongly exclude legitimate short educational lessons, so none are applied.

Full scans detect removals and keep metadata refreshed. Approximate quota is one channel request plus one playlist request and one video request per 50 uploads (empty playlists need one playlist request). This uses list endpoints and never performs general `search.list` queries. To bound runaway pagination, the script allows up to 200 playlist pages per channel (about 10,000 uploads); oversized channels are reported as `channelTooLarge`, preserving the prior successful library. Adjust `maxPages` in `syncChannel` only after reviewing quota and workflow runtime. The job has a 30-minute timeout. Very large libraries should move to incremental indexing with periodic full reconciliation.

Transient network failures, HTTP 429 and server errors retry up to three attempts with backoff. Each API request has a 30-second timeout. One channel failure does not block another channel. A transient failure keeps that channel's last successful data and marks it stale. A confirmed unavailable channel removes its lessons. Exhausted quota or invalid API configuration stops further requests in that run and reports affected channels. Changed URLs never inherit old data on a failed resolution. A partial run publishes healthy channels and diagnostics; status `partial` is visible in the student app and admin view. Retry after correcting the failure. `lastSuccessAt` on the overall library updates only when every enabled channel succeeds.

Malformed source configuration fails the workflow before publication. Missing/malformed library JSON or network failure shows a retry state in the frontend. Empty subjects, missing thumbnails and unavailable lessons have fallbacks. Player errors offer retry rather than an unrestricted YouTube link. API error responses and request URLs are never logged, avoiding accidental key disclosure.

## Player, progress and privacy

The official YouTube IFrame Player API loads **after** the student clicks **Load lesson player**. Playback uses `youtube-nocookie.com`, inline mobile playback, the current origin, and `rel=0`. The minimum player size is 200 × 200. The app does not conceal or overlay official player controls. It creates the iframe with `sandbox="allow-scripts allow-same-origin allow-presentation"` before navigation and attaches the official API to that existing frame. Scripts, same-origin player storage and presentation are allowed; popup windows, top-level navigation and custom-protocol navigation are not granted. Branding remains visible. This is browser containment of the embedded frame, not a block on directly opening YouTube, browser context-menu actions, or other apps. Sign-in/popups required by restricted videos may not work. A real public YouTube video was verified playing under this sandbox. YouTube may still show its own links, advertisements and related videos; `rel=0` limits related videos to the same channel, not to zero recommendations. Privacy-enhanced embedding is not an assertion of anonymity.

Playback position is checkpointed at most every five seconds and on player events. Automatic completion requires reaching the end with at least 90% unique playback coverage. Students can also mark completion manually, shown separately from measured viewing. Progress is non-sensitive, local to that device/browser, and can be erased from **Privacy & access**. Thumbnails contact Google's image servers when visible. Loading the player contacts YouTube and follows its policies; no video media is proxied or cached. Progress does not sync across devices and may be unavailable in storage-restricted/private modes.

## PWA installation and caching

On Android Chrome, open the HTTPS Pages URL and choose **Install app** or **Add to Home screen** from the browser menu. Samsung Internet and other browsers expose installation differently; support varies. The sidebar installation button appears on browsers emitting an installation prompt event. The manifest has real 192px and 512px PNG icons, a mask-safe design, relative scope and start URL, and standalone display mode.

The service worker caches the application shell and same-origin static assets. It never intercepts Google/YouTube requests or caches video media. Library JSON and administration remain network-only to avoid independently cached files mixing approval revisions. Offline users can load a saved shell but cannot browse the library or play media; an explicit error/retry state is shown. This intentionally prioritizes fresh approvals over offline catalog browsing. A preexisting tab can hold old data until reloaded: static hosting is not immediate access revocation. Increment the shell cache version in `service-worker.js` when changing the precached asset set. Updates activate once existing tabs close; reload after deployment.

## Device and DNS access controls

CTRL Study provides a focused **interface**, not a security boundary. A knowledgeable user can open YouTube directly, follow links within the official player, or use another application. Do not claim otherwise.

NextDNS can block domains such as social-media services, but DNS sees hostnames rather than individual HTTPS URL paths. Blocking `youtube.com` and allowing specific video URLs is not a workable video allowlist. Embeds may require several YouTube/Google hosts for scripts, images, playback, authentication/consent or regional behavior; allowing only `youtube-nocookie.com` may not permit playback. There is no stable universal minimal DNS list included here. Test actual playback under your managed network profile.

For stronger controls use appropriately managed Android devices, parental controls, kiosk/browser policies and restrictions on alternative apps/browsers. Keep these policies outside this portal so they can be added without changing the channel/index architecture. A DNS blocklist alone cannot enforce this application's channel approvals.

## Security and operations

- Only `YOUTUBE_API_KEY` is manually configured, and only in GitHub Secrets. GitHub tokens and secrets are never shipped to the public artifact.
- Deployment stages only `index.html`, assets, JSON, administration, manifest and worker. Scripts, tests, `.env.example`, package dependencies and workflows are excluded.
- Static admin pages are public. Approval JSON is public too; do not store student records or sensitive information there.
- Pages cannot set arbitrary response security headers. Meta CSP restricts frontend scripts, frames, images, connections, base URLs and objects. `frame-ancestors` requires a server response header and is not claimed here.
- No dangerous dynamic HTML insertion is used. The official player script is an external trust dependency. Keep the repo dependencies and Actions reviewed and current.
- Workflow permissions are restricted by job; sync needs repository write access only to publish generated JSON. Avoid running secret-bearing sync code from untrusted pull requests.
- Channel owners can change or remove content after a sync. Country restrictions, age gates, network rules, ads, consent prompts and disabled embedding can prevent playback even for a verified public video. The app shows a fallback but cannot override those restrictions.
- Large libraries are loaded as one JSON catalog; pagination limits rendering, not catalog download size. For tens of thousands of lessons, split generated data by channel and use a dedicated index.

## Tests and verification

```sh
npm ci
npm test
npm run validate
npx playwright install chromium
npm run test:browser
```

`npm test` exercises URL parsing, configuration validation, pagination, status verification, unavailable/private videos, duration parsing, retries, quota preservation, channel isolation, changed/disabled approvals and approved-only search. API calls use fixtures; they do not need or expose a key. Browser interaction tests use an isolated fixture library so changing approved production channels does not break CI; service-worker tests exercise the real local catalog.

Browser tests use desktop and mobile Chromium with a real HTTP server under `/repository/`. They check Arabic RTL, English LTR, overflow, navigation, subject/channel pages, search, filters, player load/error/progress behavior, empty/error states, local viewing activity and admin publishing, PWA assets, and subpath references. Additional service-worker tests verify scoped registration and offline behavior. CI installs Chromium and runs all checks. The sync and data-validation scripts use Node's standard library only. Workflow-syntax tests use the development dependency `yaml`; browser tests use Playwright.

Live YouTube API integration needs your secret. Real Android Chrome, Samsung Internet and Xiaomi browser testing, installation, and playback under your NextDNS profile still require those devices/network policies. Chromium emulation does not establish compatibility with every OEM browser. GitHub deployment must be verified in your account after enabling Pages. See [Google's channel API reference](https://developers.google.com/youtube/v3/docs/channels/list), [uploads playlist API](https://developers.google.com/youtube/v3/docs/playlistItems/list), [player parameters](https://developers.google.com/youtube/player_parameters), and [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for the underlying platform behavior.

## Repository map

```text
index.html                 student interface
assets/css/style.css       responsive RTL/LTR styles
assets/js/                 app, localization, shared validation/filtering
assets/icons/              PWA icons and thumbnail fallback
data/subjects.json         configurable bilingual subjects
data/approved-channels.json administrator-managed channel approvals
data/channels.json         generated resolved channel metadata
data/videos.json           generated approved-channel lessons
data/sync-status.json      generated diagnostics (demo marker initially)
admin/                     publishing form and remembered browser credential
scripts/                   dependency-free sync, validation, test server
.github/workflows/         sync, channel registration, Pages deployment, CI checks
tests/                     Node unit tests and Playwright browser tests
manifest.json              relative PWA configuration
service-worker.js          shell caching, no video/catalog cache
```


## Local viewing activity

`#activity` and the admin link show opens, play/resume transitions, pauses, forward and backward seeks, large skips, end events, and estimated unique playback coverage. Events start when this version is installed, are keyed by approved channel/video, and remain in this browser under `ctrl-activity`. Only approved lessons appear in the report. The latest 200 detailed events per video are retained; aggregate counts and coverage remain. Clear progress also clears viewing activity.

The tracker samples the official player every 500 ms. A forward discontinuity exceeds expected progression by at least three seconds; a backward discontinuity is at least three seconds. A large forward skip is at least 30 seconds or 20% of the duration. A jump to the final 5% is flagged. Seek detection is inferred, not a direct seek event; multiple actions between samples may be indistinguishable. Playback speed is accounted for. Buffering is not counted as a pause. Resume baselines and gaps over three seconds (including background throttling or sleep) are not credited or interpreted as seeks. Coverage merges actually sampled playing intervals without double-counting replays. It measures playback, not attention, identity, or historical viewing before tracking was enabled.
