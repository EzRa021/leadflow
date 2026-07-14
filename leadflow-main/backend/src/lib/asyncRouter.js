import { Router } from "express";

// ─────────────────────────────────────────────────────────────────
// Async-safe Express router.
//
// Express 4 does NOT forward errors thrown/rejected inside an
// `async (req, res) => {…}` handler to the error-handling middleware —
// the rejection is unhandled and the request hangs forever with no
// response (that only became automatic in Express 5). Every route in
// this app is async and talks to Supabase/WhatsApp, so a genuine thrown
// exception (network drop, unexpected shape) would otherwise wedge the
// request instead of returning a useful error to the frontend.
//
// This factory returns a normal Router whose get/post/put/patch/delete/
// all/use methods automatically wrap each async handler so any rejection
// is passed to next(err), reaching the global error handler in index.js.
// Drop-in replacement: `const router = asyncRouter()` instead of
// `const router = Router()`.
// ─────────────────────────────────────────────────────────────────
export function asyncRouter() {
  const router = Router();
  const methods = ["get", "post", "put", "patch", "delete", "all", "use"];

  for (const method of methods) {
    const original = router[method].bind(router);
    router[method] = (...args) => {
      const wrapped = args.map((arg) =>
        // Only wrap route handlers/middleware (arity < 4). Error handlers
        // (err, req, res, next) have arity 4 and must be left untouched.
        typeof arg === "function" && arg.length < 4
          ? (req, res, next) => Promise.resolve(arg(req, res, next)).catch(next)
          : arg,
      );
      return original(...wrapped);
    };
  }

  return router;
}
