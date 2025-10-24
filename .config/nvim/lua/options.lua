require "nvchad.options"

-- Cursorline
local o = vim.o
o.cursorlineopt = "both"

-- Relative line numbers
vim.o.number = true -- Enable absolute line numbers
vim.o.relativenumber = true -- Enable relative line numbers
vim.o.scrolloff = 999 -- Keep centered
