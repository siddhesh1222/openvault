import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  { ignores: ["dist", "src/components/ui"] }, // ui/ is generated shadcn code
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // JSX usage isn't seen by the core rule without eslint-plugin-react;
      // ignore capitalised names (components) and "motion".
      "no-unused-vars": ["error", { varsIgnorePattern: "^([A-Z_]|motion$)", argsIgnorePattern: "^_" }],
    },
  },
];
