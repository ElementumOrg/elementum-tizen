# Apps2Samsung: installing our `.wgt` (research for B2)

Researched 2026-11-07 against Apps2Samsung `beta` at
[`b779dd3`](https://github.com/Apps2Samsung/Apps2Samsung/tree/b779dd38c92671b7605c92fef09e01400fe8241b)
(latest stable release [v3.1.0](https://github.com/Apps2Samsung/Apps2Samsung/releases/tag/v3.1.0)) and
[tizen-community-packages](https://github.com/Apps2Samsung/tizen-community-packages/tree/ad5d6309dad34c8402bb8e46b244f6a6ce0c38cf)
`main` at `ad5d630`. `A2S` below = `https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b`.

Nothing here has been tried on a TV yet. "Verified" means read in the source or docs.

## Verified (source code and docs)

1. **What it is.** A desktop (Windows, Linux, macOS), Android, iPhone and CLI (`apps2samsung-cli`) side-loader for
   Tizen TVs. It finds the TV, creates the signing certificate and installs a catalog app or "your own `.wgt` or
   `.tpk`" ([README](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/README.md)).
2. **It re-signs every package before installing.** The install pipeline is: read the TV's capabilities →
   Tizen version gate → push the device profile on TVs ≤ 4.0 → patchers → certificate validity check →
   **re-sign** (`ResignAsync` with the user's author + distributor certificate) → install over sdb
   ([PackageInstaller.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Install/PackageInstaller.cs),
   lines 99–195). The re-sign replaces the package's signatures in place
   ([InProcessSdbEngine.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Sdb/InProcessSdbEngine.cs),
   `TizenWgtSigner.ReSignWgtWithCertsInPlace`). So **our CI signature only has to produce a valid `.wgt`**; the TV
   only ever sees the user's certificate.
3. **Certificates.** One Samsung account sign-in creates a certificate that is reused for that TV. Public or Partner
   level is picked per app; Public "covers virtually every app"
   ([CertificatePrivilegeLevel.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Certificate/CertificatePrivilegeLevel.cs)).
   Our privileges (`internet`, `tv.inputdevice`) are public ones. A Samsung account is needed on Tizen 7+; older
   TVs can use a Tizen certificate without one
   ([FAQ](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ)). The TV checks the certificate online during the
   install, so it needs internet access then, and a correct clock (error texts in PackageInstaller.cs).
4. **What it reads from `config.xml`:** `<tizen:application id="Pkg.App" package="Pkg" required_version="X.Y">`
   ([WgtManifest.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Packaging/WgtManifest.cs)).
   It refuses up front when `required_version` is newer than the TV, uses the package id to detect and remove an
   older copy, and launches the app id afterwards. If the TV blocks a package id (`[118, -22]`) it can rename the
   package to a random id per TV
   ([PackageIdPolicy.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Install/PackageIdPolicy.cs)).
   Our `config.xml` (`ElmntmTV01.Elementum`, package `ElmntmTV01`, `required_version="4.0"`) fits; no other
   requirements were found.
5. **File name:** any name ending in `.wgt` or `.tpk`
   ([PackageSigner.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Install/PackageSigner.cs) `IsPackage`).
6. **Supported TVs:** Tizen TVs, projectors and monitors; Orsay-based TVs (before 2015) are not supported (README).
   TVs on Tizen ≤ 4.0 get the device profile pushed first (PackageInstaller.cs), so our 4.0 baseline is covered.
7. **"Your own sources", no catalog needed.** A user can add a GitHub repository (`owner/repo`) as a source; the
   app lists the newest release that has `.wgt`/`.tpk` assets and refreshes it on every catalog load
   ([UserSources.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Catalog/UserSources.cs),
   [AddLatestRelease.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/b779dd38c92671b7605c92fef09e01400fe8241b/Apps2Samsung.Core/Catalog/AddLatestRelease.cs)).
   It also shows the installed vs. newest version and updates in one click (README).
8. **Mixing install paths:** an app installed with a different certificate (for example via the Tizen CLI) has to
   be removed on the TV before Apps2Samsung can install over it (FAQ; `[118]` recovery in PackageInstaller.cs).

## Catalog listing

Possible, by a pull request to
[tizen-community-packages](https://github.com/Apps2Samsung/tizen-community-packages): add one file
`packages/ElementumOrg__elementum-tizen.json`, validated by a bot against `packages.schema.json`
([packages/README.md](https://github.com/Apps2Samsung/tizen-community-packages/blob/ad5d6309dad34c8402bb8e46b244f6a6ce0c38cf/packages/README.md)).
For prebuilt `.wgt` files the type is `source: "release"`, with an asset `match` (exact name or regex) against the
GitHub release assets:

```json
{
  "name": "Elementum",
  "description": "Remote-controlled front-end for an Elementum server on your network.",
  "category": "streaming",
  "repo": "ElementumOrg/elementum-tizen",
  "source": "release",
  "branch": "main",
  "assets": [{ "match": "Elementum-.*[.]wgt$", "output_name": "Elementum.wgt" }]
}
```

What that needs from us: versioned GitHub releases (we have `v*` tags), a stable asset name (`Elementum-<version>.wgt`,
now produced by CI), an open-source license (MIT), and testing on at least one TV or emulator. The catalog reads
`version`, `app_id`, `package_id` and `required_version` from our `config.xml`.

Risk: the rules never accept "apps that ship with unlicensed content sources by default: ... torrent indexers";
"a player that only plays sources *the user adds* is fine". The TV app ships no sources (it talks to the user's own
Elementum, and similar torrent front-ends such as TorrStream and SeanimeTV are listed), but acceptance is the
maintainers' call. Until then, users can add `ElementumOrg/elementum-tizen` as their own source (item 7), which
needs nothing from the catalog.

## Assumptions (to be checked on a TV)

- Re-signing works on a `.wgt` signed with our throwaway Tizen author certificate (it replaces signatures; the
  `TizenSdb` signer itself is a NuGet dependency and was not read).
- The user-source path picks up `Elementum-<version>.wgt` from our latest release without further setup.
- Signed certificates expire (validity is checked before each install); when that happens the user creates a new
  one in Apps2Samsung and reinstalls. Exact lifetimes were not checked.
