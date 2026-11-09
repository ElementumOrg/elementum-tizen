# Installing Elementum on a Samsung TV

> **Pending verification on a real TV.** These steps come from the Apps2Samsung and Samsung documentation and
> from CI runs, but nobody has followed them on a TV yet. Report anything that differs and it will be fixed
> here.

Requirements: a Samsung TV with Tizen 4.0 or newer (2018+ models), and Elementum running on a machine in
the same network (default port 65220). If Elementum has a login (`local_login`/`local_password`), the app
asks for it. The app stores that password in plain text on the TV.

There are two ways to install:

- **Option A, Apps2Samsung (recommended):** a desktop/phone app that signs and installs the `.wgt` for you.
- **Option B, Tizen CLI:** Samsung's own command-line tools; more steps, nothing third-party.

Both install the same `Elementum-<version>.wgt` from
[GitHub Releases](https://github.com/ElementumOrg/elementum-tizen/releases/latest). The TV only accepts it
after it is signed with a certificate made for that TV, which both options do. An app installed one way must
be deleted on the TV before installing it the other way (the certificates differ).

## Option A: Apps2Samsung (recommended)

1. **Developer Mode on the TV:** open **Apps**, type `12345` on the remote (no number keys: press **123** and
   type it on screen) → switch **Developer mode** to **On** → **Host PC IP** = the IP of the computer that will
   run Apps2Samsung → OK → restart the TV. If it doesn't connect later, unplug the TV for 15 seconds.
   ([Apps2Samsung FAQ](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv))
2. **Install Apps2Samsung** on that computer from its
   [latest release](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest) (Windows: also
   `winget install Apps2Samsung.Apps2Samsung`).
3. **Get Elementum**, either way:
   - download `Elementum-<version>.wgt` from our
     [latest release](https://github.com/ElementumOrg/elementum-tizen/releases/latest), or
   - in Apps2Samsung, add `ElementumOrg/elementum-tizen` as **your own source** (the catalog's **⋯** →
     **Add a source**, or Settings → Installing → Your sources). Elementum then shows up in the catalog and
     Apps2Samsung offers updates when we publish a release.
4. **Install:** open Apps2Samsung, pick the TV, then pick Elementum from the catalog (or your downloaded
   `.wgt` file) and press **Install**. The first time, it asks you to sign in to your Samsung account to create
   the signing certificate (needed on Tizen 7+); it reuses it afterwards. Keep the TV connected to the internet
   during the install.
5. Start **Elementum** from the TV's app list, enter your Elementum IP address (for example `192.168.1.10`)
   and port (default `65220`) and, if set, the login.

To update, install the newer release the same way. To uninstall, use Apps2Samsung's installed-apps list, or on
the TV: Apps → Elementum → hold Enter → Delete.

## Option B: Tizen CLI

1. **Developer Mode on the TV:** as in Option A step 1, with **Host PC IP** = your PC's IP.
   [Samsung guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html#Connecting-the-TV-and-SDK)
2. **Install Tizen Studio.** The CLI-only installer is enough, from
   [developer.samsung.com](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).
   It does **not** include the Certificate Manager, so add it and the Samsung Certificate Extension:
   ```sh
   ~/tizen-studio/package-manager/package-manager-cli.bin install --accept-license Certificate-Manager,cert-add-on
   ```
   (on Windows, `C:\tizen-studio\package-manager\package-manager-cli.exe`, unverified). Add `~/tizen-studio/tools`
   and `~/tizen-studio/tools/ide/bin` to your `PATH` (on Windows, `C:\tizen-studio\tools` and
   `C:\tizen-studio\tools\ide\bin`).
3. **Connect:** find the TV's IP (Settings → General → Network → Network Status → IP Settings), then
   ```sh
   sdb connect <TV_IP>
   sdb devices            # shows the device name, e.g. UE55NU7400 or <TV_IP>:26101
   ```
4. **Create a Samsung certificate:** open Certificate Manager (`~/tizen-studio/tools/certificate-manager/`,
   unverified path) → **+** → **Samsung** → **TV** → create a profile (any name, e.g. `MyTV`) → create an
   author certificate → sign in with your Samsung account → for the distributor certificate keep **Public**
   privilege and make sure the connected TV's **DUID** is in the list (it is filled in automatically while `sdb`
   is connected) → finish.
   [Samsung guide](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
5. **Download** `Elementum-<version>.wgt` from the
   [latest release](https://github.com/ElementumOrg/elementum-tizen/releases/latest) into the current folder.
6. **Re-sign it** with your profile. Use absolute paths: the `tizen` launcher changes directory.
   ```sh
   tizen package -t wgt -s MyTV -o "$PWD/resigned" -- "$PWD/Elementum-<version>.wgt"
   ```
7. **Install:**
   ```sh
   tizen install -n "$PWD/resigned/Elementum-<version>.wgt" -t <device>
   ```
   **Elementum** now appears in the TV's app list.

To update, repeat steps 5–7. To uninstall, delete it from the TV's app list, or run
`tizen uninstall -p ElmntmTV01 -t <device>` (unverified: if that fails, try the app id `ElmntmTV01.Elementum`).

**Emulator:** install the TV extension and emulator (`package-manager-cli.bin install --accept-license
TV-SAMSUNG-Public,TV-SAMSUNG-Public-Emulator`), then start a TV emulator from Emulator Manager. It appears in
`sdb devices` and you can `tizen install` to it the same way. The emulator should accept the default Tizen
certificate, so the downloaded `.wgt` may install without step 6 (unverified).

## Troubleshooting (pending verification on a real TV)

**Apps2Samsung**

- *The app tile shows a plain letter ("E") instead of the Elementum icon:* the TV keeps the tile it created at the
  first install when you install a new version over an existing one. Uninstall Elementum on the TV (Apps →
  Elementum → Delete), restart the TV, then install again. Verified on a real TV; your server settings need to be
  entered again afterwards.
- *The TV is not found or "not ready":* Apps2Samsung says what is missing (Developer Mode off, Host PC IP pointing
  at another computer, restart needed). Fix that on the TV and restart it; unplugging it for 15 seconds helps when
  a normal restart doesn't.
- *Certificate rejected (`[118, -12]`):* the TV needs internet access during the install and a correct date and
  time (Settings → General → System Manager → Time). If both are fine, create a new certificate in Apps2Samsung.
- *"Signed with a different certificate":* an Elementum installed another way (Option B) is still on the TV.
  Delete it on the TV, then install again.
- *"Needs a newer Tizen":* the TV is older than Tizen 4.0, which Elementum does not support.

**Tizen CLI**

- *`sdb connect` fails or the device is "offline":* PC and TV must be in the same subnet; Host PC IP on the
  TV must be your PC's current IP; restart the TV after changing it; try `sdb kill-server` and connect
  again. Firewalls must allow TCP 26101.
- *Install fails with a certificate / signature error:* the `.wgt` was not re-signed, or the profile's
  distributor certificate does not include this TV's DUID. Recreate the certificate while the TV is
  connected (step 4) and re-sign. If Elementum signed with a different certificate is installed, delete it first.
- *`tizen` not found:* the `tools/ide/bin` folder is not on your `PATH`.

**Both**

- *"Waiting for Elementum at IP:port…" does not go away:* check that Elementum is running, that the address
  is the machine's LAN IP (not `127.0.0.1`), that port 65220 is open in its firewall, and that
  `http://<IP>:65220/api/v1/system/info` opens in a browser on another device.
- *The app asks for a login again:* the user name or password does not match Elementum's settings.
