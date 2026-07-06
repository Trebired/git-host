import { describe } from "bun:test";

import {
  registerForgeApiCoverageTest,
  registerForgeApiMissingTagTest,
  registerForgeApiSyncConflictTest,
} from "./api_cases.js";

describe("@trebired/git-host forge", () => {
  registerForgeApiCoverageTest();
  registerForgeApiSyncConflictTest();
  registerForgeApiMissingTagTest();
});
