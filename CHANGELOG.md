# Changelog

## 1.3.1

- Remove redundant `FANDOM THREAD N` prefixes from Fandom Continuity headings.
- Use the literal title / episode / chapter label there, with `ROUND N` only as a fallback for unlabeled legacy rounds.

## 1.3.0

- Add an optional Title / episode / chapter field that appears after a complete Make range is selected.
- Persist the free-form label with its round, reuse it for regeneration, and show it in Make continuity and the Feed round selector.
- Use labels literally as Recent Context separators and group consecutive labeled ranges under one chronological Previous Context heading.
- Add installment metadata to corresponding Fandom Continuity thread headings while preserving `ROUND N` fallbacks for existing unlabeled history.

## 1.2.3

- Add a Rename button beside the instruction preset selector.
- Use Lumiverse's native pre-filled input modal and reject names already used by another preset.
- Keep renamed presets as prompt drafts until Save Prompt is pressed.

## 1.2.2

- Add the native inline expand control to the Fandom Notes textarea, matching Instructions.
- Save expanded-editor changes immediately to the correct chat through the existing notes autosave flow.

## 1.2.1

- Preserve Fandom Notes when resetting a chat's continuity, including the newest editor value still awaiting autosave.
- Clarify in the native reset confirmation that only rounds and generated versions are deleted.

## 1.2.0

- Add per-chat Fandom Notes in their own Settings card after Instructions.
- Save notes automatically while preserving pending edits across chat switches and immediate generations.
- Insert non-empty notes verbatim between Fandom Continuity and Instructions, with no fixed description; omit the entire block when empty.
- Preserve notes when individual rounds are deleted.

## 1.1.7

- Require a native danger confirmation before resetting a chat's complete Threadverse continuity.
- Block duplicate actions while the confirmation is open and leave all data untouched when cancelled.

## 1.1.6

- Animate each generation-status word as its own wave step before continuing through the three dots.
- Keep the wave phase stable while the live token number and singular/plural label update.

## 1.1.5

- Restore the full-width mobile round selector while centering Copy and Delete below it with icons and labels.
- Increase and center the Feed generation status text.
- Run the status text and dots through the same staggered wave animation.

## 1.1.4

- Open Feed immediately when generating a new round and show all live token progress there.
- Remove generation progress from Make while keeping cancellation available in Feed.
- Animate the complete generation status with a gentle wave and color pulse alongside the three moving dots.

## 1.1.3

- Replace the oversized Feed delete button with Lumiverse's native-style Trash2 icon.
- Center the compact Copy and Delete actions together on mobile.

## 1.1.2

- Keep feed swipe controls visible for single-version rounds and generate a new version from the trailing right arrow.
- Remove the separate Regenerate button while preserving navigation through existing versions during generation.
- Show live output-token progress only in Make for new rounds and only in Feed for regenerated swipes.

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
