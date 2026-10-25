import type { Server as HttpServer } from "http";
import type { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";

export interface ShutdownOptions {
  httpServer: HttpServer;
  io: SocketIOServer;
  timeoutMs?: number;
  logger?: Pick<Console, "log" | "error">;
  disconnectMongo?: () => Promise<void>;
  // Called when the overall shutdown exceeds timeoutMs. Default forces exit so
  // SIGTERM can never leave the process hanging on a stuck close() callback.
  onTimeout?: () => void;
}

export interface ShutdownHandle {
  shutdown: (reason?: string) => Promise<number>;
  isShuttingDown: () => boolean;
}

export function createShutdownHandle(opts: ShutdownOptions): ShutdownHandle {
  const log = opts.logger ?? console;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const disconnectMongo = opts.disconnectMongo ?? (() => mongoose.disconnect());
  const onTimeout = opts.onTimeout ?? (() => process.exit(1));

  let pending: Promise<number> | null = null;
  let shuttingDown = false;

  async function shutdown(reason = "shutdown"): Promise<number> {
    if (pending) return pending;
    shuttingDown = true;

    pending = (async () => {
      log.log(`[Dashboard] ${reason} received — starting graceful shutdown`);

      const timer = setTimeout(() => {
        log.error(
          `[Dashboard] Shutdown timed out after ${timeoutMs}ms — forcing exit`
        );
        onTimeout();
      }, timeoutMs);
      timer.unref?.();

      try {
        // socket.io's Server.close() calls through to the same httpServer.close(),
        // so one of the two callbacks will see ERR_SERVER_NOT_RUNNING on the
        // second attempt. That's expected and must not fail shutdown.
        const alreadyClosed = (err?: Error) =>
          err && (err as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING";

        // Start the HTTP drain first (so no new connections are accepted) but
        // do NOT await it yet: with an active websocket upgrade still open,
        // httpServer.close() will block indefinitely until the socket closes.
        // Kicking off io.close() in parallel evicts the clients so both can
        // settle.
        const httpClosed = new Promise<void>((resolve, reject) => {
          opts.httpServer.close((err) =>
            !err || alreadyClosed(err) ? resolve() : reject(err)
          );
        });
        const ioClosed = new Promise<void>((resolve, reject) => {
          opts.io.close((err) =>
            !err || alreadyClosed(err) ? resolve() : reject(err)
          );
        });

        await Promise.all([httpClosed, ioClosed]);
        log.log("[Dashboard] HTTP server and Socket.IO closed");

        await disconnectMongo();
        log.log("[Dashboard] MongoDB disconnected");

        clearTimeout(timer);
        return 0;
      } catch (err) {
        clearTimeout(timer);
        log.error("[Dashboard] Shutdown error:", err);
        return 1;
      }
    })();

    return pending;
  }

  return {
    shutdown,
    isShuttingDown: () => shuttingDown
  };
}

export function registerShutdownSignals(handle: ShutdownHandle): void {
  const onSignal = (sig: NodeJS.Signals) => {
    handle.shutdown(sig).then((code) => {
      process.exit(code);
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}
