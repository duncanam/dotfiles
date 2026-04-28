/**
 * Helpers for talking back to the parent Neovim instance.
 *
 * When pi is launched from inside `:terminal` (which is how the user's
 * `<C-,>` toggle works in `~/.config/nvim/lua/configs/pi.lua`), Neovim
 * sets `$NVIM` to the path of its msgpack-rpc socket. We can use that
 * socket with `nvim --server <addr> --remote ...` to drive the parent.
 *
 * If `$NVIM` isn't set we fail soft — the extension still works, the
 * file just won't auto-open.
 */

import { spawn } from "node:child_process";

function getNvimSocket(): string | undefined {
	const sock = process.env.NVIM;
	return sock && sock.trim() !== "" ? sock : undefined;
}

export function isInsideNvim(): boolean {
	return getNvimSocket() !== undefined;
}

/**
 * Open `path` as a buffer in the parent Neovim, choosing a *non-floating,
 * non-terminal* window so we don't clobber the floating `:terminal` that pi
 * is running inside (which is what `<C-,>` opens — see
 * `~/.config/nvim/lua/configs/pi.lua`). If no such window exists we fall
 * back to a horizontal split.
 *
 * Implementation note: we use `--remote-expr` + `luaeval` rather than
 * `--remote-send` because we need to inspect window configs, and because
 * `--remote-send` would otherwise fire the `:edit` against whatever window
 * happens to be current — which, when pi is the active float, is exactly
 * the buffer we don't want to replace.
 */
export async function openInNvim(path: string): Promise<void> {
	const sock = getNvimSocket();
	if (!sock) return;
	await runNvim(["--server", sock, "--remote-expr", buildOpenExpr(path)]);
}

/**
 * Build a `luaeval(...)` expression that, when evaluated in the parent
 * Neovim, locates a suitable window and `:edit`s `path` into it.
 *
 * `luaeval(code, arg)` exposes `arg` to the Lua chunk as `_A`, so the path
 * never has to be string-interpolated into the Lua source (which would
 * require backslash/quote dancing).
 */
function buildOpenExpr(path: string): string {
	const lua = [
		"(function(p)",
		"  local target",
		"  for _, w in ipairs(vim.api.nvim_list_wins()) do",
		'    local cfg = vim.api.nvim_win_get_config(w)',
		'    if cfg.relative == "" then',
		"      local b = vim.api.nvim_win_get_buf(w)",
		'      if vim.bo[b].buftype ~= "terminal" then',
		"        target = w",
		"        break",
		"      end",
		"    end",
		"  end",
		"  if target then",
		"    vim.api.nvim_set_current_win(target)",
		'    vim.cmd("edit " .. vim.fn.fnameescape(p))',
		"  else",
		'    vim.cmd("botright new " .. vim.fn.fnameescape(p))',
		"  end",
		'  return ""',
		"end)(_A)",
	].join(" ");
	// Wrap as a Vim single-quoted string; a literal `'` becomes `''`.
	const vimStr = (s: string): string => "'" + s.replace(/'/g, "''") + "'";
	return `luaeval(${vimStr(lua)}, ${vimStr(path)})`;
}

function runNvim(args: string[]): Promise<void> {
	return new Promise((resolve) => {
		const child = spawn("nvim", args, { stdio: "ignore", detached: false });
		child.on("error", () => resolve());
		child.on("exit", () => resolve());
	});
}
