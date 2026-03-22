import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import tseslint from "typescript-eslint";

const publicApiFiles = [
  "packages/codexec/src/errors.ts",
  "packages/codexec/src/normalize.ts",
  "packages/codexec/src/sanitize.ts",
  "packages/codexec/src/types.ts",
  "packages/codexec/src/executor/executor.ts",
  "packages/codexec/src/provider/resolveProvider.ts",
  "packages/codexec/src/typegen/jsonSchema.ts",
  "packages/codexec/src/mcp/createMcpToolProvider.ts",
  "packages/codexec/src/mcp/codeMcpServer.ts",
  "packages/codexec-quickjs/src/types.ts",
  "packages/codexec-quickjs/src/quickjsExecutor.ts",
  "packages/codexec-isolated-vm/src/types.ts",
  "packages/codexec-isolated-vm/src/isolatedVmExecutor.ts",
];

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
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
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
    },
  },
  {
    files: publicApiFiles,
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
            "ExportNamedDeclaration > ClassDeclaration > ClassBody > MethodDefinition[key.name='execute']",
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
