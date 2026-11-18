# Changelog

## Unreleased

- LG webOS support (experimental, untested on hardware; the maintainers have no LG TV, so reports are welcome):
  - `Elementum-<version>.ipk` is attached to GitHub Releases next to the `.wgt`; install notes in INSTALL.md.
  - The player uses the TV's HTML5 player; audio and subtitle switching depends on the TV and is unverified.
  - Magic Remote pointer: click presses, hover focuses buttons, the sidebar and fields.
  - The app is built for Chromium 53 (webOS 4.x); the same build is used for the Samsung `.wgt`.
- Settings → Built-in search settings: Elementum's own torrent search, set up from the TV. Switch public and
  private providers on and off, enter the logins of private trackers, change filters, sizes and the other search
  options, and connect the cookie sync to GitHub with a code, then choose its Gist.
- Without Kodi, stream search now works through Elementum's built-in search; the message shown when no search is
  available says what to change.
- Needs Elementum 0.1.120 or newer (until then, built from its `master` branch).

## 0.2.2 - 2026-11-09

First public release candidate.

- Browse movies and shows, search, details, seasons and episodes.
- Library, collection, watchlist and watched badges, progress bars, a long-press context menu for library and
  watched actions.
- Trakt and tracker lists, Torrents screen, actor pages.
- Stream list with quality badges; buffering dialog on a rotating backdrop.
- AVPlay player with item info, seek, resume, and audio and subtitle switching without pausing.
- Elementum notifications, progress, questions and input prompts shown on the TV.
- 22 languages (machine-drafted, review wanted).
- App icon fixes (RGBA icon, `base_screen_resolution`); after upgrading from an older install, uninstall and
  reinstall to refresh the launcher tile (see INSTALL.md).
