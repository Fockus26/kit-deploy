import { describe, expect, test } from "bun:test";
import { type RollbackCandidate, rollbackTarget } from "../../lib/kit/rollback";

const at = (m: number) => new Date(Date.UTC(2026, 10, 17, 12, 0) - m * 60_000);
const d = (
  id: string,
  over: Partial<RollbackCandidate>,
): RollbackCandidate => ({
  id,
  shortSha: id.padEnd(7, "0").slice(0, 7),
  environment: "production",
  status: "superseded",
  rollbackable: false,
  createdAt: at(10),
  ...over,
});

describe("rollback target", () => {
  test("the newest kept production deployment older than the live one", () => {
    const items = [
      d("new", { status: "failed", createdAt: at(1) }),
      d("live", { status: "live", createdAt: at(5) }),
      d("kept1", { rollbackable: true, createdAt: at(20) }),
      d("kept2", { rollbackable: true, createdAt: at(40) }),
    ];
    expect(rollbackTarget(items)).toEqual({ id: "kept1", sha: "kept100" });
  });

  test("a kept one newer than the live one is not a step back", () => {
    const items = [
      d("newer", { rollbackable: true, createdAt: at(1) }),
      d("live", { status: "live", createdAt: at(5) }),
    ];
    expect(rollbackTarget(items)).toBeNull();
  });

  test("previews never count; nothing kept → null", () => {
    expect(
      rollbackTarget([
        d("pr", { environment: "preview", rollbackable: true }),
        d("live", { status: "live" }),
      ]),
    ).toBeNull();
    expect(rollbackTarget([])).toBeNull();
  });
});
