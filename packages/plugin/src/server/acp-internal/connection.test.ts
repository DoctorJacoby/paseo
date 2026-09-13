import { RequestError } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { describeError } from "./connection.js";

// Canary for the carried patch on serving/daemon (ledger in dotfiles
// hosts/vps/paseo-daemon.conf): describeError must surface a RequestError's
// data.details instead of the bare "Internal error". If upstream replaces
// describeError with details handling of its own, these cases say at the next
// restack whether the carry is redundant or still needed
// (kobe-work/work-organisation#96 tracks the upstream report).
describe("describeError", () => {
  it("prefers data.details over a bare Internal error", () => {
    const error = RequestError.internalError({
      details: "Claude PTY exited unexpectedly with code 7 and signal 0.",
    });
    expect(describeError(error)).toBe(
      "Claude PTY exited unexpectedly with code 7 and signal 0.",
    );
  });

  it("appends details to a message that already says something", () => {
    const error = new RequestError(-32602, "Invalid params", { details: "cwd is not a directory" });
    expect(describeError(error)).toBe("Invalid params: cwd is not a directory");
  });

  it("keeps the message when details are missing, blank, or identical", () => {
    expect(describeError(new Error("plain failure"))).toBe("plain failure");
    expect(describeError(RequestError.internalError({ details: "   " }))).toBe("Internal error");
    expect(describeError(new RequestError(-32603, "boom", { details: "boom" }))).toBe("boom");
    expect(describeError(RequestError.internalError({ other: true }))).toBe("Internal error");
  });

  it("caps runaway details", () => {
    const error = RequestError.internalError({ details: "x".repeat(5000) });
    const described = describeError(error);
    expect(described.length).toBeLessThan(4100);
    expect(described.endsWith("…")).toBe(true);
  });

  it("still stringifies non-errors", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError(42)).toBe("42");
  });
});
