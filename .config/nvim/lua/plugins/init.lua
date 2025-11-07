return {
  {
    "stevearc/conform.nvim",
    event = "BufWritePre", -- format on save
    opts = require "configs.conform",
  },

  {
    "neovim/nvim-lspconfig",
    config = function()
      require "configs.lspconfig"
    end,
  },

  {
    "lewis6991/spaceless.nvim",
    lazy = false,
  },

  {
    "nvim-pack/nvim-spectre",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
  },

  -- TODO: test new blink
  -- This is an experimental replacement for nvim-cmp
  -- { import = "nvchad.blink.lazyspec" },
}
