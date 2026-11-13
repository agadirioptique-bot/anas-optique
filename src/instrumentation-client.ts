import { z } from "zod";

// Runs in the browser before the app hydrates. The Content-Security-Policy forbids eval
// (next.config.ts); Zod 4 would otherwise probe `new Function` on the first schema it builds and
// the browser would log a CSP violation. Jitless parsing gives the same results.
z.config({ jitless: true });
