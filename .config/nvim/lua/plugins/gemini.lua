return {
  "marcinjahn/gemini-cli.nvim",
  cmd = "Gemini",
  -- Example key mappings for common actions:
  keys = {
    { "<leader>cg", "<cmd>Gemini toggle<cr>", desc = "Toggle Gemini CLI" },
    { "<leader>ca", "<cmd>Gemini ask<cr>", desc = "Ask Gemini", mode = { "n", "v" } },
    { "<leader>cf", "<cmd>Gemini add_file<cr>", desc = "Add File" },
    -- Global keybinding to toggle Gemini with Ctrl+.
    -- { "<C-.>", "<cmd>Gemini toggle<cr>", desc = "Toggle Gemini CLI", mode = { "n", "v", "i", "t" } },
  },
  dependencies = {
    "folke/snacks.nvim",
  },
  config = function()
    require("gemini_cli").setup({
      -- Keep the default gemini command and args
      gemini_cmd = "gemini",
      args = {},
      auto_reload = false,

      -- Configure the terminal window to float like Claude
      win = {
        wo = {
          winbar = "GeminiCLI",
          -- Preserve colorscheme in terminal
          winblend = 0,
        },
        bo = {
          -- Ensure terminal buffer type is preserved
          filetype = "snacks_terminal",
        },
        style = "gemini_cli",
        position = "float",
        -- Floating window configuration - matching Claude closely
        relative = "editor",
        width = 0.92,  -- Slightly wider to match Claude better
        height = 0.9,  -- 90% of editor height
        row = 0.03,   -- Shifted up by 1 more character (3% from top)
        col = 0.04,   -- 4% from left for better centering
        border = "double", -- Nice double border like Claude

        -- Disable backdrop to prevent background color changes
        backdrop = false,

        -- Key mappings for the terminal window
        keys = {
          -- Close with Ctrl+Q from terminal mode
          ["<C-q>"] = {
            "hide",
            mode = { "n", "t" },
            desc = "Close Gemini terminal",
          },
          -- Close with q in normal mode
          q = "hide",
          -- Ctrl+. to toggle (hide) from within the terminal
          -- ["<C-.>"] = {
          --   "hide",
          --   mode = { "n", "t" },
          --   desc = "Hide Gemini terminal",
          -- },
          -- Standard Neovim way to exit terminal mode
          ["<C-\\><C-n>"] = {
            function(self)
              vim.cmd("stopinsert")
            end,
            mode = "t",
            desc = "Exit terminal mode",
          },
        },
      },
    })
  end,
}
