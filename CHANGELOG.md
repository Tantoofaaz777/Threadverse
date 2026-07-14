# Changelog

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
