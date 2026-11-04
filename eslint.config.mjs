// RC 0.5 proposal: minimal ESLint v10 flat configuration.
// Uses only ESLint core rules; does not change package.json or package-lock.json.
// A full React/hook-specific lint policy requires a separately reviewed plugin setup.
const browserGlobals = Object.fromEntries(
  [
    "AbortController",
    "alert",
    "btoa",
    "console",
    "crypto",
    "document",
    "fetch",
    "sessionStorage",
    "TextDecoder",
    "TextEncoder",
    "URL",
    "URLSearchParams",
    "window",
  ].map((name) => [name, "readonly"]),
);

const baselineRules = {
  "constructor-super": "error",
  "no-constant-condition": "error",
  "no-debugger": "error",
  "no-undef": "error",
  "no-unreachable": "error",
};

export default [
  { ignores: ["dist/**", "coverage/**", ".vite/**"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browserGlobals,
    },
    rules: baselineRules,
  },
  {
    files: ["server.mjs", "vite.config.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        DOMException: "readonly",
        Response: "readonly",
        setTimeout: "readonly",
        globalThis: "readonly",
      },
    },
    rules: baselineRules,
  },
];
