# A8a: Elementum settings from a JSON file (research and design)

Read-only research. Nothing was built or changed in the three repos. Elementum = `/home/elgato/Develop/elementum` (branch `api`), addon = `/home/elgato/Develop/plugin.video.elementum` (`master`), lt2http = `/home/elgato/Develop/lt2http` plus `/home/elgato/Develop/service.lt2http`.

## 1. How lt2http does it

**Addon (Python)**
- Collects ALL settings by walking its own `resources/settings.xml` and calling `ADDON.getSetting(id)` for each id with a type cast (`resources/site-packages/lt2http/config.py:22-77`, `get_current_settings`). Ids ending in `_path` go through `translatePath`, so absolute paths are stored. It adds `language` from `xbmc.getLanguage`.
- File: `special://temp/lt2http-config.json` (`daemon.py:46`), a flat `{id: value}` object. Written with a plain `open(..., 'w')`, NOT atomic, errors swallowed (`daemon.py:366-377`, `write_binary_config`).
- Written when: before every binary start (`daemon.py:286`) and in client mode (`daemon.py:423`). `onSettingsChanged` (`monitor.py:54`) does NOT rewrite the file for a local binary. It calls `update()` (`daemon.py:388-409`), which POSTs the full settings JSON to `lt2http /settings/set`. Only in client mode (binary elsewhere) does it rewrite the file too.
- The file is only a startup input. Runtime changes go over HTTP.

**Binary (C++)**
- Told by CLI flag `--config=<path>` (`daemon.py:258`; `src/app/main.cpp:65` for the shared library). There is no watcher and no signal.
- Reads the file once at startup via boost::program_options plus a JSON parse (`src/app/config.cpp:163-185`). A missing file is fatal (unless `--update`); an invalid file is fatal (`throw invalid_argument`). `--update` writes the merged config back (`config.cpp:215-226`, also non-atomic).
- Runtime: `POST /settings/set` parses the body onto the live config (absent keys keep their value) and calls `session().reconfigure()` (`src/web/settings.h:46-58`). Invalid JSON gives HTTP 500 and the config is unchanged.

Lesson: lt2http has two channels, the file at startup and HTTP at runtime. It has no atomic writes and no file watching.

## 2. Elementum today

**Already there**
- `-configPath` (`config/config.go:353`, `Args.ConfigPath`) makes `fetchConfiguration` return `importConfig(path)` and skip Kodi entirely (`config.go:1268-1271`). `-exportConfig` writes the Kodi-derived bundle (`config.go:482-486`, `exportConfig` at `:1212`). Format by suffix: `.json` or `.yml`. Both take a `ConfigBundle` (`config/types.go:7`):
  `{Info *xbmc.AddonInfo, Platform *xbmc.Platform, Settings map[string]any, Language, SecondLanguage, Region}`. `exportConfig` uses `os.WriteFile(0644)` (not atomic, not private).
- `Settings` has the raw Kodi setting ids with typed values (the number/enum/slider/bool/string cast is in `fetchConfiguration`, `config.go:1286-1320`). `Reload` reads them with `ToString/ToInt/ToBool`.
- Reload trigger: the addon `onSettingsChanged` calls `GET /reload` then `/cmd/clear_page_cache` (`plugin.video.elementum/resources/site-packages/elementum/monitor.py:99-111`). `/reload` runs `s.Reconfigure()` (`api/misc.go:298`), which calls `config.Reload()`. Settings in `self.monitored` (token refresh etc.) are ignored (`monitor.py:45-51`).
- `-serverMode` / `ServerMode` exist (`config.go:301`) and skip the parent-process watcher (`main.go:246-258`).

**Everything `Reload` takes from Kodi** (all in `fetchConfiguration` and `Reload`, `config.go:1268-1338`, `401-1010`)
| Value | Source | Needed in the file |
|---|---|---|
| all settings | `GetAllSettings` | yes (`Settings`) |
| `Info` (ID, Version, Path, Profile, Home, Xbmc, Icon, Name) | `GetAddonInfo` plus `TranslatePath` | yes, absolute paths translated at write time |
| `Info.TempPath` | `special://temp` + `/elementum` | yes |
| `Platform` (OS, Arch, Kodi major version) | `GetPlatform` | yes (`main.go:178` reads `conf.Platform.Kodi` and Reload derefs `platform.OS` at `:~545`) |
| `Language`, `SecondLanguage`, `Region` | `GetLanguageISO639_1`, `GetRegion` (`config.go:1340`, `xbmc/xbmc.go:648`) | yes, already in the bundle |
| `download_path`, `torrents_path`, `library_path` | `TranslatePath` (`config.go:1039-1076`; special://temp creates the dir) | write time: addon stores translated paths. With nil host `translatePath` returns the path as is (`:1047`), so the load works if they are already absolute |
| `KodiBufferSize` | reads `special://userdata/advancedsettings.xml` (`:1108`, used `:974`) | add `KodiBufferSize int` to the bundle, addon parses the file (or the binary does it from `Info.Home`+`userdata` when no host) |
| `libraryReadOnly` | `isLibraryReadOnly` queries Kodi sources and library (`:1377`; returns true when host is nil) | file mode: nil host gives read-only, which is correct without Kodi. Optional `LibraryReadOnly *bool` in the bundle for a Kodi-less library master |
| Windows Store path fix | `info.Xbmc` | inert in file mode |
| `xbmc.DialogAutoclose` etc. | settings | n/a |

**Gaps in the existing import path**
1. `Reload` still resolves `xbmcHost` first (`:419-426`) and `defer`s a recover that talks to Kodi (`:437-455`). `GetLocalXBMCHost` may return nil; the code downstream already tolerates a nil host in `translatePath`, `getKodiBufferSize` and `isLibraryReadOnly`.
2. No version field, no validation (an empty `Info.ID` or nil `Platform` panics later), no file watching.
3. Runtime write-backs go to Kodi only: Trakt tokens (`trakt/trakt.go:259-261,317-319,343,393-396`), OpenSubtitles token (`opensubtitles/client.go:106,114`), and `api/cmd.go:119-121` which resets paths. `SetSetting` is a Kodi call (`xbmc/xbmcaddon.go:96`) and without Kodi it is skipped, so tokens would be lost. Credentials in the file go stale after a refresh.
4. `main.go:173-181` exits if Reload fails. `ensureSingleInstance` uses `conf.Info.Profile` (fine in file mode).

**How the addon starts the binary** (`resources/site-packages/elementum/daemon.py`): waits for Kodi JSON-RPC on 9090 (`jsonrpc_enabled`, `:217-241`; aborts if absent), kills a stale lockfile process, then runs `elementum -remotePort=<local_port> -localHost -localPort -localLogin -localPassword` (`:361-386`). Its env is `LD_LIBRARY_PATH` only. Kodi host = `127.0.0.1` unless `-remoteHost` is passed. A shared-library mode (`elementum.so`) is used on some platforms.

**What needs live Kodi regardless of settings** (and today's behaviour without it; details in `docs/elementum-notes.md` section 6-7):
- Provider/Burst search: `ExecuteAddon` plus `/callbacks` (`providers/xbmc.go:451-472`). With no host: no providers, so the `/links` search returns empty. Degrade to an error "no Kodi".
- Dialogs, notifications, progress (`NewDialogProgress`, `Notify`, `ListDialog`). The API player path must stay nil-host safe (notes section 7: `playerLoop` panics with a nil host).
- Kodi library scans/sync and Kodi library views (`/movies/library`), `uid` resume.
- Player callbacks `/notification` (Player.OnPlay etc.) and `PlayerIsPlaying`, so Kodi-launched playback needs Kodi. API (TV) playback does not.
- Trakt device auth (`trakt.Authorized()` shows Kodi dialogs), repository check (`main.go:318-330`, already guarded by a `Ping`), greeting notification (guarded).

## 3. Design

**Principle**: reuse `ConfigBundle` as the file schema (it is already what `-exportConfig` writes and `-configPath` reads), add a version field, write it atomically from the addon, poll it in the binary.

1. **Format and location.** JSON `ConfigBundle` plus `"Version": 1` (new field; absent means 0, legacy export) and `"KodiBufferSize"`. Default path `<addon profile dir>/settings.json` (the addon already knows it: `get_addon_profile_dir()`, `daemon.py:~330`). The addon passes `-configPath=<path>` (the profile path is only known from the file, so the flag is the only discovery rule). Paths in `Info` and the `*_path` settings are the absolute translated paths (like lt2http `config.py:68-72`). Write `Info.Path` etc. from `ADDON.getAddonInfo` + `translatePath`.
2. **Writer (addon).** `write_settings_file()`: collect ALL settings (reuse the `settings.xml` walk from lt2http; the addon's `resources/settings.xml` has the same layout) with the same type casts that `fetchConfiguration` applies, plus Info/Platform/Language/Region/KodiBufferSize. Write `settings.json.tmp` with mode `0600` (`os.open(..., 0o600)`), `flush`+`fsync`, then `os.replace` onto `settings.json` (atomic on POSIX and Windows). Call it on service start (before spawning the binary) and in `onSettingsChanged`, including for the "ignored" token properties (cheap, keeps the file current), then trigger the reload as today.
3. **Reader (binary).** At startup, `fetchConfiguration` takes the existing `importConfig` path when `-configPath` is set (already works). Add: validation (Version, `Info.ID`, `Info.Profile`, `Platform` non-nil, else a clear error), a file watcher, and a Kodi-independent `Reload` (no recover dialog when host is nil). Reload trigger, recommended: **mtime+size polling every 2 s** in a goroutine, calling `s.Reconfigure()` when it changes and the new file parses; a bad file is logged and the previous config kept. Reasons: fsnotify is only an indirect old entry in `go.sum` (v1.4.9), not in `go.mod`; it is unreliable on WSL/9p, Android, and network mounts; polling a stat is trivial. Keep `GET /reload` as the immediate trigger (it will re-read the file in file mode), so a current addon still works instantly and the poll is the fallback for Kodi-less operation (a web UI or a text editor edit).
4. **Precedence.** `-configPath` wins and Kodi is not queried for settings (existing behaviour). If a Kodi host answers (Ping) in file mode, it is used only for Kodi features, never for settings. No merge. Rationale: a single source of truth, no surprises about which value applies. If the user wants "live Kodi" semantics they simply omit `-configPath` (today's behaviour is unchanged).
5. **Kodi absent.** `kodi_connected` is true if `xbmcHost.Ping()` succeeds; compute lazily with a short cache (~5 s) and report it in `GET /api/v1/system/info` (`apiv1/api.gen.go:1352`, handler in api package) as `kodi_connected` plus `settings_source: "file" | "kodi"` and `settings_mtime`. Disabled when false: provider search (return 503 "Kodi/Burst not available"), Kodi library views/sync, Trakt device auth (return an error instead of Kodi dialogs), notifications (no-ops, already guarded by nil checks). TV/API playback, TMDB, trackers with existing tokens, torrents keep working. Remove the `main.go:178`-style assumptions: do not exit when Kodi is unreachable in file mode.
6. **Runtime write-back.** Replace direct `xbmcHost.SetSetting(...)` calls (trakt, opensubtitles, `api/cmd.go:119`) with `config.SetSetting(key, value)`: update the in-memory settings, atomically rewrite the file's `Settings` entry (temp+rename, `0600`), and also call `xbmcHost.SetSetting` if connected. Races: the addon writes the whole file, the binary writes single keys. Mitigation: the addon rewrites on `onSettingsChanged` reading the real Kodi values (Kodi gets the same write-back, so it stays consistent); and without Kodi nobody else writes. Accept last-writer-wins.
7. **Security.** The file holds `trakt_token`, `trakt_refresh_token`, `opensubtitles_token`, `remote_password`, proxy login/password, `-localPassword`. Create with `0600` (Linux/Android/macOS); on Windows rely on the profile ACL; never log the file contents (`Reload` logs login/password today at `config.go:426-427`, mask in file mode); `/files/` and `/debug/*` remain unauthenticated (notes section 2), unchanged. Also warn when the file mode is wider than `0600` on POSIX. `-exportConfig` should switch to `0600` too.
8. **Compatibility.**
   - Old addon + new binary: the addon never passes `-configPath`, so the binary asks Kodi as today. No change.
   - New addon + old binary: the old binary ignores a file it is never told about, but it would reject the unknown flag? `tagflag` errors on unknown flags, so the new addon must pass `-configPath` only if the binary supports it. Detect by binary version (the addon already ships the binary with its release) or by running `elementum -help`. Simplest: the addon bumps its minimum binary version and the packaged binary and addon are released together.
   - Old `-exportConfig` files (no `Version`) load as Version 0; accepted. Unknown newer `Version` is a startup error, a reload keeps the old config.
   - Shared-library mode: the addon passes the same args, nothing else changes.

## 4. Steps

**Go (Elementum, branch `api`)**
| # | Step | Size | Tests |
|---|---|---|---|
| G1 | `ConfigBundle.Version` and `KodiBufferSize`; validation in `importConfig`; make `exportConfig` atomic and `0600`; `fetchConfiguration` file mode uses `KodiBufferSize` when the host is nil | S | table tests in `config/` for the valid, missing field, bad version, bad JSON and yaml cases |
| G2 | `Reload` with no Kodi: skip the recover dialog when the host is nil, do not exit; mask credentials in logs | S | Reload with a fixture file and a nil host (no network) |
| G3 | File poller (mtime+size, 2 s) triggering `Reconfigure`; keep the old config on a bad file; `/reload` re-reads the file | M | temp-dir test: write, change, write garbage (config unchanged), write fixed |
| G4 | `config.SetSetting` write-back replacing the direct `SetSetting` calls (trakt, opensubtitles, `cmd.go`) | M | write-back test, concurrent writes with `-race` |
| G5 | Graceful degradation: `kodi_connected` and `settings_source` in `/api/v1/system/info` (OpenAPI + regen), 503 for provider search, no Kodi dialogs for trakt auth when no host | M | handler tests with a nil host |
| G6 | Docs: `-configPath` flow and the file schema in the README | S | none |

**Python (addon, `master`)**
| # | Step | Size | Tests |
|---|---|---|---|
| P1 | `settings_file.py`: collect all settings (+ Info, Platform, Language, Region, advancedsettings buffer size), atomic `0600` write | M | pytest with a mocked `xbmcaddon` and `settings.xml`: types, translated paths, atomicity (no partial file after a simulated failure) |
| P2 | Call P1 at service start before spawning the binary and in `onSettingsChanged` (also for ignored token changes); pass `-configPath`; keep `/reload` | S | monitor test with mocks |
| P3 | Remove the hard dependency on the JSON-RPC wait loop when the file mode is on (start anyway; Kodi features come later) | S | manual |
| P4 | Version gate: only pass `-configPath` to a binary that supports it | S | unit test |

Estimate: about 1 to 1.5 days Go, 0.5 to 1 day Python, plus a TV/Kodi smoke test.

## 5. Open questions for the user
1. Addon branch for A8c: `master` of `plugin.video.elementum`, or a new branch? (it is `master` now.)
2. Standalone Kodi-less start: who writes the first `settings.json`? Options: `-exportConfig` once from a Kodi install, or a documented minimal sample the user edits. Should the binary also create a default file if missing?
3. Precedence: OK with "file wins, Kodi never queried for settings" when `-configPath` is set, or should live Kodi values override the file when Kodi is reachable?
4. Is polling every 2 s acceptable, or do you want fsnotify (adds a direct dependency, less reliable on WSL/Android)?
5. Trakt device auth without Kodi: just return an error, or add an API flow later (the TV app could show the code)?
6. Should the binary also write back tokens into the file when Kodi is present (recommended in G4), or leave Kodi as the only writer in that case?
7. Provider search without Kodi: error 503, or leave it for a later "native Burst" step?
