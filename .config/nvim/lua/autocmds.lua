require "nvchad.autocmds"

-- Swap relative to absolute line numbering based on mode
local numbertoggle = vim.api.nvim_create_augroup("numbertoggle", { clear = true })
vim.api.nvim_create_autocmd({ "BufEnter", "FocusGained", "InsertLeave", "WinEnter" }, {
  group = numbertoggle,
  pattern = "*",
  callback = function()
    if vim.o.number and vim.fn.mode() ~= "i" then
      vim.o.relativenumber = true
    end
  end,
})
vim.api.nvim_create_autocmd({ "BufLeave", "FocusLost", "InsertEnter", "WinLeave" }, {
  group = numbertoggle,
  pattern = "*",
  callback = function()
    if vim.o.number then
      vim.o.relativenumber = false
    end
  end,
})

-- Disable line numbers in terminal buffers and fix float background
vim.api.nvim_create_autocmd("TermOpen", {
  pattern = "*",
  callback = function()
    vim.opt_local.number = false
    vim.opt_local.relativenumber = false
    -- Use Normal bg instead of NormalFloat in floating terminal windows
    -- so the terminal background matches the editor regardless of theme
    local win = vim.api.nvim_get_current_win()
    local win_config = vim.api.nvim_win_get_config(win)
    if win_config.relative ~= "" then
      vim.wo[win].winhighlight = "NormalFloat:Normal"
    end
  end,
})
