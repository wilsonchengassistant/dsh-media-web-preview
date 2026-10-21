# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased — 1.0.1

_Not yet published. `npm view dsh-media-web-preview version` still reports
`1.0.0`._

### Added

- `docs/preview-video.png` and `docs/preview-audio.png` — the video and audio
  preview panes in the right Sidebar.
- `screenshots.json` listing the two images, for the app storefronts that read
  it. The registry probe accepts a plain path array, so the file is one.

### Changed

- The README embeds both screenshots. The public plugin page renders the
  README's images, not `screenshots.json` — a plugin with a perfect
  `screenshots.json` and no embedded image still shows none — so the embed is
  what puts a picture on the page.

The published `1.0.0` tarball carries neither the images nor the `README.md`
that embeds them, so a fresh `npm install` today gets the plugin without any
screenshot until `1.0.1` is published.

## 1.0.0 — 2026-10-19

First public release.

- Browser-native `<video>` / `<audio>` previews in the DSH right Sidebar for
  mp4, m4v, webm, ogv, mov, mkv, avi, mpg/mpeg, 3gp, 3g2, ts, m2ts, mp3, m4a,
  m4b, aac, wav, flac, ogg, oga, opus, weba, aiff, aif, wma, mid and midi.
- Authenticated `GET/HEAD /api/media?path=…` route with `Range`, `206`,
  `Content-Range`, `416`, chunked reads, and `download=1`.
- Document-relative media URLs, so the player works under a loopback URL, a LAN
  address, a Tailscale MagicDNS name, or a reverse proxy without configuration.
- Download and "open in new tab" actions in the preview footer.
- English and Simplified Chinese dictionaries.
- Zero runtime dependencies; one Host module and one browser bundle.
