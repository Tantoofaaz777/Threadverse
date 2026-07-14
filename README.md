# Threadverse

Threadverse is a Lumiverse Spindle extension for turning selected roleplay scenes into a fictional fandom discussion feed. Generated content lives in the extension UI and is never inserted into the roleplay chat.

Threadverse 1.0 is stable for personal use, with mobile-first navigation, defensive persistence, and background generation that never interrupts the active roleplay view.

## Current state

The extension currently includes:

- a Lumiverse drawer tab;
- the `Feed`, `Make`, and `Settings` navigation shell;
- active-chat message loading and success-themed range selection;
- per-user, per-chat chronological round persistence;
- previous/recent context display and continuity reset controls;
- existing Lumiverse connection selection, using the model configured on that connection;
- optional Max output tokens, Temperature, and Top P sampler overrides with visible defaults;
- persisted continuity limits and editable permanent instructions;
- named instruction presets with the native expanded Lumiverse text editor;
- automatic persistence for connection, samplers, and continuity while prompt edits remain explicit;
- a prompt builder for chronological story and fandom continuity;
- generation through the selected Lumiverse connection;
- isolated overrides for Max output tokens, Temperature, and Top P while all other connection settings remain inherited;
- cancellable streamed generation with live estimated output-token progress and atomic round persistence;
- tolerant validation of a compact JSON feed response, including legacy feed compatibility;
- feed regeneration that replaces the existing result without duplicating its round;
- a mobile-first Reddit-inspired feed renderer with one round mounted at a time;
- one-tap clean-text copying of the selected thread for TTS and other apps;
- a mobile-safe Feed text-size slider with automatic persistence;
- background completion toasts without automatic tab or drawer navigation;
- a newest-first native round selector, lightweight CSS avatars, and nested replies;
- per-round regeneration and deletion with native confirmation;
- backend/frontend messaging;
- TypeScript type checking and Bun build scripts.

The Feed tab renders the newest round by default and keeps older rounds available through a compact selector.

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

Lumiverse can also build `src/backend.ts` and `src/frontend.ts` automatically when installing the extension from source.

## Author

Created by [Tantoofaaz777](https://github.com/Tantoofaaz777).
