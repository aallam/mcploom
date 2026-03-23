import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".worktrees/**",
      "dist/**",
      "node_modules/**",
      "package-lock.json",
      "packages/**/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      "@eslint-community/eslint-comments": eslintComments,
      security,
    },
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      "@eslint-community/eslint-comments/disable-enable-pair": "error",
      "@eslint-community/eslint-comments/no-aggregating-enable": "error",
      "@eslint-community/eslint-comments/no-duplicate-disable": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@eslint-community/eslint-comments/no-unused-enable": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "security/detect-bidi-characters": "error",
      "security/detect-child-process": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-require": "error",
    },
  },
  {
    files: ["packages/*/src/**/*.ts"],
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      "jsdoc/require-description": "error",
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > ClassDeclaration",
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > ClassDeclaration > ClassBody > MethodDefinition:not([accessibility='private'])",
          ],
          publicOnly: false,
          require: {
            ClassDeclaration: false,
            FunctionDeclaration: false,
            MethodDefinition: false,
          },
        },
      ],
    },
  },
  eslintConfigPrettier,
);
