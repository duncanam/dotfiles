local M = {}

-- Pi is owned by this Neovim instance rather than by the floating terminal.
-- A separate tmux server makes the session discoverable from another terminal
-- without accidentally switching an outer tmux client that launched Neovim.
local TMUX_SERVER = "pi-nvim"
local SESSION_PREFIX = "pi-nvim-"
local OWNER_PID = vim.fn.getpid()
local OWNER_SERVER = vim.v.servername
-- Match the old terminal launcher: use the configured login shell so pi is
-- found even when it comes from shell initialization (for example nvm).
local PI_LAUNCH_COMMAND = ("%s -lc %s"):format(vim.fn.shellescape(vim.o.shell), vim.fn.shellescape("exec pi"))
local SESSION_NAME = ("%s%d-%s"):format(SESSION_PREFIX, OWNER_PID, vim.fn.sha256(OWNER_SERVER):sub(1, 10))
local SESSION_TARGET = SESSION_NAME
local SESSION_FORMAT = "#{session_name}\t#{@pi_managed}\t#{@pi_owner_pid}\t#{@pi_owner_server}"
local OWNER_FORMAT = "#{@pi_managed}\t#{@pi_owner_pid}\t#{@pi_owner_server}"

local state = {
  buf = nil,
  win = nil,
  job = nil,
  generation = 0,
  session_generation = 0,
  stopped = false,
}

local function valid_buf(buf)
  return buf and vim.api.nvim_buf_is_valid(buf)
end

local function valid_win(win)
  return win and vim.api.nvim_win_is_valid(win)
end

local function tmux_command(args)
  local command = { "tmux", "-L", TMUX_SERVER }
  vim.list_extend(command, args)
  return command
end

-- The Pi tmux client lives inside a Neovim terminal. Sending selections via
-- OSC 52 crosses that nested terminal boundary and can truncate large copies,
-- so send them to the host clipboard directly instead.
local function clipboard_copy_command()
  local candidates
  if vim.fn.has "mac" == 1 then
    candidates = { { "pbcopy" } }
  elseif vim.fn.has "unix" == 1 then
    candidates = {}
    if vim.env.WAYLAND_DISPLAY and vim.env.WAYLAND_DISPLAY ~= "" then
      table.insert(candidates, { "wl-copy" })
    end
    vim.list_extend(candidates, {
      { "xclip", "-selection clipboard" },
      { "xsel", "--clipboard --input" },
      { "wl-copy" },
    })
  else
    candidates = { { "clip" } }
  end

  for _, candidate in ipairs(candidates) do
    local executable, arguments = candidate[1], candidate[2]
    local path = vim.fn.exepath(executable)
    if path ~= "" then
      return vim.fn.shellescape(path) .. (arguments and " " .. arguments or "")
    end
  end
end

local function result_error(result)
  local message = vim.trim(result.stderr or "")
  if message == "" then
    message = vim.trim(result.stdout or "")
  end
  if message == "" then
    message = ("tmux exited with code %s"):format(result.code or "unknown")
  end
  return message
end

local function run_tmux(args, callback)
  if vim.fn.executable "tmux" ~= 1 then
    vim.schedule(function()
      callback({ code = 127, stdout = "", stderr = "tmux is not installed or not on $PATH" })
    end)
    return
  end

  local ok, err = pcall(vim.system, tmux_command(args), { text = true }, function(result)
    vim.schedule(function()
      callback(result)
    end)
  end)

  if not ok then
    vim.schedule(function()
      callback({ code = 127, stdout = "", stderr = tostring(err) })
    end)
  end
end

local function configure_tmux_clipboard(callback)
  local command = clipboard_copy_command()
  if not command then
    callback(true)
    return
  end

  -- This server belongs exclusively to the Pi float, so these server-wide
  -- bindings do not affect any ordinary tmux session. Bind both tables in
  -- case the user switches between emacs and vi copy-mode keys.
  local commands = {
    { "set-option", "-s", "set-clipboard", "off" },
    { "bind-key", "-T", "copy-mode", "MouseDragEnd1Pane", "send-keys", "-X", "copy-pipe-and-cancel", command },
    { "bind-key", "-T", "copy-mode-vi", "MouseDragEnd1Pane", "send-keys", "-X", "copy-pipe-and-cancel", command },
  }

  local function run_next(index)
    local args = commands[index]
    if not args then
      callback(true)
      return
    end

    run_tmux(args, function(result)
      if result.code ~= 0 then
        callback(false, result_error(result))
        return
      end
      run_next(index + 1)
    end)
  end

  run_next(1)
end

local function run_tmux_sync(args)
  if vim.fn.executable "tmux" ~= 1 then
    return nil
  end

  local ok, process = pcall(vim.system, tmux_command(args), { text = true })
  if not ok then
    return nil
  end

  local waited, result = pcall(function()
    return process:wait(1000)
  end)
  if not waited then
    return nil
  end
  return result
end

local function parse_owner(output)
  output = (output or ""):gsub("[\r\n]+$", "")
  local managed, pid, server = output:match("^([^\t]*)\t([^\t]*)\t(.*)$")
  if not managed then
    return nil
  end
  return {
    managed = managed,
    pid = pid,
    server = server,
  }
end

local function parse_session(line)
  local name, managed, pid, server = line:match("^([^\t]*)\t([^\t]*)\t([^\t]*)\t(.*)$")
  if not name then
    return nil
  end
  return {
    name = name,
    managed = managed,
    pid = pid,
    server = server,
  }
end

local function is_current_owner(owner)
  return owner
    and owner.managed == "1"
    and owner.pid == tostring(OWNER_PID)
    and owner.server == OWNER_SERVER
end

local function owner_is_alive(owner)
  if not owner or owner.managed ~= "1" or owner.server == "" then
    return false
  end

  local pid = tonumber(owner.pid)
  if not pid or pid < 1 or not vim.uv.kill(pid, 0) then
    return false
  end

  -- Normal Neovim instances listen on a Unix socket. Checking that it still
  -- exists closes the tiny PID-reuse hole and catches crashed Nvim processes.
  -- A TCP --listen address has no local filesystem entry, so PID liveness is
  -- the best local check for that uncommon configuration.
  if owner.server:sub(1, 1) == "/" then
    return vim.uv.fs_stat(owner.server) ~= nil
  end

  return true
end

local function read_owner(name, callback)
  run_tmux({ "display-message", "-p", "-t", name, OWNER_FORMAT }, function(result)
    if result.code ~= 0 then
      callback(nil, result_error(result))
      return
    end
    callback(parse_owner(result.stdout))
  end)
end

local function kill_session(name, callback)
  run_tmux({ "kill-session", "-t", name }, function(result)
    callback(result.code == 0, result)
  end)
end

local function set_session_metadata(name, callback)
  -- Set the managed marker last. The stale-session sweep only considers
  -- marked sessions, so it cannot mistake a session midway through creation
  -- for an orphan.
  local options = {
    { "@pi_owner_pid", tostring(OWNER_PID) },
    { "@pi_owner_server", OWNER_SERVER },
    { "@pi_managed", "1" },
  }

  local function set_next(index)
    local option = options[index]
    if not option then
      callback(true)
      return
    end

    run_tmux({ "set-option", "-t", name, option[1], option[2] }, function(result)
      if result.code ~= 0 then
        callback(false, result_error(result))
        return
      end
      set_next(index + 1)
    end)
  end

  set_next(1)
end

local validate_existing_session

local function create_session(callback)
  local cwd = vim.uv.fs_realpath(vim.fn.getcwd()) or vim.fn.getcwd()
  run_tmux({
    "new-session",
    "-d",
    "-s",
    SESSION_NAME,
    "-c",
    cwd,
    "-e",
    "NVIM=" .. OWNER_SERVER,
    PI_LAUNCH_COMMAND,
  }, function(result)
    if result.code ~= 0 then
      -- Another open request may have won the race to create this instance's
      -- target. Verify it rather than treating the duplicate as an error.
      run_tmux({ "has-session", "-t", SESSION_TARGET }, function(existing)
        if existing.code == 0 then
          validate_existing_session(callback)
        else
          callback(false, result_error(result))
        end
      end)
      return
    end

    set_session_metadata(SESSION_NAME, function(ok, err)
      if ok then
        callback(true)
        return
      end

      kill_session(SESSION_NAME, function()
        callback(false, err)
      end)
    end)
  end)
end

validate_existing_session = function(callback)
  read_owner(SESSION_NAME, function(owner, err)
    if not owner then
      callback(false, err or "Pi tmux session is missing ownership metadata")
      return
    end

    if is_current_owner(owner) then
      callback(true)
      return
    end

    if owner.managed == "1" and not owner_is_alive(owner) then
      kill_session(SESSION_NAME, function(killed, result)
        if not killed then
          callback(false, result_error(result))
          return
        end
        create_session(callback)
      end)
      return
    end

    callback(false, ("tmux session %q belongs to another live owner"):format(SESSION_NAME))
  end)
end

local function ensure_session(callback)
  local function configure_after_session(ok, err)
    if not ok then
      callback(false, err)
      return
    end

    configure_tmux_clipboard(function(clipboard_ok, clipboard_err)
      if not clipboard_ok then
        vim.notify(("Pi clipboard integration unavailable: %s"):format(clipboard_err), vim.log.levels.WARN)
      end
      callback(true)
    end)
  end

  run_tmux({ "has-session", "-t", SESSION_TARGET }, function(result)
    if result.code == 0 then
      validate_existing_session(configure_after_session)
    else
      create_session(configure_after_session)
    end
  end)
end

local function sweep_stale_sessions()
  run_tmux({ "list-sessions", "-F", SESSION_FORMAT }, function(result)
    if result.code ~= 0 then
      -- No dedicated server yet is the normal first-run case.
      return
    end

    local stale = {}
    for line in (result.stdout or ""):gmatch("[^\r\n]+") do
      local session = parse_session(line)
      if session
        and session.name:sub(1, #SESSION_PREFIX) == SESSION_PREFIX
        and session.managed == "1"
        and not is_current_owner(session)
        and not owner_is_alive(session)
      then
        table.insert(stale, session.name)
      end
    end

    if #stale == 0 then
      return
    end

    local remaining = #stale
    local cleaned = 0
    for _, name in ipairs(stale) do
      kill_session(name, function(ok)
        if ok then
          cleaned = cleaned + 1
        end
        remaining = remaining - 1
        if remaining == 0 and cleaned > 0 then
          vim.notify(("Cleaned up %d stale Pi tmux session%s"):format(cleaned, cleaned == 1 and "" or "s"))
        end
      end)
    end
  end)
end

local function set_status(buf, lines)
  if not valid_buf(buf) then
    return
  end

  local expanded = {}
  for _, line in ipairs(lines) do
    for _, part in ipairs(vim.split(tostring(line), "\n", { plain = true, trimempty = false })) do
      table.insert(expanded, (part:gsub("\r$", "")))
    end
  end

  vim.bo[buf].modifiable = true
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, expanded)
  vim.bo[buf].modifiable = false
end

local function close_view(stop_insert)
  state.generation = state.generation + 1

  local buf = state.buf
  local win = state.win
  local job = state.job
  state.buf = nil
  state.win = nil
  state.job = nil

  if job and job > 0 then
    pcall(vim.fn.jobstop, job)
  end
  if valid_win(win) then
    pcall(vim.api.nvim_win_close, win, true)
  end
  if valid_buf(buf) then
    pcall(vim.api.nvim_buf_delete, buf, { force = true })
  end

  -- Closing the float from terminal-insert mode can leave the window we land
  -- on stuck in insert mode, which silently eats <leader>/<Space> (which-key
  -- never fires). Force normal mode so leader mappings keep working.
  if stop_insert then
    vim.cmd "stopinsert"
  end
end

local function is_current_view(buf, win, generation)
  return state.buf == buf and state.win == win and state.generation == generation and valid_buf(buf) and valid_win(win)
end

local function attach_terminal(buf, win, generation)
  if not is_current_view(buf, win, generation) then
    return
  end

  local job_id
  local ok, err = pcall(vim.api.nvim_win_call, win, function()
    -- termopen() refuses a modified buffer. The status text is useful while
    -- tmux setup runs asynchronously, but discard it before turning this
    -- scratch buffer into a terminal.
    vim.bo[buf].modifiable = true
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, {})
    vim.bo[buf].modified = false
    job_id = vim.fn.termopen({
      "env",
      "-u",
      "TMUX",
      "-u",
      "TMUX_PANE",
      "tmux",
      "-L",
      TMUX_SERVER,
      "attach-session",
      "-t",
      SESSION_TARGET,
    }, {
      on_exit = function(_, code)
        vim.schedule(function()
          if not is_current_view(buf, win, generation) then
            return
          end
          state.job = nil
          close_view(false)
          if code ~= 0 then
            vim.notify(("Pi tmux attachment exited with code %d"):format(code), vim.log.levels.WARN)
          end
        end)
      end,
    })
  end)

  if not ok or not job_id or job_id <= 0 then
    set_status(buf, {
      "Unable to attach to Pi.",
      "",
      tostring(err or "Failed to start terminal job"),
    })
    return
  end

  state.job = job_id
  if vim.api.nvim_get_current_win() == win then
    vim.cmd "startinsert"
  end
end

local function open()
  if state.buf or state.win or state.job then
    close_view(false)
  end

  if state.stopped then
    state.stopped = false
    state.session_generation = state.session_generation + 1
  end

  state.generation = state.generation + 1
  local generation = state.generation
  local session_generation = state.session_generation
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].swapfile = false
  set_status(buf, { "Connecting to Pi..." })

  local width = math.max(1, math.floor(vim.o.columns * 0.9))
  local height = math.max(1, math.floor(vim.o.lines * 0.9))
  local row = math.floor((vim.o.lines - height) / 2)
  local col = math.floor((vim.o.columns - width) / 2)
  local win = vim.api.nvim_open_win(buf, true, {
    relative = "editor",
    width = width,
    height = height,
    row = row,
    col = col,
    border = "double",
  })

  state.buf = buf
  state.win = win

  -- Cleanup never delays the current session's creation or the float itself.
  sweep_stale_sessions()
  ensure_session(function(ok, err)
    -- PiStop or Neovim shutdown may win while tmux creation is in flight.
    -- Tear down a late-created target instead of resurrecting it afterward.
    if state.stopped or state.session_generation ~= session_generation then
      if ok then
        kill_session(SESSION_NAME, function() end)
      end
      return
    end
    if not is_current_view(buf, win, generation) then
      return
    end
    if not ok then
      set_status(buf, {
        "Unable to start Pi tmux session.",
        "",
        err or "Unknown tmux error",
        "",
        "Close this window and retry.",
      })
      return
    end
    attach_terminal(buf, win, generation)
  end)
end

local function kill_current_session_sync()
  run_tmux_sync({ "kill-session", "-t", SESSION_TARGET })
end

function M.toggle()
  if valid_win(state.win) then
    close_view(true)
  else
    open()
  end
end

function M.info()
  vim.notify(("Pi tmux session: %s\nAttach with: tmux -L %s attach-session -t %s"):format(
    SESSION_NAME,
    TMUX_SERVER,
    SESSION_NAME
  ))
end

function M.stop()
  state.stopped = true
  state.session_generation = state.session_generation + 1
  close_view(true)
  kill_session(SESSION_NAME, function(ok, result)
    if ok then
      vim.notify "Stopped Pi tmux session"
    elseif result.code ~= 1 then
      vim.notify(result_error(result), vim.log.levels.WARN)
    end
  end)
end

local group = vim.api.nvim_create_augroup("PiTmuxFloat", { clear = true })
vim.api.nvim_create_autocmd("WinClosed", {
  group = group,
  callback = function(event)
    if tonumber(event.match) == state.win then
      close_view(false)
    end
  end,
})
vim.api.nvim_create_autocmd("VimLeavePre", {
  group = group,
  callback = function()
    state.stopped = true
    state.session_generation = state.session_generation + 1
    kill_current_session_sync()
  end,
})

vim.api.nvim_create_user_command("PiTmux", M.info, { desc = "Show the tmux session backing Pi", force = true })
vim.api.nvim_create_user_command("PiStop", M.stop, { desc = "Stop Pi's tmux session", force = true })

return M
