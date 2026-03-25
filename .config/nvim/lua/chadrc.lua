-- This file needs to have same structure as nvconfig.lua
-- https://github.com/NvChad/ui/blob/v3.0/lua/nvconfig.lua
-- Please read that file to know all available options :(

---@type ChadrcConfig
local M = {}

M.base46 = {
  theme = "flexoki-light",
  theme_toggle = { "catppuccin", "flexoki-light" },

  -- Dark (Mocha) diff overrides live here since catppuccin is a built-in theme.
  changed_themes = {
    catppuccin = {
      polish_hl = {
        git = {
          DiffAdd = { bg = "#2d4f3e", fg = "#a6e3a1" },
          DiffAdded = { bg = "#2d4f3e", fg = "#a6e3a1" },
          DiffDelete = { bg = "#4a2d33", fg = "#f38ba8" },
          DiffRemoved = { bg = "#4a2d33", fg = "#f38ba8" },
          DiffChange = { bg = "#2d3f5c", fg = "#89b4fa" },
          DiffText = { bg = "#4a5a7d", fg = "#cdd6f4" },
        },
      },
    },
    ["flexoki-light"] = {
      polish_hl = {
        git = {
          DiffAdd = { bg = "#d4e2b0", fg = "#66800B" },
          DiffAdded = { bg = "#d4e2b0", fg = "#66800B" },
          DiffDelete = { bg = "#efc4b8", fg = "#AF3029" },
          DiffRemoved = { bg = "#efc4b8", fg = "#AF3029" },
          DiffChange = { bg = "#c4d5e8", fg = "#205EA6" },
          DiffText = { bg = "#a8c0da", fg = "#2a2929" },
        },
      },
    },
  },
}

M.ui = {
  tabufline = {
    lazyload = false,
  },
}

M.term = {
  sizes = { sp = 0.3, vsp = 0.4, ["bo sp"] = 0.3, ["bo vsp"] = 0.4 },
  float = {
    relative = "editor",
    row = 0.05,
    col = 0.04,
    width = 0.9,
    height = 0.8,
    border = "single",
  },
}

return M
