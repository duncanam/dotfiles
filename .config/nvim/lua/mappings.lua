require "nvchad.mappings"

-- add yours here

local map = vim.keymap.set

map("n", ";", ":", { desc = "CMD enter command mode" })

-- Save
map("n", "<leader>w", "<cmd>w<CR>", { desc = "general save file" })

-- Quit
map("n", "<leader>q", "<cmd>q<CR>", { desc = "quit" })

-- Explorer
map("n", "<leader>e", "<cmd>NvimTreeToggle<cr>", { desc = "toggle nvimtree" })

-- whichkey
map("n", "<leader>kK", "<cmd>WhichKey <CR>", { desc = "whichkey all keymaps" })
map("n", "<leader>kk", function()
  vim.cmd("WhichKey " .. vim.fn.input "WhichKey: ")
end, { desc = "whichkey query lookup" })

-- Debugger
map("n", "<F9>", "<cmd>lua require'dap'.toggle_breakpoint()<CR>")
map("n", "<F5>", "<cmd>lua require'dap'.continue()<CR>")
map("n", "<F4>", "<cmd>lua require'dap'.terminate()<CR>")
map("n", "<F10>", "<cmd>lua require'dap'.step_over()<CR>")
map("n", "<F11>", "<cmd>lua require'dap'.step_into()<CR>")
map("n", "<F12>", "<cmd>lua require'dap'.step_out()<CR>")
map("n", "<leader>du", "<cmd>lua require'dapui'.toggle()<CR>", { desc = "Toggle DAP UI" })

-- LSP
map("n", "<leader>ld", "<cmd>lua require'telescope.builtin'.diagnostics()<CR>", { desc = "LSP Buffer Diagnostics" })
map("n", "gd", "<cmd> lua require'telescope.builtin'.lsp_definitions()<CR>", { desc = "LSP Definition" })

-- Find/Replace with Spectre
map("n", "<leader>ss", "<cmd>lua require('spectre').toggle()<CR>", { desc = "Open Spectre Find/Replace" })
map("n", "<leader>sr", "<cmd>lua require('spectre.actions').run_replace()<CR>", { desc = "Specter Replace All" })
map(
  "n",
  "<leader>sc",
  "<cmd>lua require('spectre.actions').run_current_replace()<CR>",
  { desc = "Specter Replace Current" }
)

-- Diffview
map("n", "<leader>dc", "<cmd>DiffviewClose<CR>", { desc = "Diffview Close" })
map("n", "<leader>do", function()
  vim.cmd("DiffviewOpen " .. vim.fn.input "Commit range: ")
end, { desc = "Diffview Open" })
map("n", "<leader>dh", function()
  vim.cmd("DiffviewOpen HEAD~" .. vim.fn.input "From HEAD~: " .. "..HEAD~" .. vim.fn.input "To HEAD~: ")
end, { desc = "Diffview Open HEAD Range" })
map("n", "<leader>dt", function()
  vim.cmd("DiffviewOpen " .. vim.fn.input "From commit: " .. ".." .. vim.fn.input "To commit: ")
end, { desc = "Diffview Open Commit Range" })

-- AI Slop
vim.keymap.set("n", "<leader>cc", "<cmd>ClaudeCode<CR>", { desc = "Toggle Claude Code" })

-- Window Resizing
map("n", "<C-Up>", "<cmd>resize +2<CR>", { desc = "Increase window height" })
map("n", "<C-Down>", "<cmd>resize -2<CR>", { desc = "Decrease window height" })
map("n", "<C-Right>", "<cmd>vertical resize -2<CR>", { desc = "Increase window width" })
map("n", "<C-Left>", "<cmd>vertical resize +2<CR>", { desc = "Decrease window width" })
