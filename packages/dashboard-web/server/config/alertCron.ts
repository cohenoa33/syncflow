
import cron from "node-cron";

export class AlertCronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertCronError";
  }
}

export const DEFAULT_ALERT_EVAL_CRON = "*/5 * * * *";

const ENV_NAME = "ALERT_EVAL_CRON";

export function readAlertEvalCron(): string {
  const raw = process.env[ENV_NAME];
  if (raw === undefined) return DEFAULT_ALERT_EVAL_CRON;

  if (raw.trim() === "") {
    throw new AlertCronError(`${ENV_NAME} must be a valid cron expression`);
  }

  if (!cron.validate(raw)) {
    throw new AlertCronError(`${ENV_NAME} must be a valid cron expression`);
  }

  return raw;
}

export function validateAlertCronConfig(): void {
  readAlertEvalCron();
}
