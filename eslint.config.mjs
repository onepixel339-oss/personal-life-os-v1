import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* v1.4 — the linter is back at work. The rules re-enabled below are the
   ones that catch real regressions cheaply (unused code, accidental
   reassignment, unreachable branches, invalid HTML entities). The rules
   still disabled are deliberate, each for a reason:
   - no-console / no-empty: console.error + quiet catch are established
     patterns in the service layer ("best-effort, never block the user").
   - no-undef: TypeScript's checker owns this job.
   - react-hooks/exhaustive-deps & purity: several live queries and
     one-time effects intentionally read narrow deps.
   - no-explicit-any / no-non-null-assertion / ban-ts-comment: legacy
     surface still being tightened — flip them on gradually, not in a
     release that also ships security work.
   - no-img-element / no-html-link-for-pages: SPA + plain <img> usage. */

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules — re-enabled in v1.4
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "error",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules — re-enabled in v1.4
    "prefer-const": "error",
    "no-debugger": "error",
    "no-unreachable": "error",
    "no-redeclare": "error",
    "no-useless-escape": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-irregular-whitespace": "error",
    "no-mixed-spaces-and-tabs": "error",
    // still deliberate (see the header comment)
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "react/no-unescaped-entities-copy": "off",
    "no-unused-vars": "off", // TS rule above owns it
    "no-console": "off",
    "no-empty": "off",
    "no-undef": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "scripts/**", "tests/**"]
}];

export default eslintConfig;
