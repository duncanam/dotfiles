local M = {}

local state = { buf = nil, win = nil }

local function open()
  local width = math.floor(vim.o.columns * 0.9)
  local height = math.floor(vim.o.lines * 0.9)
  local row = math.floor((vim.o.lines - height) / 2)
  local col = math.floor((vim.o.columns - width) / 2)

  local win_opts = {
    relative = "editor",
    width = width,
    height = height,
    row = row,
    col = col,
    border = "double",
  }

  local reuse = state.buf and vim.api.nvim_buf_is_valid(state.buf)
  if not reuse then
    state.buf = vim.api.nvim_create_buf(false, true)
  end

  state.win = vim.api.nvim_open_win(state.buf, true, win_opts)

  if not reuse then
    vim.fn.termopen({ vim.o.shell, "-lc", "pi" }, {
      on_exit = function()
        if state.buf and vim.api.nvim_buf_is_valid(state.buf) then
          vim.api.nvim_buf_delete(state.buf, { force = true })
        end
        state.buf = nil
        state.win = nil
      end,
    })
  end

  vim.cmd("startinsert")
end

local function close()
  if state.win and vim.api.nvim_win_is_valid(state.win) then
    vim.api.nvim_win_close(state.win, true)
  end
  state.win = nil
end

function M.toggle()
  if state.win and vim.api.nvim_win_is_valid(state.win) then
    close()
  else
    open()
  end
end

return M
