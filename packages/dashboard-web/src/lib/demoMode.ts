import { TENANT_ID } from "./config";

const DEMO_MODE_KEY = (tenantId: string | undefined) => `syncflow:demoMode:${tenantId }`;

export function getDemoMode(): boolean {
  const stored = localStorage.getItem(DEMO_MODE_KEY(TENANT_ID));
  return stored === "1";
}

export function setDemoMode(enabled: boolean): void {
  localStorage.setItem(DEMO_MODE_KEY(TENANT_ID), enabled ? "1" : "0");
}

export function getDemoAppNames(tenantId: string): string[] {
  return [`demo-${tenantId}-app`, `demo-app-${tenantId}`];
}
