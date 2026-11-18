import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PENALTY_RULES_READ_LANES } from "./use-agency-penalty-rules";

/**
 * The penalty-rules read is gated by LANE on the server, so the web cannot
 * derive its list from `role_permission` — it mirrors the route by hand. This
 * reads the BACKEND ROUTE so a lane added or removed there fails here instead
 * of turning into a 403 (lane wrongly asked) or a hidden editor (lane missed).
 */
describe("PENALTY_RULES_READ_LANES", () => {
	it("mirrors the GET /agency/:id/penalty-rules guard", () => {
		// From apps/web (npx vitest) or the repo root (nx) — never a silent skip.
		const file = "backend/src/features/agency/agency.routes.ts";
		const path = [
			resolve(process.cwd(), "..", file),
			resolve(process.cwd(), "apps", file),
		].find((candidate) => existsSync(candidate));
		expect(path).toBeDefined();
		const source = readFileSync(path ?? "", "utf8");
		const guard = source.match(
			/router\.get\(\s*'\/:id\/penalty-rules',[\s\S]*?requireAgencySubRoleScoped\('id',\s*([^)]*)\)/,
		);
		expect(guard).not.toBeNull();
		const serverLanes = (guard?.[1] ?? "")
			.split(",")
			.map((lane) => lane.trim().replace(/'/g, ""))
			.filter(Boolean);
		// `holdsAgencyLane` lets a guarantor through wherever an owner passes.
		const expected = serverLanes.flatMap((lane) =>
			lane === "owner"
				? ["agency_owner", "agency_guarantor"]
				: [`agency_${lane}`],
		);
		expect([...PENALTY_RULES_READ_LANES].sort()).toEqual(expected.sort());
	});

	it("never asks as a Director (the 403 this list exists to stop)", () => {
		expect(PENALTY_RULES_READ_LANES).not.toContain("agency_director");
	});
});
