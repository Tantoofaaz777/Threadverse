# Threadverse

Threadverse is a Lumiverse Spindle extension for turning selected roleplay scenes into a fictional fandom discussion feed. Generated content lives in the extension UI and is never inserted into the roleplay chat.

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
- cancellable generation with atomic round persistence;
- tolerant validation of the model's JSON feed response;
- feed regeneration that replaces the existing result without duplicating its round;
- a temporary JSON feed preview ahead of the Reddit-inspired renderer;
- backend/frontend messaging;
- TypeScript type checking and Bun build scripts.

The final Reddit-inspired feed renderer is planned for stage 4B. The current Feed tab intentionally shows the validated JSON so the generation contract can be tested first.

## Development

```bash
bun install
bun run typecheck
bun run build
```

Lumiverse can also build `src/backend.ts` and `src/frontend.ts` automatically when installing the extension from source.

## Author

Created by [Tantoofaaz777](https://github.com/Tantoofaaz777).
