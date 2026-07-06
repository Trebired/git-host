import { describe } from "bun:test";

import {
  registerForgeAssetLinkTest,
  registerForgeAssetRouteTest,
} from "./assets_cases.js";

describe("@trebired/git-host forge assets", () => {
  registerForgeAssetLinkTest();
  registerForgeAssetRouteTest();
});
