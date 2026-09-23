import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";

const COMMAND_MODELS = {
  luna: "gpt-6-luna",
  terra: "gpt-5.6-terra",
  sol: "gpt-6-sol",
  astra: "gpt-6-astra",
} as const;

export default function (pi: ExtensionAPI) {
  for (const [command, modelId] of Object.entries(COMMAND_MODELS)) {
    pi.registerCommand(command, {
      description: `Switch to ${PROVIDER}/${modelId}`,
      handler: async (_args, ctx) => {
        const model = ctx.modelRegistry.find(PROVIDER, modelId);
        if (!model) {
          ctx.ui.notify(`Model is unavailable: ${PROVIDER}/${modelId}`, "error");
          return;
        }

        // setModel retains Pi's current thinking/effort level, subject only to
        // the selected model's supported levels.
        if (!await pi.setModel(model)) {
          ctx.ui.notify(`Authentication is required for ${PROVIDER}.`, "error");
        }
      },
    });
  }
}
