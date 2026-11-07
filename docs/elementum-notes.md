# Elementum internals — Step 0 notes

Source: `/home/elgato/Develop/elementum` @ `master` (628b5b6), addon `/home/elgato/Develop/plugin.video.elementum` @ `master`.
All paths below are relative to the Elementum repo unless prefixed with `addon:`. Read-only research; nothing was built or changed.

## 1. Engine, routes, versions

- Go `1.27.2` (`go.mod:3`), gin `v1.12.0` (`go.mod:17`). Tool directive already used: `tool github.com/tinylib/msgp` (`go.mod:109`).
- Engine: `api.Routes(s, shutdown, fileLogger) *gin.Engine` in `api/routes.go:77`.
  - `gin.New()` + `gin.Recovery()` (`:78-79`), custom logger (`:86-90`), `CORS()` (`:91`), `Auth()` (`:92`) — **all global `r.Use`**, so every gin route gets CORS + Basic auth.
  - Registration style: plain `r.GET(...)` / `r.Group(...)` with handler funcs or closures `func X(s *bittorrent.Service) gin.HandlerFunc` (`api/routes.go:96-513`).
- Mounting (`main.go:262-285`): `http.DefaultServeMux` gets `/debug/pprof/*`, `/debug/perf`, `/debug/lockTimes`, `/debug/vars`, then `http.Handle("/", api.Routes(...))` (`:279`) and
  `http.Handle("/files/", ...)` (`:281-285`) which is **outside gin** (no Auth, no CORS):
  ```go
  handler := http.StripPrefix("/files/", http.FileServer(bittorrent.NewTorrentFS(s, r.Method)))
  ```
- Server: `http.Server{Addr: LocalHost:LocalPort}` (`main.go:354-363`).
- Existing Go package `api` = the directory `api/` (~40 files, all Kodi handlers, `var log` at `api/routes.go:22`).

## 2. Authentication

- Mechanism: HTTP Basic via `gin.BasicAuth`, only when a login or password is set (`api/routes.go:65-75`):
  ```go
  if config.Args.LocalLogin == "" && config.Args.LocalPassword == "" { c.Next(); return }
  gin.BasicAuth(gin.Accounts{config.Args.LocalLogin: config.Args.LocalPassword})(c)
  ```
  Failure = 401 with `WWW-Authenticate: Basic realm=...` and **empty body** (gin default).
- Credentials are CLI flags only: `config.Args.LocalLogin/LocalPassword` (`config/config.go:353-354`), parsed by `tagflag.Parse(&config.Args)` (`main.go:134`).
  The addon passes them from its settings `remote_login` / `remote_password` (addon:`resources/settings.xml:449-450`) as `-localLogin=` / `-localPassword=` (addon:`resources/site-packages/elementum/daemon.py:381-386`).
- Daemon port: `config.Args.LocalPort` default **65220** (`config/config.go:373`). Naming is inverted in the addon: addon setting `remote_port` (default 65220) = daemon port, `local_port` (65221) = Kodi-side JSON-RPC port.
- Not protected: `/files/*` and `/debug/*` (on DefaultServeMux, not gin). Credentials are logged in plain text at Info (`config/config.go:426-427`).
- Burst callbacks (`POST /callbacks/:cid`, `api/routes.go:452`) go through Auth; providers receive `CallbackLogin/Password` (`providers/xbmc.go:458-459`).
- Existing CORS (`api/routes.go:49-63`): `Allow-Origin: *`, `Allow-Credentials: true`, headers incl. `Authorization`, methods `POST, HEAD, PATCH, OPTIONS, GET, PUT` — **no `DELETE`**. OPTIONS → 204 before Auth.

## 3. TMDB

All fetchers take `language string` explicitly and return plain structs (data layer). ListItem building is separate (`ToListItem`/`SetArt` methods + `api/*` render funcs).

| Need | Function | Notes |
|---|---|---|
| movie details | `tmdb.GetMovie(id, lang)` `tmdb/movie.go:56` → `GetMovieByID` `:61` | `append_to_response=credits,images,videos,translations,external_ids,alternative_titles,release_dates`; cache 24h |
| many movies | `tmdb.GetMovies(ids, lang)` `tmdb/movie.go:99` | concurrent, keeps order (`getMany` `tmdb/tmdb.go:198`) |
| popular / by genre / country / orig. lang | `tmdb.PopularMovies(DiscoverFilters{Genre,Country,Language}, lang, page)` `tmdb/movie.go:298` | `/discover/movie` sort popularity |
| recent ("now playing") | `tmdb.RecentMovies(...)` `tmdb/movie.go:333` | discover, `primary_release_date.desc`, `vote_count.gte=10` — not TMDB `now_playing` |
| top rated | `tmdb.TopRatedMovies(genre, lang, page)` `tmdb/movie.go:378` | `genre` arg is **ignored** |
| most voted | `tmdb.MostVotedMovies` `tmdb/movie.go:383` | |
| arbitrary discover (year etc.) | `tmdb.DiscoverMovies(napping.Params, lang, page)` `tmdb/movie.go:372` | e.g. `primary_release_year` |
| genres | `tmdb.GetMovieGenres(lang)` `tmdb/movie.go:106`, `tmdb.GetTVGenres(lang)` `tmdb/show.go:444` | en-US fallback for empty names |
| search | `tmdb.SearchMovies(q, lang, page)` `tmdb/movie.go:159`, `tmdb.SearchShows` `tmdb/show.go:175` | raw TMDB page (20/page); returns full details per hit |
| show details | `tmdb.GetShow(id, lang)` `tmdb/show.go:124` | `credits,images,videos,translations,external_ids,alternative_titles,content_ratings`; `Show.Seasons` = season summaries |
| show lists | `PopularShows` `:270`, `RecentShows` `:352`, `RecentEpisodes` `:387`, `DiscoverShows` `:423`, `TopRatedShows` `:429`, `MostVotedShows` `:434` (all `tmdb/show.go`) | same shape as movies |
| season + episodes | `tmdb.GetSeason(showID, n, lang, len(show.Seasons), true)` `tmdb/season.go:27` | episodes with `StillPath`, `AirDate`, `Overview` |
| episode | `tmdb.GetEpisode(showID, s, e, lang)` `tmdb/episode.go:24` | |
| find by external id | `tmdb.Find(externalID, source)` `tmdb/tmdb.go:215` | for tracker items without TMDB id |
| images | `tmdb.ImageURL(path, size)` `tmdb/tmdb.go:139` (base `https://image.tmdb.org/t/p/`, `:28`); `GetLocalizedImages` `:407` | |

- Missing in Elementum: TMDB `trending`, `movie/now_playing`, `movie/upcoming`, `search/multi`. Adding one is a 1-line exported wrapper around unexported `listMovies(endpoint, params, page)` (`tmdb/movie.go:230`) / `listShows` (`tmdb/show.go:202`).
- **Paging quirk**: `listMovies`/`listShows` re-slice TMDB pages into `config.Get().ResultsPerPage` items per page (`tmdb/movie.go:236-243`) and return `TotalResults` (not pages). Each list item triggers a full `GetMovie` detail fetch (`:283`), cached 24h. Search functions instead use raw TMDB pages. API `total_pages` = `ceil(total/ResultsPerPage)` for lists, `ceil(total/20)` for search.
- Types: `tmdb/types.go:26-130` (`Movie`, `Show`, `Season`, `Episode`, embedded `Entity` with `Title`, `Name`, `Overview`, `PosterPath`, `BackdropPath`, `VoteAverage`, `Genres []*IDName`, `Images{Posters,Backdrops,Stills,Logos}`, `Videos`, `Credits`, `ExternalIDs`). `msgp` code is generated from this file (`tmdb/types.go:9`) — changing these structs requires `go generate`.
- Language: `config.Get().Language` is ISO 639-1 (`"de"`, or the code from the `language` setting `"Name | code"`), else Kodi's language (`config/config.go:1317-1339`); `SecondLanguage` default `en`.
  - **Per-call override is feasible**: every fetcher takes `lang`; the cache key includes all query params (`util/reqapi/request.go:88-91`), so languages cache separately.
  - Caveats: `include_image_language`/`include_video_language` always come from config (`GetUserLanguages` `tmdb/tmdb.go:493`); the translation-fallback helpers `GetTitle()`/`overview()`/`GetName()` read `config.Get().Language` (`tmdb/movie.go:532-600`, `tmdb/show.go:696-760`). With `language=<lang>` TMDB already fills `Title`/`Overview` in that language, so the API mapping should read those raw fields (plus a translation fallback keyed on the request lang), not `GetTitle()`.
- Caching: `reqapi.Request{Cache: true, CacheExpire: ...}.Do()` (`util/reqapi/request.go:153-210`), msgpack into the cache DB; expiries in `cache/types.go:8-11` (Short 1h, Medium 6h, Long 24h, Extra 7d). Lists use Short, details Long.

## 4. Trakt / trackers

Elementum now has a **generic tracker layer**: `tracker.Register(trakt|simkl|mdblist|scrob)` (`main.go:343-346`), interface `tracker.Provider` + optional `Collector`, `ListReader`, `ProgressReader`, `PlaybackReader` (`tracker/tracker.go`). Items are `tracker.Item{Type, IDs{TMDB,IMDB,TVDB,Trakt}, Title, Year, Season, Episode, EpisodeTMDB}` (`tracker/types.go:14-33`).

- Auth state: `tracker.Active()` = selected tracker if authorized (`tracker/registry.go:47`); `tracker.IsActive("trakt")` (`:55`); Trakt's `Authorized()` = `config.Get().TraktToken != ""` (`trakt/provider.go:21`).
  **Do not call `trakt.Authorized()`** (`trakt/trakt.go:405`): it *starts* the device-auth flow (Kodi dialogs) when there is no token.
- Watchlist / collection / custom lists / progress (data, any tracker): `p.Watchlist(t, refresh)`, `p.(tracker.Collector).Collection`, `p.(tracker.ListReader).Lists()` / `ListItems(listID, t, refresh)`, `p.(tracker.ProgressReader).Progress(refresh)` — Trakt impl `trakt/provider.go:60,69,143,155,166`. `refresh` decided via `tracker.GetActivities(p, key)` + `.Changed(bucket)` (`tracker/state.go:32`), see usage `api/tracker.go:52-53`.
- Trakt-only charts (no auth needed, `GetAvailableHeader`): `trakt.TopMovies(category, page)` `trakt/movies.go:114`, `trakt.TopShows` `trakt/shows.go:261`; categories used: `popular, recommendations, trending, played, watched, collected, anticipated, boxoffice` (`api/trakt.go:467-922`). Return `[]*trakt.Movies` / `[]*trakt.Shows` with `.Movie.IDs.TMDB` / `.Show.IDs.TMDB`, plus `total`.
- Legacy Trakt-specific views still exist (`api/trakt.go:137` `WatchlistMovies` → `trakt.WatchlistMovies(refresh)` `trakt/movies.go:187`; `trakt.WatchedShowsProgress()` `trakt/shows.go:592`); routes `/movies/tracker/*` choose Trakt view vs generic via `trackerView` (`api/tracker.go:26`).
- TMDB mapping: items carry `IDs.TMDB` (may be 0 → fall back to `tmdb.Find(imdb, "imdb_id")`); the Kodi renderers then call `tmdb.GetMovie(id, config.Get().Language)` (e.g. `trakt/movies.go:569-574`).

## 5. Library

- "Elementum library" = storm DB rows `database.LibraryItem{Key, ID, MediaType, State, ShowID}` (`database/types.go:72-79`) + generated `.strm`/`.nfo` files (`library/library.go:467,555`).
  Listing (inline in handlers): `database.GetStormDB().Select(q.Eq("MediaType", library.MovieType), q.Eq("State", library.StateActive), ...).Find(&lis)` then `tmdb.GetMovie` per row — `api/movies.go:221-258` (`MovieElementumLibrary`), shows `api/shows.go:192-...` (`TVElementumLibrary`).
- "Kodi library" variant (`/movies/library`, `api/movies.go:179`) reads Kodi via JSON-RPC (`xbmcHost.VideoLibraryGetElementumMovies()`) — needs Kodi.
- `library.IsInLibrary(id, mediaType)` `library/library.go:970`. Resume/UIDs of Kodi-library items: `uid.GetMovieByTMDB` / `uid.GetShowByTMDB` (used `bittorrent/player.go:1043-1056`).

## 6. Provider (Burst) search

- Call path (movie): `api/movies.go:625 movieLinks` → `providers.GetMovieSearchers(xbmcHost, callbackHost)` (`providers/xbmc.go:85`) → `providers.SearchMovie(xbmcHost, searchers, movie)` (`providers/search.go:77`) → per addon `AddonSearcher.SearchMovieLinks` → `callRaw` (`providers/xbmc.go:451-472`).
  Episode: `api/shows.go:921 showEpisodeLinks` → `GetEpisodeSearchers` (`providers/xbmc.go:103`) → `providers.SearchEpisode` (`providers/search.go:140`).
- Invocation through Kodi: searchers = installed addons `script.elementum.*` from `xbmcHost.GetAddons(...)` (`providers/xbmc.go:74-82`); each is started with `xbmcHost.ExecuteAddon(addonID, payload)` and answers by `POST http://<callbackHost>/callbacks/<cid>` (`providers/xbmc.go:451-466`, handler `:58`). So **Kodi + Burst must be running**; no Kodi host ⇒ no search.
  `callbackHost` must be reachable from Kodi: use `api.callbackHost(ctx, xbmcHost)` (`api/search.go:171`), not the TV's `Host` header. Kodi host for non-addon callers: `xbmc.GetXBMCHostWithContext(ctx)` returns the local Kodi (`xbmc/jsonrpc.go:159-176`).
- Timeouts: per provider `SearchTimeout()` = custom setting or 40 s (`providers/xbmc.go:443-448`, `providers/xbmc_all.go`; arm differs in `xbmc_arm.go`); resolve of `.torrent` URLs `trackerTimeout*2` = 12 s (`providers/search.go:51,200`). Searchers run in parallel, so a search is bounded by ~40 s + 12 s.
- Kodi UI side effects: `processLinks` opens `xbmcHost.NewDialogProgressBG` unless `isSilent` (`providers/search.go:241-266`). Silent variant exists only for movies: `SearchMovieSilent(xbmcHost, searchers, movie, withAuth)` (`providers/search.go:98`, sets `Silent`/`SkipAuth` in the payload `providers/xbmc.go:152-158`). No silent episode variant.
- Result struct `bittorrent.TorrentFile` (`bittorrent/torrent_file.go:35-58`): `URI, InfoHash, Title, Name, Trackers, Size (string), SizeParsed uint64, Seeds, Peers int64, IsPrivate, Provider, Icon, Multi bool, Resolution, VideoCodec, AudioCodec int, Language, RipType, SceneRating int`.
  Enum tables: `Resolutions` (`:117`), `Rips` (`:160`), `Codecs` (`:219`, shared by video and audio).
  **`Multi` = "returned by several providers" (set when merging duplicates, `providers/search.go:298`), not "multi-file torrent".** File count is unknown until metadata is fetched.
- Dedup by infohash (+provider for private) and merge (`providers/search.go:268-301`); sort by settings `SortingModeMovies/Shows` + `ResolutionPreferenceMovies/Shows` (`providers/search.go:371-421`, helpers `providers/sort.go`).
- Result cache: `api.GetCachedTorrents(key)` / `SetCachedTorrents(key, list)` (`api/torrents.go:216,241`), key = movie tmdb id or `"<show>_<season>_<episode>"` (`api/shows.go:1010`); honours `UseCacheSearch` / `CacheSearchDuration`.
- Already-present remote JSON: `/movie/:id/links` and episode `/links` answer non-Kodi User-Agents with a JSON `xbmc.View` list (`wantsLinksList` `api/search.go:189`, `renderLinks` `:194`).

## 7. Play flow

- Entry `GET /play?uri=&tmdb=&type=&show=&season=&episode=&index=&oindex=...` → `api.Play` (`api/play.go:28-152`): builds `bittorrent.PlayerParams` (`:81-102`), reuses a running torrent via `s.GetTorrentByURI` / `GetTorrentByHash` (`:118-139`), `player.Buffer()` (blocking, `:141`), then **302 to `/files/<player.PlayURL()>`** (`:146-147`).
- Add: `Player.Buffer` (`bittorrent/player.go:247`) → `addTorrent` → `s.AddTorrent(xbmcHost, AddOptions{URI, DownloadStorage, ...})` (`bittorrent/service.go:799`), which waits for magnet metadata (`WaitForMetadata`, `bittorrent/torrent.go:1580`, `MagnetResolveTimeout`).
- File choice: `processMetadata` → `t.ChooseFile(btp, xbmcHost)` (`bittorrent/torrent.go:1910-2066`). Order: `OriginalIndex` (raw torrent file index) → `FileMatch` regex → if >1 candidate: episode auto-match `MatchEpisodeFilename` (+anime absolute number) → `FileIndex` (index into the candidate list) → `SkipFileDialog` ⇒ error → **Kodi `ListDialog`**. One candidate ⇒ auto; none ⇒ biggest file.
  **Movies with >1 candidate file always ask** (no auto-select). Candidates: `t.GetCandidateFiles(btp)` (`bittorrent/torrent.go:1704`), `CandidateFile{Index, Filename, DisplayName, Path, Size}` (`bittorrent/player.go:139`). RAR archives require a Kodi confirm and fail with nil host (`torrent.go:1754-1764`).
- Buffering progress: `t.BufferProgress` (0-100, `bittorrent/torrent.go:71`, updated `:294`), `t.IsBuffering`, `t.IsBufferingFinished`, `t.GetState()`, `t.GetStatus()` → `TorrentStatus{DownloadRate, NumSeeds, NumPeers, ...}` (`bittorrent/torrent_status.go:16-46`). Readiness is signalled via `btp.bufferEvents` from `updateBufferDialog` (`bittorrent/player.go:612-706`), which works without a Kodi dialog.
- Byte serving with Range: `/files/<EncodeFileURL(path)>` = `http.FileServer(bittorrent.NewTorrentFS(s, method))` (`main.go:281-285`, `bittorrent/torrentfs.go:60-103`). `Open` finds the file in any active torrent by path; `TorrentFSEntry` implements `Seek`/`Read` waiting for pieces (`torrentfs.go:190-330`), so `http.ServeContent` gives 206/Range. URL builder: `player.PlayURL()` (`bittorrent/player.go:234`).
- Kodi dependencies in the Player (all must be avoided/replaced for an API session):
  - `playerLoop` (`bittorrent/player.go:771-905`): waits for `isPlayingOwnFile()` (`PlayerIsPlaying`, `PlayerGetPlayingFile`), polls `GetWatchTimes` (`:734`), `InfoBooleans("Player.Paused",...)`, overlay, UpNext (`UpNextNotify`), next-file logic; `UpdateWatched` → `SetMovieProgress/Watched`, `Refresh` (`:927-985`).
    **With `xbmcHost == nil` it is unsafe**: the wait loop is skipped and `updateWatchTimes()` (`:836`) dereferences the nil host (`xbmc.XBMCHost.executeJSONRPCEx` has a value receiver, `xbmc/jsonrpc.go:241`) ⇒ panic in a goroutine ⇒ daemon crash. Even without the panic, the loop would exit at once and `Close()` would remove the torrent.
  - Dialogs: `NewDialogProgress` (`:285`), resume `DialogConfirmFocused` (`:375`; skipped when `xbmcHost == nil`), `ListDialog` for files, Kodi notifications on `/notification` (`Player.OnSeek/OnPause/OnPlay`, `api/maintenance.go:44-110`) routed to `s.GetActivePlayer()` (`bittorrent/service.go:1870`) — an API player that is "Playing" could receive Kodi's events.
  - `Close()` → `RemoveTorrent(xbmcHost, t, ...)` (`bittorrent/player.go:533-573`, `bittorrent/service.go:1036`) is nil-host safe; with no host, "ask" for keep-downloading resolves to keep (`service.go:1066`).
- Scrobbling: `btp.scrobbleTracker(action)` (`bittorrent/player.go:1672`) → `tracker.Scrobble(action, item, percent)` (`tracker/registry.go:120`), enabled when `config.Get().Scrobble && TMDBId>0 && tracker.Active()!=nil` (`:158`). Needs `p.WatchedTime`/`VideoDuration`.
- Resume: per-file "stored resume" in the cache DB, key `"stored.resume."+ResumeToken` where `ResumeToken = xxhash(infoHash+filePath)` (`bittorrent/player.go:343`, `FetchStoredResume`/`SaveStoredResume` `:1316-1343`); also Kodi library resume (`uid`) or tracker playback progress (`GetIdent`, `:1036-1082`). Watched state: `SetWatchedFile` + `tracker.SetWatched` (`:942-965`).

## 8. Existing JSON endpoints / `/api`

- No gin route uses `/api` (only occurrences of `"/api"` are outbound URLs: `tvdb/tvdb.go:20`, `scrob/scrob.go:47`). Package dir `api/` is unrelated to URL paths.
- JSON already served: every Kodi route returns `xbmc.View` JSON (`ctx.JSON(200, xbmc.NewView(...))`); explicit JSON: `/versions` (`api/torrents.go:738`, `{"version","user-agent"}` via `ident.GetVersion()` `util/ident/ident.go:20`), `/torrents/list` (Web UI, `api/torrents.go:347`), `/status` (text for Kodi), `/web/*` static Web UI if present.

## 9. Languages (.po)

- 22 languages in addon:`resources/language/` + `messages.pot`: `de_de el_gr en_gb es_ar es_es es_mx fi_fi fr_fr he_il hr_hr hu_hu it_it nl_nl pl_pl pt_br pt_pt ro_ro ru_ru sk_sk sl_si sv_se uk_ua` (dirs `resource.language.<ll_cc>/strings.po`).
- Format (Kodi gettext): header block, then per entry `msgctxt "#30254"` / `msgid "My Watchlist"` (English) / `msgstr "Merkliste"`; `en_gb` has empty `msgstr`. 682 entries per file, ids `#30000…`; every non-English file has all 682 `msgstr` filled.
  Only 8 continuation lines in en_gb (multi-line strings are rare); ~32 entries use `%s`/`%d`, ~39 use Kodi markup (`[B]`, `[COLOR]`, `[CR]`) — strip/skip these when pre-filling UI JSON.
- Kodi string ids appear in Go as `"LOCALIZE[30xxx]"`.

## 10. CI, tests, codegen

- CI: `.github/workflows/build.yml` — `lint` (gofmt check, setup-go from `go.mod`) → `test` (`make test`) → `build` matrix (15 platforms via Docker cross images).
- `make test` (`Makefile:284-285`) runs `go test -tags binary,go_json ./...` **inside Docker image `elementumorg/libtorrent-go:linux-x64`** (cgo + libtorrent). Locally `go.work` (untracked) points to `../libtorrent-go` (present).
- Tests: ~30 `_test.go` files, std `testing`, table tests, gin via `gin.CreateTestContext(httptest.NewRecorder())` (`api/search_test.go:25-35`). No `testdata/` fixture dirs yet; no network in tests.
- Codegen: only `msgp` (`//go:generate go tool msgp -o msgp.go -io=false -tests=false` in `tmdb/types.go:9`, `trakt/types.go:5`, `tracker/types.go:8`, `fanart/fanart.go:18`, `util/reqapi/request.go:23`); outputs are committed. No CI check for stale generated code.

## 11. Surprises affecting the plan

1. `/files/` (and `/debug/*`) is **already unauthenticated** and Range-capable; the HMAC link adds signing only for the new path. The `/api/v1/stream` handler can be a ~10-line wrapper that checks the HMAC, then sets `r.URL.Path = "/" + player.PlayURL()` and calls the same `http.FileServer(bittorrent.NewTorrentFS(s, r.Method))`.
2. Global `r.Use(Auth())` means a gin `/api/v1/stream` route **cannot skip Basic auth** and every `/api` 401 would be gin's empty body + `WWW-Authenticate` (may pop a native browser auth dialog). Need `Auth()` to skip the `/api/` prefix (API group does its own JSON 401 without `WWW-Authenticate`), or mount the API on the DefaultServeMux like `/files/`.
3. CORS already exists globally but lacks `DELETE` (needed for `DELETE /playback/{id}`).
4. The Player cannot run Kodi-less today (nil-host panic, §7). A5 needs a small "external player" mode in `bittorrent/player.go` (Kodi path unchanged).
5. `TorrentFile.Multi` ≠ multi-file. `multi_file` cannot be known at search time.
6. Trackers are generic (Trakt, Simkl, MDBList, scrob). Watchlist/collection/lists/progress work for whatever tracker is active; only the charts are Trakt-specific.
7. Lists already return full TMDB details per item (genres, runtime) — `MediaItem.genres` is free, but cold first page = `ResultsPerPage` detail requests.
8. Package name `api` is taken; oapi-codegen strict-server names from `operationId` (`SearchMovies`, `PopularMovies`...) would collide with existing `api` funcs if generated into it.
9. Stream search needs Kodi + Burst online (JSON-RPC to Kodi); Burst also shows its own Kodi dialog unless `Silent` is set.

## Reuse map

Handlers must call these; "as-is" = already returns data. Splits are pure extractions (same code moved into a func the Kodi handler then calls), so Kodi output does not change.

| Endpoint group | Call | Status |
|---|---|---|
| `GET /system/info` | `ident.GetVersion()` `util/ident/ident.go:20`; `config.Args.LocalLogin/LocalPassword` (auth_required) `config/config.go:353`; `tracker.Selected()`/`tracker.Active()` `tracker/registry.go:42,47`; `config.Get().Language` | as-is |
| movie lists | `tmdb.PopularMovies` `tmdb/movie.go:298` (popular, by_genre via `DiscoverFilters.Genre`), `tmdb.RecentMovies` `:333` (now_playing ≈ recent), `tmdb.TopRatedMovies` `:378`, `tmdb.DiscoverMovies` `:372` (year: `primary_release_year`) | as-is (returns `tmdb.Movies`, total results) |
| movie trending / upcoming | none; add `func TrendingMovies(lang, page) { return listMovies("trending/movie/week", napping.Params{"language": lang}, page) }` and same for `movie/upcoming` in `tmdb/movie.go` (shows: `listShows`) — or map `trending` to `trakt.TopMovies("trending")` | small addition (new funcs, nothing existing changes) |
| show lists | `tmdb.PopularShows` `tmdb/show.go:270`, `RecentShows` `:352`, `TopRatedShows` `:429`, `DiscoverShows` `:423` | as-is |
| genres | `tmdb.GetMovieGenres` `tmdb/movie.go:106`, `tmdb.GetTVGenres` `tmdb/show.go:444` | as-is (Kodi `MovieGenres` `api/movies.go:123` only wraps them) |
| movie details | `tmdb.GetMovie(id, lang)` `tmdb/movie.go:56`; images via `tmdb.ImageURL` `tmdb/tmdb.go:139` | as-is |
| show details / season | `tmdb.GetShow` `tmdb/show.go:124` (`.Seasons`), `tmdb.GetSeason(id, n, lang, len(show.Seasons), true)` `tmdb/season.go:27` | as-is |
| search | `tmdb.SearchMovies` `tmdb/movie.go:159`, `tmdb.SearchShows` `tmdb/show.go:175`; `multi` = call both | as-is |
| library | storm query + `tmdb.GetMovie` loop inside `MovieElementumLibrary` `api/movies.go:221-258` / `TVElementumLibrary` `api/shows.go:192-…` | **fused** — split: move the query+fetch body into `elementumLibraryMovies(lang string) tmdb.Movies` / `elementumLibraryShows(lang) tmdb.Shows` in the same file (passing `config.Get().Language` from the Kodi handler); handlers keep only `renderMovies(...)`/`renderShows(...)` |
| tracker watchlist / collection / custom list items | `tracker.Active()`, `tracker.GetActivities(p, key).Changed(bucket)` `tracker/state.go:32`, `p.Watchlist` / `Collector.Collection` / `ListReader.ListItems` (`trakt/provider.go:60,69,155`), then `tmdb.GetMovies/GetShows(ids, lang)` | **fused** in `trackerListView` `api/tracker.go:37-90` — split: extract lines 51-70 into `trackerItems(p tracker.Provider, kind tracker.ListKind, t tracker.MediaType, bucket tracker.Bucket, listID string) ([]*tracker.Item, error)` (no Notify inside); the view keeps the `Active()==nil` notify, `notifyTrackerError` and rendering |
| tracker lists (names) | `p.(tracker.ListReader).Lists()` `trakt/provider.go:143` → `[]*tracker.List{ID, Name, ItemCount}` | as-is |
| tracker progress / next up | `p.(tracker.ProgressReader).Progress(refresh)` `trakt/provider.go:166` (items with `Season`, `Episode`, `EpisodeTMDB`); refresh via `GetActivities(p,"view.progress").Changed(tracker.EpisodesWatched)` | as-is (the 3 lines in `trackerProgressView` `api/tracker.go:139-141` are trivial to repeat) |
| trakt charts | `trakt.TopMovies(category, page)` `trakt/movies.go:114`, `trakt.TopShows` `trakt/shows.go:261` → `.Movie.IDs.TMDB` → `tmdb.GetMovies` | as-is |
| movie streams | `tmdb.GetMovie`; `xbmc.GetXBMCHostWithContext(ctx)` `xbmc/jsonrpc.go:159`; `providers.GetMovieSearchers(xbmcHost, callbackHost(ctx, xbmcHost))` `providers/xbmc.go:85`, `api/search.go:171`; `providers.SearchMovieSilent(xbmcHost, searchers, movie, true)` `providers/search.go:98`; cache `GetCachedTorrents/SetCachedTorrents(strconv.Itoa(id))` `api/torrents.go:216,241` | as-is (if the API lives outside package `api`, export `callbackHost`, `GetCachedTorrents` is already exported) |
| episode streams | `tmdb.GetShow`, `tmdb.GetSeason(...).GetEpisode(e)`, `providers.GetEpisodeSearchers` `providers/xbmc.go:103`, `providers.SearchEpisode` `providers/search.go:140`, cache key `"<show>_<s>_<e>"` | **needs a silent variant**: add `SearchEpisodeSilent` (copy of `SearchEpisode` with `isSilent=true`, payload `Silent=true` like `GetMovieSearchSilentObject` `providers/xbmc.go:152`); `SearchEpisode` stays as is. Optional: `showEpisodeLinks` `api/shows.go:921` has the same resolve logic but calls `Notify` — don't reuse it |
| playback start | `bittorrent.NewPlayer(s, PlayerParams{URI, ContentType, TMDBId, ShowID, Season, Episode, OriginalIndex, SkipFileDialog: true, ResumePlayback: ResumeYes/No}, nil)` `bittorrent/player.go:150`; reuse running torrents like `api/play.go:118-139` (`s.GetTorrentByURI`); `player.Buffer()` `:247` in a goroutine | **needs small changes** in `bittorrent`: (a) external mode, see "progress" row; (b) `ChooseFile` `torrent.go:2003-2008`: when `SkipFileDialog` and choices>1, keep `choices` on the player (e.g. `btp.candidates`) and return a sentinel `ErrChooseFile`, so the session can report `choosing_file` with the list and re-buffer the same torrent with `OriginalIndex` (Kodi never sets `SkipFileDialog` from its own flow, so unchanged) |
| playback status | `t.BufferProgress`, `t.IsBufferingFinished`, `t.GetState()`, `t.GetStatus()` (`DownloadRate`, `NumSeeds`, `NumPeers`) | as-is |
| playback progress (keepalive, resume, scrobble) | `btp.p.WatchedTime/VideoDuration/WatchedProgress/Paused`, `scrobbleTracker` `player.go:1672`, `SaveStoredResume` `:1326`, `UpdateWatched` `:927` (nil-host safe) | **fused with Kodi polling in `playerLoop`** `player.go:771-905` — split: add `PlayerParams.External bool` + exported `UpdateExternal(pos, dur float64, paused bool)` and `Stop()`; in `playerLoop`, when `External`, replace the Kodi wait/poll (`isPlayingOwnFile`, `updateWatchTimes`, `InfoBooleans`, overlay, UpNext) with values from `UpdateExternal` and exit on `Stop()`/idle; keep the post-loop resume/watched/scrobble code shared. Kodi branch untouched. Also skip `External` players in `GetActivePlayer` `service.go:1870` so Kodi `/notification` events don't hit them |
| playback stop | `player.Close()` `player.go:533` → `RemoveTorrent(nil, …)` | as-is |
| stream bytes | `http.FileServer(bittorrent.NewTorrentFS(s, r.Method))` `main.go:283` / `torrentfs.go:60`, path `player.PlayURL()` `player.go:234` | as-is (wrapper that rewrites `r.URL.Path`); must be outside Basic auth (§11.2) |

## Impact on plan

1. §3 Spec / A1: put spec + generated code in a **new package/dir** (e.g. `apiv1/openapi.yaml`, `apiv1/gen.go`), not in `api/` (name collisions with existing handlers). Mount from `api.Routes` (`api/routes.go:77`). Install oapi-codegen as a `tool` in `go.mod` (`go tool oapi-codegen`, same as msgp); a gin request validator would need `github.com/oapi-codegen/gin-middleware` (extra dep to approve) — or skip validation middleware and rely on strict-server typing.
2. §3 Auth / A1: change global `Auth()` (`api/routes.go:65`) to skip paths under `/api/`; the API group gets its own Basic check with the same `config.Args.LocalLogin/LocalPassword` that returns the JSON error **without** `WWW-Authenticate`. Stream route then naturally skips Basic.
3. §3 CORS / A1: no new CORS middleware needed; add `DELETE` to the existing one (`api/routes.go:54`). (Or let the API group set its own and keep global unchanged.)
4. §3 Stream auth: note in §8/§9 that `/files/` is already open on the LAN, so HMAC protects only the new path. Keep HMAC (cheap) or decide to point `stream_url` at `/files/...` — user decision.
5. §4 Trakt endpoints: rename to tracker-agnostic `/tracker/{movies|shows}/watchlist|collection`, `/tracker/lists`, `/tracker/lists/{list_id}`, `/tracker/shows/progress` (409 `tracker_not_authorized`), keep `/trakt/{movies|shows}/lists/{list}` for charts (no auth needed). `/system/info`: `tracker: {id, name, authorized}` instead of `trakt_authorized`.
6. §4 lists: `trending`/`upcoming` need 2 tiny new TMDB wrappers (or use Trakt trending); `now_playing` = existing `RecentMovies`; `top_rated` ignores genre. `by_genre` = `popular` + `genre`; `year` via `DiscoverMovies`.
7. §4 `lang`: accept a TMDB code (`de` or `de-DE`); normalize once. Images keep config languages (acceptable) — document. A2 mapping must use raw `Title/Name/Overview` + translation fallback for the requested lang, not `GetTitle()`.
8. §4 `Stream.multi_file`: drop it (or rename to `multi_provider`); files are only known after metadata → `choosing_file` state.
9. §4 paging: lists page size = Elementum `ResultsPerPage`, search = 20; `total_pages` computed per kind.
10. A4: add `SearchEpisodeSilent`; use `SearchMovieSilent`; reuse `GetCachedTorrents` keys; 502 when `GetXBMCHostWithContext` fails or no searchers.
11. A5: budget the Player "external mode" + `ChooseFile` sentinel changes in `bittorrent/` (largest risk item); never call `NewPlayer(..., nil)` with the current `playerLoop`. Integration check must also confirm Kodi playback unchanged (`bittorrent/player_url_test.go`, existing tests).
12. A1 CI: add a "go generate + git diff --exit-code" step to the `lint` job (no cgo needed); tests stay in `make test` (Docker). A2/A3 mapping tests need a new `testdata/` dir; keep the mapping in a package that avoids importing `bittorrent` if you want them runnable without cgo.
13. B3 i18n: 22 languages as listed in §9; sync script should skip entries with `%s`/Kodi markup.
