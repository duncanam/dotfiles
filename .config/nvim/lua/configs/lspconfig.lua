require("nvchad.configs.lspconfig").defaults()

-- Don't start rust_analyzer because rustaceanvim already does this
local servers = { "html", "cssls", "pyright" }
vim.lsp.enable(servers)

-- read :h vim.lsp.config for changing options of lsp servers
