import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { tools as containerTools } from "./containers.js";
import { tools as observeTools } from "./observe.js";
import { tools as daemonTools } from "./daemon.js";
import { tools as imageTools } from "./images.js";
import { tools as composeTools } from "./compose.js";

export default function (pi: ExtensionAPI) {
  const all = [
    ...containerTools,
    ...observeTools,
    ...daemonTools,
    ...imageTools,
    ...composeTools,
  ];
  for (const tool of all) pi.registerTool(tool);
}
