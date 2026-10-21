-- This file needs to have same structure as nvconfig.lua
-- https://github.com/NvChad/ui/blob/v3.0/lua/nvconfig.lua
-- Please read that file to know all available options :(

-- Detect system appearance before base46 compiles (terminal query hasn't happened yet)
-- Light: flexoki-light / Dark: flexoki
local function system_is_dark()
  local sysname = vim.uv.os_uname().sysname
  local cmd
  if sysname == "Darwin" then
    cmd = "defaults read -g AppleInterfaceStyle 2>/dev/null"
  elseif sysname == "Linux" then
    cmd = "lookandfeeltool -a 2>/dev/null"
  end
  if cmd then
    local handle = io.popen(cmd)
    if handle then
      local result = handle:read("*a")
      handle:close()
      return result:lower():find("dark") ~= nil
    end
  end
  return false
end

---@type ChadrcConfig
local M = {}

M.base46 = {
  theme = system_is_dark() and "flexoki" or "flexoki-light",
  theme_toggle = { "flexoki", "flexoki-light" },

  -- Keep diffs readable in both Flexoki variants.
  changed_themes = {
    flexoki = {
      polish_hl = {
        git = {
          DiffAdd = { bg = "#252D09", fg = "#879A39" },
          DiffAdded = { bg = "#252D09", fg = "#879A39" },
          DiffDelete = { bg = "#3E1715", fg = "#D14D41" },
          DiffRemoved = { bg = "#3E1715", fg = "#D14D41" },
          DiffChange = { bg = "#12253B", fg = "#4385BE" },
          DiffText = { bg = "#163B66", fg = "#CECDC3" },
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
