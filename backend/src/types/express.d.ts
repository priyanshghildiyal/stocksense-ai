import type { AuthUser } from '../middleware/auth.js';
import 'express-serve-static-core';

// Express 4.22+ adds fetch-like properties to req at runtime that are missing
// from @types/express 4.17.x. Augment the global Express.Request interface so
// route middleware and handlers type-check against the runtime behavior.
declare global {
  namespace Express {
    interface Request {
      cache?: RequestCache;
      credentials?: RequestCredentials;
      destination?: string;
      integrity?: string;
      method?: string;
      mode?: RequestMode;
      redirect?: RequestRedirect;
      referrer?: string;
      referrerPolicy?: ReferrerPolicy;
      signal?: AbortSignal;
      url?: string;
      user?: AuthUser;
    }
  }
}

export {};
