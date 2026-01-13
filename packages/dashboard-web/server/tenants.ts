import type { Request } from "express";

export type TenantsConfig = Record<
  string,
  {
    apps: Record<string, string>; // appName -> agentKey
  }
>;


export function resolveTenantIdFromHeaders(headers: any): string {
  const fromHeader =
    headers?.["x-tenant-id"]?.toString()?.trim() ||
    headers?.["X-Tenant-Id"]?.toString()?.trim();

  return fromHeader || process.env.DEFAULT_TENANT_ID || "local";
}

export function getTenantId(req: Request) {
  const raw = req.header("x-tenant-id");
  const t = typeof raw === "string" ? raw.trim() : "";
  return t || process.env.DEFAULT_TENANT_ID || "local";
}

