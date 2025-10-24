-- This file needs to have same structure as nvconfig.lua 
-- https://github.com/NvChad/ui/blob/v3.0/lua/nvconfig.lua
-- Please read that file to know all available options :( 

---@type ChadrcConfig
local M = {}

M.base46 = {
	theme = "catppuccin",

  hl_override = {
    DiffAdd = {bg = "#20303b"},
    DiffDelete = {bg = "#37222c"},
    DiffChange = {bg = "#182231"},
    DiffText = {bg = "#394b70"},
  }
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
