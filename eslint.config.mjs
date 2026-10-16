import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const htmlSinkMessage =
  "Don't inject HTML. Render note content as text via noteHtmlToText in lib/noteHtml.ts (CNOTE-12).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name=/^(inner|outer)HTML$/]",
          message: htmlSinkMessage,
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: htmlSinkMessage,
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
