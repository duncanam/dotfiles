# Duncan McGough's Dotfiles

## Install

Run the installer from this repository:

```bash
./install_symlinks.sh
```

Preview its changes first with `./install_symlinks.sh --dry-run`. Existing files,
directories, and incorrect symlinks are never overwritten by default; resolve them
manually or run `./install_symlinks.sh --backup` to rename each conflict to a
timestamped backup before creating the repository link.

The installer manages:

- `~/.bashrc`, `~/.zshrc`, `~/.p10k.zsh`, `~/.tmux.conf`, and `~/.wezterm.lua`
- `~/.config/nvim`
- the tracked Pi agent entries under `~/.pi/agent`: `AGENTS.md`,
  `agent-manager.json`, `extensions`, `models.json`, `settings.json`, and `skills`
- fonts from `.fonts/`, linked individually into `~/.local/share/fonts` on Linux
  or `~/Library/Fonts` on macOS

Repository assets such as `images/`, `pacman/`, and `ddg` are reference material,
not installed configuration. Pi runtime state—including `auth.json`,
`models-store.json`, sessions, and work plans—remains local and is not linked.
