local config = require "nvchad.configs.cmp"
local cmp = require("cmp")

config.mapping["<Up>"] = cmp.mapping.select_prev_item()
config.mapping["<Down>"] = cmp.mapping.select_next_item()

config.formatting = {
  format = function(_, item)
        local widths = {
          abbr = vim.g.cmp_widths and vim.g.cmp_widths.abbr or 20,
          menu = vim.g.cmp_widths and vim.g.cmp_widths.menu or 20,
        }

        for key, width in pairs(widths) do
          if item[key] and vim.fn.strdisplaywidth(item[key]) > width then
            item[key] = vim.fn.strcharpart(item[key], 0, width - 1) .. "…"
          end
        end

        return item

  end,
}

return config
