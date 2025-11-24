-- This file needs to have same structure as nvconfig.lua
-- https://github.com/NvChad/ui/blob/v3.0/lua/nvconfig.lua
-- Please read that file to know all available options :(

---@type ChadrcConfig
local M = {}

M.base46 = {
  theme = "catppuccin",

  hl_override = {
    -- Brighter diff colors using Catppuccin palette
    DiffAdd = { bg = "#2d4f3e", fg = "#a6e3a1" }, -- Green tint for additions
    DiffDelete = { bg = "#4a2d33", fg = "#f38ba8" }, -- Red tint for deletions
    DiffChange = { bg = "#2d3f5c", fg = "#89b4fa" }, -- Blue tint for changes
    DiffText = { bg = "#4a5a7d", fg = "#cdd6f4" }, -- Brighter blue for changed text
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
