import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // This codebase uses the `useEffect(() => { setState(...) }, [signal])`
      // pattern intentionally for imperative dismissal signals. Treat as a
      // warning rather than a blocking error.
      "react-hooks/set-state-in-effect": "warn",
      // page.tsx contains prose strings with apostrophes throughout JSX.
      // Escaping every instance adds noise without improving correctness.
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
