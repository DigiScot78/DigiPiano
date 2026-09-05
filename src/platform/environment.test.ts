import { describe, expect, it } from "vitest";
import { readRuntimeEnvironment } from "./environment";

describe("readRuntimeEnvironment", () => {
  it("recognises explicit deployment environments", () => {
    expect(readRuntimeEnvironment("staging")).toEqual({ name: "staging", errorReportingEnabled: false });
    expect(readRuntimeEnvironment("production")).toEqual({ name: "production", errorReportingEnabled: false });
  });
  it("fails closed to local without enabling reporting", () => expect(readRuntimeEnvironment("preview")).toEqual({ name: "local", errorReportingEnabled: false }));
});
