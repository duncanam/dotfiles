#!/usr/bin/env bash
# Install this repository's active configuration files into their home locations.
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: ./install_symlinks.sh [--dry-run] [--backup]

Install the tracked dotfiles as absolute symlinks rooted at this repository.

Options:
  --dry-run  Print the actions that would be taken without changing anything.
  --backup   Move a conflicting destination to <destination>.backup-<timestamp>
             before creating the link. Without this option, conflicts are left
             untouched and cause a non-zero exit status.
  -h, --help Show this help text.
EOF
}

DRY_RUN=false
BACKUP_CONFLICTS=false

while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --backup) BACKUP_CONFLICTS=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
HOME=${HOME:?HOME must be set}
ERRORS=0

run() {
  if "$DRY_RUN"; then
    printf 'DRY-RUN: '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

backup_destination() {
  local destination=$1 backup suffix=0
  backup="${destination}.backup-$(date +%Y%m%d%H%M%S)"
  while [[ -e "$backup" || -L "$backup" ]]; do
    suffix=$((suffix + 1))
    backup="${destination}.backup-$(date +%Y%m%d%H%M%S)-$suffix"
  done
  printf 'Backing up %s to %s\n' "$destination" "$backup"
  run mv "$destination" "$backup"
}

link() {
  local source=$1 destination=$2 parent

  if [[ ! -e "$source" ]]; then
    printf 'ERROR: source is missing: %s\n' "$source" >&2
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [[ -L "$destination" ]]; then
    if [[ "$destination" -ef "$source" ]]; then
      printf 'Already linked: %s\n' "$destination"
      return
    fi
  elif [[ ! -e "$destination" ]]; then
    parent=$(dirname "$destination")
    if [[ ! -d "$parent" ]]; then
      printf 'Creating directory: %s\n' "$parent"
      run mkdir -p "$parent"
    fi
    printf 'Linking %s -> %s\n' "$destination" "$source"
    run ln -s "$source" "$destination"
    return
  fi

  if "$BACKUP_CONFLICTS"; then
    backup_destination "$destination"
    printf 'Linking %s -> %s\n' "$destination" "$source"
    run ln -s "$source" "$destination"
  else
    printf 'CONFLICT: %s exists and does not resolve to %s (left unchanged; rerun with --backup to preserve it and replace it)\n' \
      "$destination" "$source" >&2
    ERRORS=$((ERRORS + 1))
  fi
}

# Shell and terminal configuration.
link "$ROOT/.bashrc" "$HOME/.bashrc"
link "$ROOT/.zshrc" "$HOME/.zshrc"
link "$ROOT/.p10k.zsh" "$HOME/.p10k.zsh"
link "$ROOT/.tmux.conf" "$HOME/.tmux.conf"
link "$ROOT/.wezterm.lua" "$HOME/.wezterm.lua"

# Application configuration.
link "$ROOT/.config/nvim" "$HOME/.config/nvim"

# Pi configuration is linked entry-by-entry so its generated credentials,
# model cache, session history, and work plans remain local machine state.
link "$ROOT/.pi/agent/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
link "$ROOT/.pi/agent/agent-manager.json" "$HOME/.pi/agent/agent-manager.json"
link "$ROOT/.pi/agent/extensions" "$HOME/.pi/agent/extensions"
link "$ROOT/.pi/agent/models.json" "$HOME/.pi/agent/models.json"
link "$ROOT/.pi/agent/settings.json" "$HOME/.pi/agent/settings.json"
link "$ROOT/.pi/agent/skills" "$HOME/.pi/agent/skills"

# Font directories can contain OS- and user-managed files, so link each
# bundled font rather than replacing the directory itself.
case "$(uname -s)" in
  Darwin) FONT_DIR="$HOME/Library/Fonts" ;;
  Linux) FONT_DIR="$HOME/.local/share/fonts" ;;
  *)
    printf 'WARNING: unsupported OS for font installation; skipping .fonts\n' >&2
    FONT_DIR=''
    ;;
esac
if [[ -n "$FONT_DIR" ]]; then
  for source in "$ROOT"/.fonts/*; do
    [[ -f "$source" ]] || continue
    link "$source" "$FONT_DIR/${source##*/}"
  done
fi

if ((ERRORS)); then
  printf '\nCompleted with %d conflict(s) or error(s).\n' "$ERRORS" >&2
  exit 1
fi

printf '\nSymlink installation completed successfully.\n'
