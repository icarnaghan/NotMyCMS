import { defineConfig } from "vitest/config";

// Without this, vitest walks up to the repo-root vite.config.ts, whose `test`
// block scopes includes to the public site's src/ directory and finds nothing
// here. The Lambda handler tests live alongside their sources under lambda/.
export default defineConfig({
  test: {
    // `lib` as well as `lambda`: the include was scoped to handler tests, which is part
    // of why the stacks had none. Stack tests assert against a synthesised template.
    include: ["lambda/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
