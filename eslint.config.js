import eslintConfigPrettier from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/dist/", "**/node_modules/", "examples/"] },
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
  },
  eslintConfigPrettier,
];
