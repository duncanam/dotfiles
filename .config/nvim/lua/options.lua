require "nvchad.options"

-- Cursorline
local o = vim.o
o.cursorlineopt ='both'

-- Relative line numbers
vim.o.number = true          -- Enable absolute line numbers
vim.o.relativenumber = true  -- Enable relative line numbers
vim.o.scrolloff = 999        -- Keep centered

-- This swaps relative to absolute numbering once in insert mode
vim.api.nvim_create_autocmd("InsertEnter", { command = [[set norelativenumber]] })
vim.api.nvim_create_autocmd("InsertLeave", { command = [[set relativenumber]] })
