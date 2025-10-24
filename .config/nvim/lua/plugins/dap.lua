-- TODO: migrate DAP configs into config folder

return {
  -- Debug Adapter Protocol
  {
    "mfussenegger/nvim-dap",
    config = function()
      require("dapui").setup()
      require("dap-python").setup("uv")
    end
  },

  -- Python Debug
  {
    "mfussenegger/nvim-dap-python",
  },

  -- Debugger user interface
  {
    'rcarriga/nvim-dap-ui',
    dependencies = {
      'mfussenegger/nvim-dap',
      'nvim-neotest/nvim-nio',
    },
    opts = {},

    config = function()
      require("dapui").setup()

      local dap, dapui = require 'dap', require 'dapui'
      dap.listeners.before.attach.dapui_config = function()
        dapui.open()
      end
      dap.listeners.before.launch.dapui_config = function()
        dapui.open()
      end
      dap.listeners.before.event_terminated.dapui_config = function()
        dapui.close()
      end
      dap.listeners.before.event_exited.dapui_config = function()
        dapui.close()
      end
    end,
  }

}
