import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Broken(): never { throw new Error("broken"); }

describe("AppErrorBoundary", () => {
  it("replaces a crashed application with a local-data-safe recovery message", async () => {
    const container = document.createElement("div"); const root = createRoot(container); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => root.render(<AppErrorBoundary><Broken /></AppErrorBoundary>));
    expect(container.textContent).toContain("The app needs a fresh start");
    expect(container.textContent).toContain("Your score stays on this computer");
    expect(container.textContent).toContain("Reload DigiPiano");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => root.unmount()); error.mockRestore();
  });
});
