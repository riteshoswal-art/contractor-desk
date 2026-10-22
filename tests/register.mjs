// Loaded before every test file (see the "test" script in package.json).
// It installs the helper in loader.mjs, which lets Node's built-in test runner
// import the app's TypeScript files directly. No extra packages are needed.
import { register } from "node:module";

register("./loader.mjs", import.meta.url);

// Tests always run with this value; code that must never be used in real life
// (such as the test-only Sheet hook) checks for it.
process.env.NODE_ENV = "test";
