/* ═══════════════════════════════════════════════════════════════════
   Stairs — lint

   NARROW ON PURPOSE. Correctness only: rules that answer "is this code
   wrong", never "is this code to my taste". No formatting, no style, no
   opinions, and deliberately NOT eslint's recommended set — recommended
   carries dozens of rules nobody here has agreed to.

   WHY IT EXISTS. #72 shipped `setExecRoomStair(null)` against a setter that
   the same commit had deleted, and it threw on every click of a header
   control in production. `no-undef` finds that in about a second, with no
   test, no browser and no render. We wrote an integration test for that class
   of bug — worth having — but the cheaper catch was sitting right here.

   WHY IT STAYS NARROW. A codebase that has never been linted will open red
   with hundreds of style findings, and a job that is red for reasons nobody
   intends to fix is a job everybody learns to scroll past. That is the same
   argument that kept the dark contrast gate out until dark actually passed.
   Anything added here later has to clear the same bar: it fails only on
   things we would fix.
   ═══════════════════════════════════════════════════════════════════ */

import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // The app is a browser bundle; the audit script and config files are
      // node. Both global sets are allowed rather than split per-directory —
      // no-undef is here to catch identifiers that exist NOWHERE, not to
      // police which runtime a file assumes.
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The rule this job was built for.
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      // Warnings, not errors: both are worth seeing and neither is worth
      // blocking a merge over. `npm run lint` fails on errors only.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
