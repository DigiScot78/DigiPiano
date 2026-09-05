export type AppEnvironment = "local" | "staging" | "production";

export interface RuntimeEnvironment {
  name: AppEnvironment;
  errorReportingEnabled: false;
}

export function readRuntimeEnvironment(value: unknown): RuntimeEnvironment {
  const name: AppEnvironment = value === "staging" || value === "production" ? value : "local";
  return { name, errorReportingEnabled: false };
}

export const runtimeEnvironment = readRuntimeEnvironment(import.meta.env.VITE_APP_ENV);
