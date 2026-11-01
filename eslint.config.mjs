import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every AI call goes through callModel() (src/lib/ai/call-model.ts), which checks the budgets and the
  // kill switch and logs the cost. Nothing else may call a provider or read a provider key.
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.mjs", "scripts/**/*.{ts,mts,mjs}"],
    ignores: ["src/lib/ai/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "openai", message: "Call models through callModel() in src/lib/ai/call-model.ts." },
          { name: "ai", message: "Call models through callModel() in src/lib/ai/call-model.ts." },
        ],
        patterns: [{ group: ["@anthropic-ai/*", "openai/*", "@ai-sdk/*"], message: "Call models through callModel() in src/lib/ai/call-model.ts." }],
      }],
      "no-restricted-syntax": ["error",
        { selector: "Literal[value=/api\\.(anthropic\\.com|x\\.ai|openai\\.com)/]", message: "Call models through callModel() in src/lib/ai/call-model.ts." },
        { selector: "TemplateElement[value.raw=/api\\.(anthropic\\.com|x\\.ai|openai\\.com)/]", message: "Call models through callModel() in src/lib/ai/call-model.ts." },
        { selector: "MemberExpression[property.name=/^(CLEANING_ANTHROPIC_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|OPENAI_API_KEY)$/]", message: "Only callModel() may read AI provider keys." },
        { selector: "Literal[value=/^(CLEANING_ANTHROPIC_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|OPENAI_API_KEY)$/]", message: "Only callModel() may read AI provider keys." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
