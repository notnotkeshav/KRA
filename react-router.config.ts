import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode - all rendering happens client-side
  // IndexedDB is client-only, so SSR is not applicable
  ssr: false,
} satisfies Config;
