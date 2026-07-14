import { supabase } from "../db/supabase.js";

// ─────────────────────────────────────────────────────────────────
// Cross-instance job-cancel bridge (Tier 2 roadmap item #7)
//
// Problem: `activeJobs` in send.js is an in-memory Map keyed by jobId,
// holding a cancel() closure for whichever job THIS process instance is
// actively running/sleeping on. That's fine on a single backend process,
// but once LeadFlow is deployed with more than one backend instance
// (e.g. two Render/Railway dynos, or a local PC + a cloud fallback),
// a "Stop Sending" click can land on an instance that isn't the one
// running the job. The `stop_requested` DB flag still gets set (so the
// job stops at its next per-lead checkpoint), but the in-flight
// `sleepForJob` wait on the *other* instance would otherwise sit there
// until the sleep naturally elapses instead of cancelling immediately.
//
// Fix: use Supabase Realtime to broadcast every `send_jobs` UPDATE to
// all connected instances. Each instance runs the same handler; the one
// that actually holds the cancel function for that jobId fires it, the
// rest no-op. No instance discovery, no extra infra — just piggybacks
// on Postgres change events, which Supabase already provides for free.
// ─────────────────────────────────────────────────────────────────

let channel = null;

/**
 * Wires up the realtime listener once at startup. `onCancelRequested`
 * is called with the jobId whenever any instance (including this one)
 * flags a job to stop. Safe no-op on a single-instance deployment —
 * every stop already originates locally there anyway, so this just
 * fires a redundant call into the same activeJobs.get() lookup.
 */
export function initJobCancelBridge(onCancelRequested) {
  if (channel) return channel; // already wired — avoid duplicate subscriptions on hot-reload

  channel = supabase
    .channel("send_jobs_cancel_bridge")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "send_jobs" },
      (payload) => {
        const row = payload.new;
        if (row?.stop_requested) {
          onCancelRequested(row.id);
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("📡 [realtime] job-cancel bridge connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Non-fatal — the DB flag + per-lead polling checkpoint in send.js
        // still stops the job correctly, just not instantly cross-instance.
        console.warn(`⚠️ [realtime] job-cancel bridge status: ${status} (falling back to polling-only cancel)`);
      }
    });

  return channel;
}

export function closeJobCancelBridge() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}
