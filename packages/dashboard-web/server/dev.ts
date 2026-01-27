import { loadServerEnv } from "./env";

loadServerEnv();

(async () => {
  await import("./index");
})();
