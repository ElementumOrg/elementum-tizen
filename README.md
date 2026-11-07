# elementum-tizen

Samsung Tizen TV app (Tizen 4.0+, 2018+ TVs) that is a remote-controlled front-end for an
[Elementum](https://github.com/elgatito/elementum) instance on your LAN: browse movies and shows,
search, pick a torrent stream and play it on the TV.

Installation on a TV is covered in INSTALL.md.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci              # install pinned dependencies
npm run dev         # dev server; open the printed URL in Chrome (layout is fixed at 1920x1080)
npm run build       # production build into dist/ (index.html, config.xml, icon.png, assets/)
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run api:sync    # copy apiv1/openapi.yaml from Elementum and regenerate src/api/schema.d.ts
```

`api:sync` reads the spec with `git show $ELEMENTUM_REF:apiv1/openapi.yaml` from the repo at
`$ELEMENTUM_REPO` (defaults: `../elementum`, ref `api`).
