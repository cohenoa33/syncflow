import cron from "node-cron";
import { AlertFireModel } from "../models";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function startAlertCleanup(): void {
  cron.schedule("0 2 * * *", async () => {
    try {
      const cutoff = Date.now() - TTL_MS;
      const result = await AlertFireModel.deleteMany({ firedAt: { $lt: cutoff } });
      console.log(`[Alerts] Cleanup: deleted ${result.deletedCount} alert fire(s) older than 7 days`);
    } catch (err) {
      console.error("[Alerts] Cleanup failed:", err);
    }
  });

  console.log("[Alerts] Cleanup scheduled: daily at 02:00");
}
