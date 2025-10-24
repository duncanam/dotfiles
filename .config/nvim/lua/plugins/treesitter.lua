-- Override default ensure_installed
return {
  	"nvim-treesitter/nvim-treesitter",
  	opts = {
  		ensure_installed = {
  			"vim", "lua", "vimdoc", "julia",
        "html", "css", "rust", "python",
  	},
  },
}

