# A9: UI host interface (design, read-only research)

Nothing was changed in the Go repo (`/home/elgato/Develop/elementum`, branch `api`). Counts are call sites outside `xbmc/` and `vendor/`, from `grep` on 2026-11-08. Paths are relative to the Go repo.

## 1. Inventory of Kodi UI use

Methods are in `xbmc/xbmcgui.go` (`Notify` :157, `Keyboard` :196, `Dialog` :203, `DialogConfirmNonTimed` :217, `DialogConfirm` :224, `DialogConfirmFocused` :229, `DialogText` :252, `DialogTextModal` :259, `ListDialog` :264, `ListDialogWithOptions` :271, `DialogMultiSelect` :278, `ListDialogLarge` :285, `DialogInsert` :26, `DialogBrowseSingle` :210, `NewDialogProgress` :33, `NewDialogProgressBG` :72, `DialogProgressBGCleanup` :66, `NewOverlayStatus` :104); `xbmc/xbmcaddon.go:55` (`AddonFailure`, a dialog in the addon); `xbmc/upnext.go:4` (`UpNextNotify`). All are JSON-RPC calls to the Kodi Python side. Strings are passed as `LOCALIZE[30xxx];;arg;;arg` and translated by Kodi (`TranslateText`, `xbmc/xbmc.go:560`).

| Kind | Blocks for answer? | Call sites (per package) |
|---|---|---|
| `Notify` (toast) | no | 121: api 81, trakt 19, bittorrent 9, library 5, opensubtitles 3, tmdb 2, database 1, tracker 1, main.go 1 |
| Confirm (`Dialog`, `DialogConfirm`, `DialogConfirmFocused`, `DialogConfirmNonTimed`) | yes (yes/no) | 36: api 20 (13 focused), bittorrent 7, library 3, trakt 2, tracker 1, config 1, plus 2 `Dialog` |
| Select (`ListDialog`, `ListDialogLarge`, `ListDialogWithOptions`, `DialogMultiSelect`) | yes (index/indexes) | 20: api 17, bittorrent 1 (`torrent.go:2045`, the file picker) |
| Input (`Keyboard`, `DialogInsert`) | yes (string) | 11: api 11 |
| Text (`DialogText`, `DialogTextModal`) | yes / no | 3, all api |
| Progress (`NewDialogProgress`, `NewDialogProgressBG`, `NewOverlayStatus`, `DialogProgressBGCleanup`) | no (but `IsCanceled()` is polled) | 12: bittorrent 5 (`player.go:313,320`, `service.go:691,1686`, `torrent.go:1590`), providers 1 (`search.go:243`), api 5, main.go 1 |
| `AddonFailure` | yes | 3, all api |

Who calls from where:
- **Request goroutines (Kodi route handlers).** Almost all of `api/*` (about 130 sites): they hold a request-scoped host (`xbmc.GetXBMCHostWithContext(ctx)`, `xbmc/jsonrpc.go:159`) and block on the dialog while the Kodi plugin waits for the HTTP response. Blocking is fine here.
- **Player goroutines.** `bittorrent/player.go` (`playerLoop`: resume confirm :403, buffer progress :313-320, notifications :729-781) and `bittorrent/torrent.go` (RAR confirm :1762, file picker :2045, "no matching file" :2011). They use `btp.xbmcHost`, copied from the request that started playback. In `External` (API) mode, `btp.xbmcHost` is nil and no dialog is shown (`player.go:134,269`); `ErrChooseFile` is returned to the client instead (`player.go:52`).
- **Background loops with no request.** `trakt/trakt.go` token refresh (:247, :274...), `opensubtitles/client.go:105-263`, `library/library.go` (sync :145, :1396, :1740; confirm :232, :243 inside the library loop), `database/bolt.go:65`, `tmdb/tmdb.go:62,98`, `tracker/auth.go:79,97` (device-auth dialog, then polling in a goroutine), `bittorrent/service.go` (:735, :818, remove confirms :1060-1092, background progress :1686), `main.go:289`. They all use the global `xbmc.GetLocalXBMCHost()` (single local Kodi) and test `!= nil`. About 40 sites use that pattern (`grep GetLocalXBMCHost`).
- **Config.** `config/config.go:445` shows a `Dialog` on a Reload failure, inside Reload.

## 2. How `xbmcHost` is obtained today

- **Request-scoped:** `GetXBMCHostWithContext(ctx)` (`xbmc/jsonrpc.go:159`). A request with `User-Agent: plugin.video.elementum` (and not behind NAT) maps to the Kodi at `ctx.ClientIP()`. Anything else (browser, TV) gets a `?kodi=` or cookie-selected host, else the local host. A TV request therefore already resolves to the local Kodi, if one is registered. `apiv1/streams.go:39,69` calls it and treats nil as "no Kodi".
- **Global:** `GetLocalXBMCHost()` (:148) returns `XBMCLocalHost` or an error. `XBMCHosts` is a mutex-guarded list filled by `AddXBMCHost` (:117) on the addon's first call.
- **Nil handling is ad hoc:** every background site wraps the call in `if h != nil`, and several Kodi-only features silently do nothing without Kodi. `apiv1/actions.go:178` uses the local host for API actions.
- Important: `XBMCHost` is a value type with a nil-unsafe `executeJSONRPCEx` receiver (`docs/elementum-notes.md` section 7), so a nil `*XBMCHost` panics on the first call. A `ui.Host` that is never nil removes that whole class of bug.

## 3. Design

### 3.1 Package `ui` (new, small, imports nothing from Elementum)

```go
package ui
type Host interface {
    Notify(n Notice)                                   // fire and forget
    Confirm(ctx context.Context, q Question) (yes bool, answered bool)
    Select(ctx context.Context, q Question) (idx []int, answered bool)   // multi=false => len 1
    Input(ctx context.Context, q Question) (s string, answered bool)
    Text(ctx context.Context, title, body string)      // modal info, returns when dismissed
    Progress(p Progress) ProgressHandle                // never nil
}
type ProgressHandle interface { Update(pct int, heading, msg string); Canceled() bool; Close() }
type Notice   struct{ Title, Message string; Level string /*info|warn|error*/ }
type Question struct{ Title, Message string; Options []string; Preselect []int; Default any; Timeout time.Duration; Multi bool }
type Progress struct{ Title, Message string; Background bool /*BG vs modal*/ }
```

- Messages keep the `LOCALIZE[30xxx];;args` form on the wire plus a rendered English fallback (the host resolves them: Kodi via `TranslateText`, the HTTP host forwards `message_key` and `args`). The TV app already has the addon `.po` strings (`docs/elementum-notes.md` line 122).
- `answered == false` means timeout, no client, or cancel; the caller then uses its own default (the same default it uses today when `xbmcHost == nil`). This keeps every existing nil-host fallback (e.g. `service.go:1066`) with the same meaning.
- Mapping to Kodi methods: `Dialog*` and `DialogConfirm*` to `Confirm` (a `Focused`/`NonTimed` flag goes into `Question`); `ListDialog*` and `DialogMultiSelect` to `Select`; `Keyboard`/`DialogInsert` to `Input`; `NewDialogProgress/BG` and `NewOverlayStatus` to `Progress`. `DialogBrowseSingle`, `AddonFailure`, `UpNextNotify`, `OpenDirectory` and the settings dialogs stay Kodi-only (a type assertion `host.(*ui.KodiHost)` on the three or four call sites in `api/`).

### 3.2 Implementations

- **(a) `KodiHost`** wraps `*xbmc.XBMCHost`. Each method calls the same XBMCHost method as today, so Kodi output is identical. Lives in package `xbmc` or a thin adapter file, to avoid an import cycle (`ui` must not import `xbmc`).
- **(b) `HTTPHost`** (the in-process broker). Elementum keeps an in-memory `requests` map plus a per-client channel hub.
  - `Confirm/Select/Input/Text`: create `{id, kind, title, message, message_key, args, options, preselect, multi, timeout_s, default}`, push to every connected client, block on the answer channel or `ctx.Done()` or the timeout. The first answer wins; a `cancelled` event is sent to the other clients so their dialogs close.
  - `Notify`: push an event, no wait.
  - `Progress`: `Update/Close` push `progress` events by `id`; `Canceled()` reads a flag set by the client (`POST` with `{cancel:true}`).
  - Events are kept in a ring buffer (last 50, with a monotonic `seq`) so a client that reconnects with `?since=<seq>` loses nothing; open questions are re-sent on connect.
- **(c) `LogHost`** logs at info level, `answered=false`, `Progress` returns a no-op handle. It is the default when nothing is connected, so `ui.Current()` is never nil.

### 3.3 Routing

`ui.For(ctx)` returns the host for a request, `ui.Background()` returns the host for loops:
- **Request-scoped:** a Kodi request (`User-Agent: plugin.video.elementum`) gets its `KodiHost`, unchanged. A request under `/api/v1` gets the `HTTPHost`, restricted to the client id from the `X-Client-Id` header (or the auth session), so one TV answers its own question. If that client has no open event stream, fall back to the local `KodiHost`, else `LogHost`.
- **Background:** a `Multi` host in a configurable order (`ui_priority` in settings.json: `["tv","kodi"]` default). Notify goes to all connected hosts. Confirm/Select/Input go to the first host that has at least one connected client (for the HTTP host, broadcast with first-answer-wins). If it times out, the next host is tried only for confirms that are explicitly marked `escalate`. Default is no escalation.
- The `GetLocalXBMCHost() != nil` checks collapse into `ui.Background()`; `SetSetting` and other non-UI calls keep the Kodi host (A8 handles those).

### 3.4 Concurrency, timeouts, auth, several TVs

- Each request has a hard timeout (default 60 s for confirm/select, 5 min for input, none for progress, overridable in `Question.Timeout`); the answer comes back after the timeout as `answered=false`, and a late `POST` gets 410. Goroutines never leak: the waiter selects on timeout and `ctx.Done()`; stale entries are removed by a 1 minute sweeper.
- Per-client queues are bounded (64 events); the oldest toast is dropped first, never a pending question.
- Auth is the same Basic check as `/api/v1` (`apiv1` middleware); `POST` answers only come from authenticated clients; ids are random 128-bit values.
- Several TVs: clients register with a self-chosen `client_id` on the events call; broadcast for background questions, first answer wins. A request-scoped call goes only to the caller's client.
- An unanswered modal in a request handler holds the HTTP handler: the API playback path never blocks on it (it uses `External` mode, which skips dialogs), so only Kodi-route handlers and the file picker wait.

### 3.5 Long-poll vs SSE (recommendation: long-poll)

- Tizen 4 is Chrome 56 and supports `EventSource`, but: it cannot send an `Authorization` header (the app already works around this for stream URLs with HMAC; we would need a signed query token), it has no `Last-Event-ID` control on manual reconnects, gin needs flusher handling, and some proxies and the TV's network stack buffer or time out idle streams. The app already uses XHR everywhere (no AbortController, `docs/elementum-tizen-plan.md` decisions), so Basic auth headers just work with XHR.
- Long-poll `GET /api/v1/ui/events?since=<seq>&wait=25&client_id=...` returns `200 {events:[...], seq}` or `204` after 25 s. It is loop-simple, works with the same auth, is trivially testable with `httptest`, and the cost is one request per 25 s per TV. Latency is the same as SSE.
- SSE can be added later as `Accept: text/event-stream` on the same endpoint if wanted.

## 4. Spec changes (`apiv1/openapi.yaml`)

- `GET /ui/events` query `client_id` (required), `since` (int), `wait` (0..60, default 25). 200 `UIEventBatch {seq:int, events:[UIEvent]}`; 204 when nothing; 401 as everywhere.
- `UIEvent {seq:int, id:string, type:enum[notify,confirm,select,input,text,progress,cancelled], title:string, message:string, message_key?:string, args?:[string], options?:[string], preselect?:[int], multi?:bool, timeout_s?:int, level?:enum[info,warn,error], percent?:int, background?:bool, done?:bool, default?:any}`.
- `POST /ui/requests/{id}` body `UIAnswer {client_id:string, yes?:bool, selected?:[int], text?:string, cancel?:bool}`. 204 accepted; 404 unknown id; 410 already answered or expired. Also used for `progress` cancel (`cancel:true`).
- Error codes: `ui_request_expired` (410), `ui_request_unknown` (404).
- `Settings`: add `ui_priority` (list) to the A8 settings.json bundle.

## 5. TV app presentation

- A `uiClient` module starts the long-poll loop after Setup (and keeps it across screens), backs off 1 s to 10 s on errors, and stops on 401.
- `notify`: toast (existing toast component, B-steps), auto-dismiss after 4 s; `level` sets colour. `confirm`/`select`: the existing `Dialog` component with OK/Cancel or a focusable list (multi: checkmarks); Back sends `cancel:true`. `input`: the on-screen keyboard (existing search keyboard); empty/Back cancels. `text`: scrollable Dialog. `progress`: a bar at the top (background) or a full dialog with a Cancel button (modal); `done`/`cancelled` closes it.
- A new dialog replaces nothing already open: events queue FIFO, the player screen shows toasts only (questions pause until the player closes or ask immediately if marked `urgent`).
- Strings: `message_key` goes through the i18n tables; `message` is the fallback.

## 6. Migration path (Kodi output unchanged at each step)

1. Add package `ui` (interface, `KodiHost`, `LogHost`, `Multi`, registry) with no call-site changes. Unit tests with a fake.
2. Replace the ~40 `GetLocalXBMCHost()` background-notify sites with `ui.Background().Notify(...)`, one package per PR: tracker (device auth), trakt, bittorrent, library, opensubtitles, tmdb. Sites that also need `SetSetting` keep the Kodi host.
3. Add `HTTPHost`, the two endpoints and the TV client. This is the first point at which the TV sees anything.
4. Move the API-path dialogs: resume confirm and file picker (`player.go:403`, `torrent.go:2045`, today `ErrChooseFile`), `RemoveTorrent` confirms (`service.go:1060-1092`), tracker auth, provider errors (`providers/search.go`), buffering progress (`player.go:313`, `service.go:1686`).
5. Finally the `api/*` Kodi handlers (about 130 sites) move to `ui.For(ctx)`. Optional and mechanical; leave them on `xbmcHost` if there is no need.
6. Delete the remaining nil checks.

## 7. Steps and estimates

| Step | Where | Size |
|---|---|---|
| U1 `ui` package, `KodiHost`, `LogHost`, `Multi`, registry, tests (table tests against a fake `XBMCHost`) | Go | M |
| U2 background notify sites to `ui.Background()` | Go | M |
| U3 `HTTPHost` broker, `/ui/events`, `/ui/requests/{id}`, spec, strict-server handlers, tests (timeout, first-answer-wins, late answer 410, reconnect with `since`, 401) | Go | L |
| U4 TV `uiClient` plus toast/confirm/select/input/progress views, mock server and unit tests | TV | M |
| U5 move API-path dialogs (resume, file picker, remove, tracker auth, progress) | Go | M |
| U6 `api/*` handlers to `ui.For(ctx)` | Go | L (optional) |
| U7 real-TV check of focus/keyboard behaviour | TV | S |

Total: about L+M+M+M+M (without U6).

## 8. Open questions for the user

1. Long-poll first (recommended), or SSE from the start?
2. Background questions with several screens: broadcast with first answer wins (recommended), or a single chosen TV (`client_id` setting)?
3. Should an unanswered background confirm escalate to Kodi, or use the default silently (recommended)?
4. Is it OK that modal dialogs are never shown during TV playback unless marked urgent (toasts only)?
5. Do the Kodi-route handlers (about 130 sites) need to move at all, or only the API-path and background ones (recommended)?
6. Should the HTTP host also be usable by a browser Web UI (`/web`) later? If yes, `client_id` becomes a mandatory concept in the spec now.
7. Is it acceptable that strings are sent as `message_key` plus args for the TV to translate from its bundled `.po` data, instead of Elementum resolving them in its own language?
