# Elementum TV (Tizen) — Implementation Plan

Status: draft v1 · 2026-11-06

## 1. Goal

A Samsung Tizen TV app (`.wgt`) that is a remote-controlled front-end for an Elementum instance on the LAN:

- connect to Elementum by IP + port (+ optional user/password);
- UI language taken from the TV by default, switchable, same language set as Elementum;
- Kodi/Stremio/Nuvio-style browsing: movies, shows, own library, Trakt lists, TMDB lists, search;
- details pages with cast, images, trailers list, seasons/episodes;
- stream (torrent) search → pick one → play on the TV.

Two repos are touched:

| Repo | Work |
|---|---|
| `elementum` (Go), branch **`api`** | New JSON API under `/api/v1` with an OpenAPI 3 spec and Swagger UI. Existing Kodi routes stay unchanged. All Elementum work goes to `api` (step branches merge into `api`, not `master`). `api` is merged upstream once it is ready and tested. |
| `elementum-tizen` (this repo) | TV app, CI packaging, install docs. |

**Runtime assumption:** Elementum is already running somewhere on the LAN. How it runs is out of scope. If it isn't reachable yet, the app shows a "Waiting for Elementum at IP:port…" dialog and continues on its own once Elementum responds.

## 2. Architecture

```
 Samsung TV                                 LAN machine
┌──────────────────────────┐   HTTP JSON   ┌─────────────────────────────────────────┐
│ Elementum TV (.wgt)      │  /api/v1/*    │ Elementum (Go, gin)                     │
│  Preact UI + spatial nav │──────────────▶│  /api/v1  ── TMDB / Trakt / library     │
│  API client (Basic auth) │               │           ── providers via Kodi (Burst) │
│  AVPlay player           │◀──────────────│           ── libtorrent session         │
└──────────────────────────┘  stream_url   │  existing Kodi routes (unchanged)       │
                              (token, 206) └─────────────────────────────────────────┘
```

## 3. Key decisions

| Topic | Decision | Why |
|---|---|---|
| **Reuse first** | API handlers are thin: parse input → call the **existing** Elementum functions (TMDB/Trakt/library fetch + cache, provider search, torrent/player, file serving) → map to the spec DTOs. No second fetch or cache layer. Where existing logic is fused with Kodi list-item building, split out the data part so both the Kodi routes and `/api` call it, and keep Kodi output identical. | One code path to maintain; the Kodi addon and the TV app stay consistent. |
| API prefix | `/api/v1` | `/api` as asked, plus a version so it can change later without breaking clients. |
| Spec | **Spec-first** `apiv1/openapi.yaml` (OpenAPI 3.0) in a new Go package `apiv1/` (the existing `api/` package holds the Kodi handlers). The Go server interface and models are generated with `oapi-codegen` (gin, strict server), installed as a `go.mod` `tool` like msgp, with generated code committed. No request-validator middleware: the strict server's typed params are enough. | One contract drives both sides; the TV app can start as soon as the spec exists; input/output are typed and validated. |
| Docs | Swagger UI at `/api/docs` (tiny HTML page that loads swagger-ui from a CDN), raw spec at `/api/v1/openapi.yaml` | No bundled assets in the Go binary. |
| Errors | `{"error": {"code": "trakt_not_authorized", "message": "..."}}` + proper HTTP status | Clients can branch on `code`. |
| Auth | HTTP Basic with the existing `config.Args.LocalLogin/LocalPassword`; none when both are empty. The global `Auth()` in `api/routes.go` skips `/api/`, and `/api/v1` runs its own check with the same credentials. It returns the JSON 401 with **no** `WWW-Authenticate` header, so browsers show no popup. `/api/v1/stream` skips Basic (HMAC only). | Matches the existing setup; JSON errors everywhere. |
| CORS | Reuse the existing global `CORS()` and add `DELETE` | Already there. |
| Stream auth | **HMAC-signed links.** `stream_url` = `/api/v1/stream/{session_id}/{file_index}?exp=<unix>&sig=<hex>`, where `sig = HMAC-SHA256(key, session_id + "/" + file_index + "/" + exp)`. The key is 32 random bytes generated when Elementum starts. The server checks with `hmac.Equal`, rejects expired links, and requires the session to still be active. The stream path skips Basic auth. | AVPlay can't send auth headers. A signed link can't be forged or reused after the session stops. A per-process key means a restart invalidates all links, which is fine because sessions die with the process too. |
| Unreachable server | The client separates a network error (Elementum not up) from 401 (wrong credentials). A network error opens the waiting dialog, which retries `/system/info` every 3 s. A 401 opens Setup. | Matches the "wait until Elementum is up" behaviour. |
| Metadata language | `lang` query param on catalog endpoints, defaulting to Elementum's setting. It accepts `de` or `de-DE`, normalized once in the API layer. The existing TMDB fetchers already take `lang` per call and key the cache on it. The DTO mapping reads TMDB's localized fields directly, not the `GetTitle()`-style helpers that read the global config. | The UI language and TMDB language can follow the app's switcher. |
| Trackers | User lists go through Elementum's generic **tracker** layer (Trakt/Simkl/MDBList/…): `/tracker/...`, and 409 `tracker_not_authorized` when no account is linked. Public charts (trending/popular/…) stay `/trakt/...` and need no auth. Never call `trakt.Authorized()`, which starts the Kodi device-login flow; check the token or the tracker's state instead. | Reuses the existing abstraction; works for non-Trakt users. |
| Long operations | Stream search is a blocking GET bounded by Elementum's provider timeout. Playback is a session resource the client polls. | Simplest model that works. Async search jobs only if the blocking version proves too slow. |
| Session lifetime | Session ends on `DELETE`, or after 60 s without a status/progress call. One active API session at a time (a new one stops the old). | Keeps torrents from leaking when the TV is switched off mid-play. |
| TV stack | Vite + Preact + TypeScript, `@noriginmedia/norigin-spatial-navigation`, no router library (a simple screen stack), plain CSS | Small bundle, fast on old TVs, focus handling solved. |
| Baseline | **Tizen 4.0+ (2018+ TVs), confirmed.** Build target `chrome56`. | async/await works natively, so no legacy polyfill bundle. |
| API types | `openapi-typescript` generates `src/api/schema.d.ts` from a copy of the spec (`npm run api:sync` pulls it from a pinned Elementum ref) | No hand-written DTOs that drift. |
| Player | `webapis.avplay` on the TV (`.wgt`, loading `$WEBAPIS/webapis/webapis.js`); plain `<video>` fallback in a desktop browser for development | Hardware decoding (MKV/HEVC/…) on the TV; the whole app can be developed in Chrome. |
| i18n | Flat JSON per language in `src/i18n/`, `en.json` as source. Language list = Elementum's `resources/language` list. Default from `tizen.systeminfo` LOCALE → `navigator.language` → `en`. | A sync script pre-fills translations from Elementum's `.po` files where the English `msgid` matches. |
| Settings storage | `localStorage` (server, credentials, language) | Single-user TV. Credentials are stored in plain text; documented. |
| Distribution | **Apps2Samsung** (desktop sideloading tool for Windows/macOS/Linux): the user puts the TV in Developer Mode, opens Apps2Samsung, and installs our `.wgt` from GitHub Releases. Apps2Samsung handles Samsung signing for the TV. Fallback: the manual Tizen CLI (`sdb connect` + re-sign + `tizen install`). No TizenBrew, no npm, no Samsung store (see §8). | One `.wgt` for everyone, with full Tizen APIs (AVPlay, key registration, our `config.xml` privileges). |

## 4. API v1 contract (draft — finalized in step A1)

Common: `page` (1-based), `limit` (page size 1–100; defaults to Elementum's `results_per_page`), `lang` (BCP-47, e.g. `de-DE`). Paged responses look like `{ "items": [...], "page": 1, "limit": 20, "total_pages": 10, "total_results": 200 }`. Every list endpoint takes `limit`; only unpaged arrays (genres, tracker lists) don't.
`MediaItem` (list entry) = `{ type: movie|show, tmdb_id, title, year, overview, poster, backdrop, rating, genres[] }`. Image fields are absolute URLs.

| Method & path | Purpose |
|---|---|
| `GET /system/info` | version, `auth_required`, `tracker: {id, name, authorized}`, default language. Also used as the "test connection" call. |
| `GET /movies/lists/{list}` | `popular, trending, top_rated, now_playing, upcoming, by_genre` (+ `genre`, `year`) |
| `GET /movies/genres` | genre list |
| `GET /movies/{tmdb_id}` | details: runtime, genres, rating, cast/crew, images (posters, backdrops, logos), videos (trailers), external ids |
| `GET /shows/lists/{list}` / `GET /shows/genres` | same as movies |
| `GET /shows/{tmdb_id}` | details + seasons summary |
| `GET /shows/{tmdb_id}/seasons/{season}` | episodes (still image, overview, air date) |
| `GET /search?query=&type=movie\|show` | search (both honour `limit`) |
| `GET /library/movies`, `GET /library/shows` | Elementum local library |
| `GET /trakt/{movies\|shows}/lists/{list}` | trending, popular, anticipated, watched, played |
| `GET /tracker/{movies\|shows}/watchlist`, `/collection` | user lists (409 `tracker_not_authorized` when not linked) |
| `GET /tracker/shows/progress` | "Next up" / continue watching |
| `GET /tracker/lists`, `GET /tracker/lists/{list_id}/items` | user's custom lists and their items |
| `GET /movies/{tmdb_id}/streams` | provider search → `Stream[]` |
| `GET /shows/{tmdb_id}/seasons/{s}/episodes/{e}/streams` | provider search for an episode |
| `POST /playback` | body `{ uri, type, tmdb_id, season?, episode?, file_index? }` → `PlaybackSession` (201) |
| `GET /playback/{id}` | `{ state: resolving\|choosing_file\|buffering\|ready\|error\|stopped, buffer_progress, download_rate, seeds, peers, files?, stream_url?, error? }` |
| `GET /stream/{id}/{file_index}?exp=&sig=` | the media bytes (Range/206); authorized by HMAC only, no Basic auth |
| `POST /playback/{id}/progress` | `{ position_s, duration_s, paused }`: keepalive, resume point, Trakt scrobble |
| `DELETE /playback/{id}` | stop and clean up |

`Stream` = `{ uri, name, provider, size_bytes, seeds, peers, resolution, codec, audio, multi_provider }`, sorted by Elementum's sort settings. (`multi_provider` maps `TorrentFile.Multi`, meaning several providers returned it, not a multi-file torrent.)
`total_pages` is computed per source: lists use Elementum's page size, search uses TMDB's 20.
In `choosing_file`, the client re-POSTs `/playback` with `file_index`.

## 5. TV app layout (target)

```
config.xml                 Tizen manifest (privileges: internet, tv.inputdevice; access origin="*")
index.html  icon.png
src/
  main.tsx                 boot, key registration, screen stack
  api/  client.ts schema.d.ts   fetch + Basic auth + timeout + typed errors
  i18n/ index.ts *.json
  nav/  keys.ts stack.ts         remote keys (Back=10009, media keys), screen stack
  ui/   Row.tsx Grid.tsx Poster.tsx Sidebar.tsx Spinner.tsx ErrorView.tsx
  screens/ Setup Home Movies Shows Library Trakt Search Details Season Streams Buffering Player Settings
  player/ avplay.ts html5.ts index.ts   same small interface for both
scripts/ sync-api.mjs sync-languages.mjs
.github/workflows/build.yml
INSTALL.md README.md
```

## 6. Execution protocol (every step)

1. **Implement**: the orchestrator (main session) spawns one implementer subagent (`general-purpose`, `isolation: worktree`, branch `step/<id>`, cut from `api` in the Elementum repo and from `main` here). Its prompt contains the step section below, the "Done when" list, and these rules: stay in scope, add tests for new logic, update docs the step touches, never edit the spec outside step A1 without saying so.
2. **Verify**: the orchestrator runs the step's checks itself (build, tests, generators, curl/Swagger calls). It does not take the subagent's report on trust.
3. **Review**: a fresh reviewer subagent (read-only) reviews the branch diff with `/code-review` (correctness) and `ponytail-review` (scope/bloat), checking it against the "Done when" list, the API contract, and trust-boundary security. For Elementum steps it also flags any re-implemented fetch, cache, or business logic that already exists (the "Reuse first" rule in §3), and any change in Kodi route output.
4. **Fix**: findings go back to the same implementer (`SendMessage`), at most 2 rounds. Non-trivial fixes get a second review.
5. **Merge**: squash-merge into `api` (Elementum) or `main` (this repo), tick the step here, and write any deviations in §9 Decisions log.
6. 👤 marks a **human checkpoint**: work stops until the user confirms.

**Rules for every `apiv1` handler (A2–A5); the implementer prompt must include them:**
- The strict server only parses types. Every handler validates its input with the shared apiv1 helper (`page` ≥ 1, `.Valid()` on enums) and returns 400 `bad_request` otherwise. Add one 400 test per enum endpoint.
- Use `ctx.(*gin.Context).Request.Context()` for anything long-running (search, metadata fetches), so a client cancel stops the work. Never enable gin `ContextWithFallback` globally, because it changes Kodi handlers.
- **Page size:** honour `limit` by passing it into the existing fetchers. Where a fetcher reads `config.Get().ResultsPerPage` itself (`tmdb/movie.go:236`, `tmdb/show.go:208`, `trakt/movies.go`, `trakt/shows.go`), add a `perPage` argument, with the Kodi callers passing `config.Get().ResultsPerPage`, so Kodi output stays identical. Don't write a second pagination layer. The TMDB cache holds TMDB's fixed 20-item pages, so any `limit` reuses it. Check that cache keys for Trakt requests include the limit.
- Never put `err.Error()` from upstream calls into responses; it can contain URLs with `api_key`. Log it and return a generic message.

Independent steps may run in parallel worktrees (see the dependency column).

## 7. Steps

| ID | Repo | Step | Depends on |
|---|---|---|---|
| 0 ✅ | elementum (read-only) | Internals spike → `docs/elementum-notes.md` | — |
| A1 ✅ | elementum | API foundation + full spec 👤 | 0 |
| A2 ✅ | elementum | Catalog & search endpoints | A1 |
| A3 | elementum | Library, tracker & Trakt charts | A2 (reuses its MediaItem mapping) |
| A4 ✅ | elementum | Stream search endpoint | A1 |
| A5 ✅ | elementum | Playback sessions 👤 (Kodi playback check pending) | A4 |
| B1 ✅ | tizen | Scaffold | A1 |
| B2 ✅ | tizen | CI, packaging, INSTALL.md 👤 (TV install pending) | B1 |
| B3 | tizen | API client, setup screen, settings, i18n | B1 |
| B4 ✅ | tizen | Navigation shell & UI kit | B1 |
| B5 | tizen | Browse screens (Home, Movies, Shows, Library, Trakt) | A2, A3, B3, B4 |
| B6 | tizen | Search | A2, B4 |
| B7 | tizen | Details, seasons, episodes, media | A2, B4 |
| B8 | tizen | Streams list & buffering flow | A4, A5, B7 |
| B9 | tizen | Player 👤 | A5, B8 |
| B10 | both | Hardening & v0.1.0 release 👤 | all |

---

### Step 0 — Elementum internals spike (research, no code)
Read the Elementum repo and write `docs/elementum-notes.md` in this repo, with `file:line` references, answering:
- Where the gin engine/routes are built, and how existing handlers are registered.
- The existing auth mechanism (setting names, how it is checked).
- TMDB/Trakt/library entry points that return **data**, below the layer that builds Kodi list items. Is a `lang` override possible?
- Provider search call path: how Burst is invoked through Kodi, timeouts, result struct, sorting.
- Play flow: how a torrent is added, how the file is chosen, how buffering is tracked, which handler serves file bytes with Range support (to be reused by `/stream`), and which Kodi-player callbacks the API session must skip.
- Language list (`resources/language/*`) and `.po` format; Go version; existing CI.

**Done when:** every question is answered or marked "unknown + how to find out". 👤 The user confirms §3/§4 still hold before A1 starts.

### A1 — API foundation + full spec
- Create branch `api` from `master` in `/home/elgato/Develop/elementum`.
- `api/openapi.yaml` with **all** v1 endpoints and schemas from §4, the error schema, and the Basic security scheme. Use `operationId` everywhere and add examples.
- `oapi-codegen` as a `go.mod` tool + `go:generate` in the new package `apiv1/`; mount the `/api/v1` group on the existing engine in `api.Routes`.
- Auth as in §3: the global `Auth()` skips `/api/`; the `apiv1` Basic check returns the JSON 401. Add `DELETE` to the existing `CORS()`. Errors are JSON; the existing recovery is reused.
- `/api/docs` Swagger UI page; `/api/v1/openapi.yaml`.
- Implement `GET /system/info`. Every other operation returns 501 `not_implemented`.
- CI: in the existing lint job (no cgo needed), regenerate the code and fail on `git diff --exit-code`.

**Done when:** unit tests pass for 401 without creds / 200 with creds / 200 with auth disabled, the CORS preflight, and the 501 error shape. Swagger UI renders. Existing Kodi routes are untouched (their tests still pass). 👤 The user reviews the spec, since it is the contract for everything else.

### A2 — Catalog & search
Implement the movies/shows lists, genres, details, seasons, and search through the existing TMDB layer and cache. Map to the spec DTOs in one place (`apiv1/mapping.go`). Image paths become absolute URLs (posters at w342, backdrops at w1280, original-size logos). TMDB has no existing wrappers for trending, upcoming, or multi search, so add one-line ones next to the existing fetchers. `now_playing` maps to `RecentMovies`; year/genre filters go through `DiscoverMovies`.
**Done when:** mapping unit tests pass against fixture TMDB JSON in `apiv1/testdata/`; `lang=de-DE` returns German titles; every endpoint responds through Swagger UI "Try it out".

### A3 — Library, tracker & Trakt charts
Library lists. Tracker watchlist/collection/progress/custom lists through the existing generic tracker layer, plus the Trakt public charts, all resolved to `MediaItem` with TMDB ids. Without a linked account, return 409 `tracker_not_authorized`; never trigger the Kodi login flow.
**Done when:** mapping tests pass; manual check with a linked and an unlinked tracker account.

### A4 — Stream search
Movie and episode stream endpoints reuse the existing provider search, sorting, timeout, and search-result cache. Use `SearchMovieSilent`, and add a matching `SearchEpisodeSilent` (no Kodi dialogs). Map results to `Stream`. 502 `providers_unavailable` when Kodi/Burst is unreachable; empty list = no results.
**Done when:** mapping tests pass; a real search returns sorted streams within the configured timeout.

### A5 — Playback sessions
**Validate `POST /playback` `uri` (from the A4 review; trust boundary):** prefer not trusting it. Look up the `TorrentFile` by `info_hash`/uri in the stream-search cache for that tmdb_id/season/episode, and fall back to a magnet built from the infohash. Otherwise allow only:
- `magnet:` with a valid btih;
- a local path only when `filepath.Clean(uri) == filepath.Join(TempPath, <40-hex>.torrent)`;
- `http(s)` only when it exactly matches a cached result.
Reject `file:`, `plugin:`, relative paths, and `..`. Return a generic 400 that never echoes paths or `err.Error()`. Without these checks, `Download()` reads any absolute path, and http URIs allow server-side requests to internal URLs and header injection via `|k=v`. Tests cover every rejected form.
**Biggest change in the Elementum part.** The existing `bittorrent.Player` assumes a Kodi host: `updateWatchTimes` dereferences `xbmcHost` without checking it, and multi-file movies open a Kodi picker. Add a small **external mode** to `bittorrent/player.go`: no Kodi dialogs, overlay, or watch-time loop, and lifecycle driven by API calls. `ChooseFile` returns a sentinel error for an ambiguous choice, which drives `choosing_file`. `GetActivePlayer` skips API players so Kodi player events never reach them. Never call `NewPlayer(..., nil)` with today's loop.
Session store (one active session). `POST` adds the torrent and selects the file (auto for movies and episodes, `choosing_file` when ambiguous). `GET` reports state/progress. `progress` keeps the session alive, stores the resume point, and scrobbles to Trakt. `DELETE` and the idle reaper clean up. `stream_url` is an absolute LAN URL to `GET /api/v1/stream/{id}/{file_index}`, which wraps the existing Range-capable `bittorrent.NewTorrentFS` file serving (as used by `/files/`) and is authorized only by the HMAC link from §3 (expiry 12 h; session must be active). This path must not depend on Kodi player callbacks. Mount `HEAD` on the same stream handler outside the spec (ServeContent and `NewTorrentFS(method)` handle it). Fill `resume_s` from the stored resume point or tracker progress.
**Done when:** tests cover the state machine and HMAC (valid, tampered sig/path/exp, expired, stopped session → 403, all compared with `hmac.Equal`). An integration check with a legal public-domain torrent (e.g. Big Buck Bunny/Sintel) reaches `ready` and returns `206` on a ranged GET. The reaper stops the session after 60 s without calls. Kodi playback still works. 👤 The user runs the integration check on their setup.

### B1 — Scaffold (this repo)
Vite + Preact + TS, build target `chrome56`, fixed 1920×1080 layout. `config.xml` (package id: 10 alphanumeric chars, `required_version="4.0"`, privileges internet + tv.inputdevice, `access origin="*"`), icon, `.gitignore` (`dist/`, `node_modules/`). Scripts: `dev`, `build`, `test` (vitest), `api:sync`, `typecheck`. Copy the spec from A1 and generate `schema.d.ts`.
**Done when:** `npm run build` outputs `dist/` with `index.html` + `config.xml`; `npm run dev` shows a placeholder screen in Chrome; typecheck and tests pass.

### B2 — CI, packaging, install docs
`.github/workflows/build.yml`: on PR/push run `npm ci`, typecheck, test, and build. Install a pinned, cached Tizen Studio CLI, generate an author certificate (from repo secrets when present, otherwise a throwaway one), `tizen package -t wgt`, and upload the `.wgt` artifact. On a `v*` tag, attach the `.wgt` to a GitHub Release.
**Install path:** research Apps2Samsung (github.com/Apps2Samsung/Apps2Samsung): how it installs a custom `.wgt`, whether it re-signs it (so our CI signature only has to be valid, not Samsung-specific), any requirements on `config.xml`/package id, and whether apps can be listed in its catalog (e.g. via a PR to its app list pointing at our GitHub Releases). Write the findings to `docs/apps2samsung.md`.
`INSTALL.md` covers **Option A (recommended): Apps2Samsung**: enable Developer Mode on the TV (Apps → `12345` → dev mode on, PC IP, reboot), install Apps2Samsung, download `Elementum-<version>.wgt` from GitHub Releases, select the TV and the file, install. **Option B: Tizen CLI**: `sdb connect <TV_IP>`, a Samsung certificate with the TV's DUID, re-sign, `tizen install`, uninstall. Plus troubleshooting.
**Done when:** a CI run on a PR produces a `.wgt` artifact. 👤 The user installs the app on a real TV with Apps2Samsung by following INSTALL.md word for word, and fixes go back into the doc.

### B3 — API client, setup, settings, i18n
- `api/client.ts`: base URL from settings, Basic auth header, timeout (60 s for stream search), and errors typed by `error.code`. **Use XHR (`xhr.timeout`/`abort()`), not `fetch`+`AbortController`:** Chrome 56 has no `AbortController`, and its `fetch` can't be aborted.
- `localStorage` keys are prefixed `elementum.`. Unit tests use a mocked XHR.
- Setup screen: IP, port (default Elementum port), user, password, and a "Test connection" button (`/system/info`). It is shown on first run and on 401.
- Waiting dialog: on a network error/timeout (at startup or any later call), show "Waiting for Elementum at IP:port…" with a spinner. It retries `/system/info` every 3 s and closes on its own once Elementum responds, retrying the call that failed. Buttons: "Change server" (Setup) and "Exit".
- Settings screen: server, language switcher, about (app + Elementum version).
- i18n: `t(key, vars)`; default language from Tizen locale; the choice persists; missing keys fall back to `en`. `scripts/sync-languages.mjs` reads `/home/elgato/Develop/plugin.video.elementum/resources/language` (22 languages) and creates one JSON per language. It pre-fills from `.po` where the English msgid matches, skipping strings that contain `%s` or Kodi markup (`[B]`, `[COLOR]`, …).
**Done when:** tests pass for the client (auth header, timeout, network-error vs 401 mapping), the waiting-dialog retry loop, and i18n (fallback, locale detection). Starting the app with Elementum stopped, then starting Elementum, lands on Home with no user action. Switching language re-renders the UI with no reload.

### B4 — Navigation shell & UI kit
Spatial navigation init; key registration (arrows, Enter, Back 10009, Play/Pause/Stop/FF/RW); screen stack (Back pops, Back on Home asks to exit → `tizen.application.getCurrentApplication().exit()`); sidebar (Home, Movies, Shows, Library, Trakt, Search, Settings); `Row` (horizontal and windowed, rendering only about 15 visible items), `Grid` (paged loading), `Poster`, `Spinner`, `ErrorView` (with retry). Clear focus styling. No blur/filter effects, which are slow on old TVs.
**Done when:** a demo with fake data navigates fully by keyboard in Chrome (arrows/Enter/Backspace mapped to Back); the stack logic has a unit test.

### B5 — Browse screens
Home rows: Next up (Trakt, hidden when not linked), Trending movies, Trending shows, Watchlist. Movies/Shows: list switcher (popular/top rated/…/genres) + Grid. Library. Trakt: lists → items. The `lang` param follows the app language.
**Done when:** every screen loads real data from Elementum and handles empty, error, and Trakt-not-linked states; paging works; Back restores the previous focus.

### B6 — Search
Native input field (the Tizen IME opens on focus), debounced query, results Grid with a movie/show filter, recent searches in localStorage.
**Done when:** search works on the TV with the remote and in Chrome; the debounce has a unit test.

### B7 — Details, seasons, episodes, media
Movie: backdrop, logo/title, meta, overview, cast row, image gallery, trailer list (titles only; YouTube can't play in AVPlay, so play is out of scope), and a "Find streams" button. Show: seasons row → episode list (still image, overview) → "Find streams" per episode.
**Done when:** a movie and a show with several seasons render correctly in two languages; it all works with the remote.

### B8 — Streams list & buffering
The streams screen calls the stream endpoint, with a spinner and cancel. The list shows resolution, size, seeds, provider, and codec badges. Selecting one sends `POST /playback`, then the buffering screen polls `GET /playback/{id}` every second (progress %, speed, peers). It shows a file picker on `choosing_file`; Back cancels (`DELETE`). On `ready` it moves to the Player.
**Done when:** the full flow with the legal test torrent reaches the player in Chrome (html5 fallback); the cancel path deletes the session; the poller has a unit test.

### B9 — Player
AVPlay needs `$WEBAPIS/webapis/webapis.js` in `index.html` (loaded only on Tizen). While the player is active, pause norigin spatial navigation (`pause()`/`resume()`), so the OSD's arrow/seek keys don't also move focus (B4 review). `player/avplay.ts` (`open`, `setDisplayRect(0,0,1920,1080)`, `prepareAsync`, play/pause/seek, `getTotalTrackInfo` for audio and subtitle tracks, buffering and error listeners, suspend/resume on `visibilitychange`) and `player/html5.ts`, both behind the same tiny interface. OSD: title, progress bar, time, play/pause, ±10 s / ±60 s seek, audio/subtitle track menu; it auto-hides. Media keys are handled. `progress` is posted every 10 s; Back/Stop sends `DELETE` and returns to details.
**Done when:** 👤 the user plays the test torrent plus one real MKV (HEVC + multiple audio tracks) on a real TV: seeking, track switching, and stop all work, and the session is gone in Elementum afterwards.

### B10 — Hardening & release
Test on the oldest available TV (performance: image sizes, row windowing); add an error state everywhere, handle a lost connection mid-play, and run a translation sync. README (features, screenshots, link to INSTALL.md). Elementum: API section in its README. Tag `v0.1.0` in this repo → release `.wgt`.
**Done when:** 👤 the user signs off on the release on a real TV.

## 8. Risks / open questions

1. **Samsung store: not pursued.** Seller Office requires a seller account (a business registration and partner level for launches outside the US / for some APIs), pre-certification testing, and compliance with Samsung's content policy. A torrent front-end is very likely to be rejected, so effort goes to the `.wgt` via Apps2Samsung instead.
2. **`/files/` is open today.** It is mounted outside gin (`main.go:281`) with no auth, so anyone on the LAN can read torrent files there. This predates the plan and is left unchanged because Kodi playback depends on it. The new `/api/v1/stream` is HMAC-protected.
3. **Developer Mode:** the TV stays in Developer Mode for sideloaded apps (Apps2Samsung or CLI).
4. **Codec support** depends on the TV model (e.g. DTS was dropped on 2018+ models). No transcoding is planned; the UI shows codec badges so users can pick wisely.
5. **Apps2Samsung:** a community tool; Developer Mode must stay enabled on the TV, and sideloaded apps may need reinstalling when the signing certificate expires. B2 documents the details; the manual Tizen CLI path stays as the fallback.
6. **Resolved:** the Elementum repo is at `/home/elgato/Develop/elementum` (branch `api` does not exist yet; A1 creates it from `master`). The codegen deps are approved. The app is named `Elementum`, with package id `ElmntmTV01` and app id `ElmntmTV01.Elementum`.

## 9. Decisions log
- 2026-11-06: All Elementum work goes to branch `api`; it is merged upstream once ready and tested.
- 2026-11-06: Stream links are HMAC-signed (no auth headers on the player side).
- 2026-11-06: How Elementum/Kodi runs is out of scope; the app waits for Elementum with a dialog.
- 2026-11-06: Minimum is Tizen 4.0.
- 2026-11-06: Distribution is a TizenBrew module first, `.wgt` re-sign as fallback; no Samsung store. Confirmed by the user that TizenBrew is the user-facing install path.
- 2026-11-06: Reuse first. `/api` handlers call existing Elementum logic; refactor the data out of Kodi-specific code where needed instead of duplicating it.
- 2026-11-06: Step 0 done. Findings folded in: `apiv1/` package, Auth/CORS reuse, tracker-agnostic endpoints, `multi_provider`, Player external mode for A5, and the existing silent search.
- 2026-11-06: A1 review. Show lists are `popular, trending, top_rated, on_the_air, by_genre` (not the movie names). There is a single `{media}` param for tracker/trakt, and `media` is required on list items. All lists are paged except `/tracker/lists` and genres. The added error codes are `tracker_unsupported`, `forbidden`, and `playback_failed`. `PlaybackSession.resume_s` is added, and so are `Stream.rip`, `language`, and `info_hash`.
- 2026-11-07: B1 review. Chrome 56 limits aren't type-checked for DOM/CSS, so: no `AbortController` (use XHR), no flex `gap`, no `import.meta.url`, no code-splitting (single iife bundle). TizenBrew's loading model is a high-impact unknown, so B2 starts with a real-TV spike.
- 2026-11-07: A4 found and fixed a deadlock in the existing (unused) `SearchMovieSilent`. The search cache and CallbackHost moved from `api` to `providers` to avoid an import cycle.
- 2026-11-07: A4 review. A client abort does not cancel the search: Burst can't be cancelled inside Kodi, and the finished result warms the cache. Duplicate concurrent searches are accepted, as on the Kodi routes; the TV disables the button while a search runs. `Stream.uri` may expose a host path or a provider URL with a cookie or passkey to API clients; this is accepted for a LAN API, and A5 validates URIs. TMDB outage → 404 is a known limit. Possible hang in the non-silent Kodi search (`providers/search.go:242-262`): out of scope, follow-up.
- 2026-11-07: (User) Deployment is done with **Apps2Samsung** (`.wgt` from GitHub Releases) instead of TizenBrew. This drops npm publishing, TizenBrew module fields and the spike; AVPlay is the TV player again.
- 2026-11-07: B2 merged. Apps2Samsung re-signs every `.wgt` with the user's own certificate (verified in its source), so the CI signature only has to be valid. The release asset is `Elementum-<version>.wgt`. Catalog listing is possible via a PR to Apps2Samsung/tizen-community-packages (maintainers' call; their rules exclude apps shipping torrent indexers, which we don't). Until then, users add `ElementumOrg/elementum-tizen` as a custom source.
- 2026-11-07: Follow-ups outside the plan (pre-existing, not fixed): data races in `cache.NewDBStore` (`dbstore.go:43`) and `reqapi.Request.Do` (`request.go:164`) found by `-race`; possible hang in the non-silent Kodi search (`providers/search.go:242-262`).
- 2026-11-07: (User) `type=multi` is removed from `/search`: it can't honour `limit` without a TMDB refactor, and the TV calls movie and show search separately.
- 2026-11-07: B2 research. A TizenBrew module is published to npm (GitHub tags don't contain `dist/`), and pages are served from `http://127.0.0.1:8081` with no `tizen`/`webapis`, so HTML5 `<video>` is used under TizenBrew and AVPlay only in the `.wgt`.
- 2026-11-07: A5 integration passed against a standalone daemon (no Kodi): Sintel resolving→buffering→ready, ranged 206, HEAD, tampered link 403, DELETE cleanup, resume, reaper, and choosing_file re-POST.
- 2026-11-07: (User) Every list endpoint takes `limit` (1–100; default `results_per_page`). Responses add `limit` + `total_results`. The existing fetchers get a `perPage` argument instead of reading the global config.
- 2026-11-06: Known, unchanged: CORS `*` with auth off by default lets any LAN web page call the API, the same as existing Kodi routes like `/playuri` and `/shutdown`. Document it in the README in B10, and recommend setting a login.
- 2026-11-06: The app name is `Elementum` (id `ElmntmTV01.Elementum`). `oapi-codegen` + `kin-openapi` are approved for Elementum's `go.mod`.
