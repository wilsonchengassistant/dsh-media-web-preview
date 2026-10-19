# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
