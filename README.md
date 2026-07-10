# Threadverse

Threadverse is a Lumiverse Spindle extension for turning selected roleplay scenes into a fictional fandom discussion feed. Generated content lives in the extension UI and is never inserted into the roleplay chat.

## Current state

This is the initial scaffold. It includes:

- a Lumiverse drawer tab;
- the `Feed`, `Make`, and `Settings` navigation shell;
- active-chat message loading and success-themed range selection;
- per-user, per-chat chronological round persistence;
- previous/recent context display and continuity reset controls;
- existing Lumiverse connection selection, using the model configured on that connection;
- optional Max output tokens, Temperature, and Top P sampler overrides with visible defaults;
- persisted continuity limits and editable permanent instructions;
- a prompt builder for chronological story and fandom continuity;
- backend/frontend messaging;
- TypeScript type checking and Bun build scripts.

LLM generation, fandom-thread persistence, and the final Reddit-inspired feed renderer are intentionally not implemented yet. Until generation is connected, **Save Range** advances story continuity for testing.

## Development

```bash
bun install
bun run typecheck
bun run build
```

Lumiverse can also build `src/backend.ts` and `src/frontend.ts` automatically when installing the extension from source.

## Author

Created by [Tantoofaaz777](https://github.com/Tantoofaaz777).
