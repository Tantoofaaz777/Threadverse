# Changelog

## 1.1.1

- Fix regeneration getting stuck before the backend reported that it had started.
- Make cancellation available immediately, including during storage and connection preparation.
- Recover the interface if the backend does not acknowledge a generation request within 15 seconds.

## 1.1.0

- Preserve regenerations as navigable versions inside the same continuity round.
- Use the active version for Feed rendering, copying, and future fandom continuity.
- Offer Cancel, Version, and Round choices when deleting a round with multiple versions.
- Silently discard inactive versions after a successful new round moves outside the configured fandom continuity window.
- Migrate existing single-feed rounds into version history without data loss.

## 1.0.6

- Add a compact SVG button that copies the selected thread as clean text for TTS and other apps.
- Preserve the thread title, authors, bodies, line breaks, and reply reading order without visual metadata.
- Fall back to legacy clipboard copying when a mobile WebView rejects the modern Clipboard API.

## 1.0.5

- Simplify generated feed JSON to title, username, body, score, and non-empty replies.
- Remove the redundant subreddit/round header and legacy flair/timestamp rendering.
- Minify fandom continuity while continuing to accept legacy feed fields.

## 1.0.4

- Replace the Generating and Regenerating pulse with a three-dot wave animation.
- Show the same animated wave beside the live output-token count.

## 1.0.3

- Make the Generating and Regenerating ellipsis visibly cycle from one to three dots on mobile.
- Keep the small non-spatial status animation available when a WebView reports reduced motion.

## 1.0.2

- Add a persisted 100%-160% Feed text-size slider in Settings.
- Use Lumiverse's native direction-aware slider so vertical mobile scrolling does not change the value.

## 1.0.1

- Stream generation output so Threadverse can show estimated live output-token progress.
- Animate the Generate and Regenerate labels with a subtle theme-aware pulse.
- Keep partial streamed JSON transient and validate only the final response.

## 1.0.0

- Select roleplay message ranges and generate fictional Reddit-style discussions.
- Preserve chronological story context and optional fandom continuity across rounds.
- Use existing Lumiverse connections while overriding only Max output tokens, Temperature, and Top P.
- Save named instruction presets with the native expanded editor.
- Render a mobile-first feed with nested replies and lightweight themed visuals.
- Support cancellation, regeneration, individual round deletion, and continuity reset.
- Keep background generations associated with their origin chat without automatic navigation.
- Validate generated JSON and discard invalid responses without consuming the selected range.
- Recover valid settings, chats, rounds, messages, and feeds from partially corrupted storage.
