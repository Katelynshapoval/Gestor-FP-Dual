// Replaces the lint that react-scripts ran during `npm run build`
// (eslint-config-react-app): the rules of hooks, accessibility checks from
// jsx-a11y, and the core checks for undefined names and unused variables.
// CI runs `npm run lint` and fails on warnings.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  { ignores: ["build/", "coverage/", "screenshots/"] },
  // CRA did not report disable comments for rules it never enabled.
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Components used only in JSX count as used.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The jsx-a11y rules eslint-config-react-app enabled (not the full
      // recommended set, which is stricter than what the build checked).
      ...Object.fromEntries(
        [
          "alt-text", "anchor-has-content", "anchor-is-valid", "aria-activedescendant-has-tabindex",
          "aria-props", "aria-proptypes", "aria-role", "aria-unsupported-elements", "heading-has-content",
          "iframe-has-title", "img-redundant-alt", "no-access-key", "no-distracting-elements",
          "no-redundant-roles", "role-has-required-aria-props", "role-supports-aria-props", "scope",
        ].map((rule) => [`jsx-a11y/${rule}`, "warn"]),
      ),
    },
  },
  {
    files: ["src/**/*.test.{js,jsx}", "src/setupTests.js", "src/testUtils.jsx"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
  {
    files: ["*.config.{js,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
