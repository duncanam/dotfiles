-- return {
--   "greggh/claude-code.nvim",
--   dependencies = {
--     "nvim-lua/plenary.nvim", -- Required for git operations
--   },
--   cmd = { "ClaudeCode", "ClaudeCodeContinue", "ClaudeCodeResume", "ClaudeCodeVerbose" },
--   config = function()
--     require("claude-code").setup {
--       window = {
--         position = "float",
--         float = {
--           width = "90%", -- Take up 90% of the editor width
--           height = "90%", -- Take up 90% of the editor height
--           row = "center", -- Center vertically
--           col = "center", -- Center horizontally
--           relative = "editor",
--           border = "double", -- Use double border style
--         },
--       },
--     }
--   end,
-- }
return {
  "coder/claudecode.nvim",
  dependencies = { "folke/snacks.nvim" },
  config = function()
    require("claudecode").setup({
      terminal = {
        split_width_percentage = 0.40, -- 40% width (default is 30%)
      },
    })

    -- Add keybindings for Claude window navigation
    vim.api.nvim_create_autocmd("TermOpen", {
      pattern = "*",
      callback = function()
        -- Check if this is a Claude Code terminal
        local bufname = vim.api.nvim_buf_get_name(0)
        if bufname:match("claudecode") or bufname:match("claude") then
          -- Ctrl+. to jump back to previous window
          vim.keymap.set("t", "<C-.>", "<C-\\><C-n><cmd>wincmd p<cr>", { buffer = true, desc = "Jump to previous window" })
          -- Ctrl+, to hide Claude window
          vim.keymap.set("t", "<C-,>", "<C-\\><C-n><cmd>ClaudeCode<cr>", { buffer = true, desc = "Hide Claude window" })
        end
      end,
    })
  end,
  keys = {
    { "<leader>a", nil, desc = "AI/Claude Code" },
    { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
    { "<C-,>", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
    { "<C-.>", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
    { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
    { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
    { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
    { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select Claude model" },
    { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
    { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
    {
      "<leader>as",
      "<cmd>ClaudeCodeTreeAdd<cr>",
      desc = "Add file",
      ft = { "NvimTree", "neo-tree", "oil", "minifiles", "netrw" },
    },
    -- Diff management
    { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
    { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
  },
}
