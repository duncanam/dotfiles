---
name: pi-self-docs
description: Self-reference index for the pi coding-agent harness. Load this whenever the user asks about pi itself, how pi works, or any of its subsystems — extensions, themes, skills, prompt templates, TUI components, keybindings, SDK integrations, custom providers, adding models, pi packages, compaction, sessions, settings, slash commands, or the agent loop. Provides a topic→file map and a portable recipe for locating pi's README, docs, and examples on disk so you can answer pi questions without grepping blindly.
---

# Pi self-documentation index

You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

## Resolving the pi install path

Pi is shipped as the npm package `@earendil-works/pi-coding-agent`. Do **not** hard-code user-specific paths. Resolve the package root at runtime with bash. The pi binary is itself `dist/cli.js` inside the package, so follow the symlink and walk up two directories:

```bash
PI_PKG="$(node -e 'const fs=require("fs"),p=require("path");console.log(p.dirname(p.dirname(fs.realpathSync(process.argv[1]))))' "$(command -v pi)")"
```

Simpler shell-only variant (requires GNU-style `readlink -f`, present on modern macOS and Linux):

```bash
PI_PKG="$(dirname "$(dirname "$(readlink -f "$(command -v pi)")")")"
```

Last-resort fallback if the package is locally installed and on Node's resolution path:

```bash
PI_PKG="$(node -e 'console.log(require.resolve("@earendil-works/pi-coding-agent/package.json"))' | xargs dirname)"
```

After resolving, the relevant files live at:
- `$PI_PKG/README.md` — main documentation
- `$PI_PKG/docs/` — full docs directory
- `$PI_PKG/examples/` — extensions, custom tools, SDK examples

## Where this user's own skills and extensions live

Distinct from `$PI_PKG` (the pi package itself). Pi loads *this user's* skills and
extensions from:
- Skills: `~/.pi/agent/skills/<name>/SKILL.md`
- Extensions: `~/.pi/agent/extensions/*.ts` or `~/.pi/agent/extensions/<name>/index.ts`

Just read/edit them at those `~/.pi/agent/...` paths. If an entry is a symlink (e.g.
into a dotfiles repo) the read/edit resolves through it to the real file
transparently — no need to locate or hard-code the target. Loaded skills also show
their full path in context as `location=…`. See `docs/skills.md` / `docs/extensions.md`
for project-level and other load locations.

## Topic → file map

When the user asks about a pi subsystem, read the corresponding file under `$PI_PKG/docs/`:

| Topic | File |
| --- | --- |
| Extensions | `docs/extensions.md`, `examples/extensions/` |
| Themes | `docs/themes.md` |
| Skills | `docs/skills.md` |
| Prompt templates | `docs/prompt-templates.md` |
| TUI components | `docs/tui.md` |
| Keybindings | `docs/keybindings.md` |
| SDK integrations | `docs/sdk.md`, `examples/sdk/` |
| Custom providers | `docs/custom-provider.md` |
| Adding models | `docs/models.md` |
| Pi packages | `docs/packages.md` |
| Compaction | `docs/compaction.md` |
| Sessions | `docs/sessions.md`, `docs/session-format.md` |
| Settings | `docs/settings.md` |
| Providers | `docs/providers.md` |
| Quickstart | `docs/quickstart.md` |
| RPC | `docs/rpc.md` |
| JSON mode | `docs/json.md` |
| Shell aliases | `docs/shell-aliases.md` |
| Terminal setup | `docs/terminal-setup.md` |
| Termux | `docs/termux.md` |
| tmux | `docs/tmux.md` |
| Usage | `docs/usage.md` |
| Windows | `docs/windows.md` |
| Developing pi itself | `docs/development.md` |
| Docs index | `docs/index.md` |

## Reading pi source code

The npm package ships only compiled `dist/`, docs, and examples — there is no top-level `src/` directory. **However**, every `.js` file in `dist/` has an adjacent `.js.map` source map with `sourcesContent` inlined, so the original TypeScript source is fully recoverable from the npm install.

Mapping: `src/<relpath>.ts` ↔ `$PI_PKG/dist/<relpath>.js.map`. For example:
- `src/core/skills.ts` → `$PI_PKG/dist/core/skills.js.map`
- `src/core/tools/edit.ts` → `$PI_PKG/dist/core/tools/edit.js.map`
- `src/cli.ts` → `$PI_PKG/dist/cli.js.map`

Extract a source file with:

```bash
pi_src() {
  local rel="${1#src/}"
  local map="$PI_PKG/dist/${rel%.ts}.js.map"
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((m.sourcesContent&&m.sourcesContent[0])||"");' "$map"
}
# usage: pi_src src/core/skills.ts | less
```

Or search across all inlined sources without extracting:

```bash
grep -l "<pattern>" $PI_PKG/dist/**/*.js.map   # bash globstar / zsh
# then pi_src on the matching .ts logical path
```

Relevant source areas (logical paths under `src/`):
- `src/core/` — session, system prompt, skills, extensions, slash commands, model resolver, prompt templates, settings manager, etc.
- `src/core/tools/` — built-in tools
- `src/modes/` — interactive (TUI), JSON, headless modes
- `src/cli.ts`, `src/main.ts` — entry points

If the user has the pi monorepo checked out locally, the canonical sources live at `packages/coding-agent/src/...` and additional packages exist alongside it (`packages/agent/`, `packages/ai/`, `packages/tui/`, `packages/web-ui/`). Top-level `AGENTS.md` and `CONTRIBUTING.md` cover repo conventions. Ask before assuming a local checkout exists.

## How to answer pi questions

1. Resolve `$PI_PKG` first (see recipe above).
2. Read the relevant `.md` file(s) under `$PI_PKG/docs/` **completely** — partial reads miss cross-references.
3. Follow any links to related docs before answering.
4. When implementing, cross-check against `$PI_PKG/examples/` for the canonical shape.
5. If the docs don't answer the question, fall back to reading source via the `pi_src` recipe above (sources are inlined in `dist/**/*.js.map`).
6. For TUI work, `docs/tui.md` is the API reference. The TUI component source lives in the separate `packages/tui/` package and is **not** shipped in the npm install — only reachable if the user has the pi monorepo checked out locally.
