import { describe, it, expect } from "vitest";
import { parseMatchReply } from "../src/match";

const KB = ["AI-Security", "Kubernetes-Containers", "Personal-Finance"];

describe("parseMatchReply", () => {
	it("resolves a MATCH reply to the candidate's canonical casing", () => {
		expect(parseMatchReply("MATCH: ai-security", KB)).toEqual({
			kind: "match",
			name: "AI-Security",
		});
	});

	it("treats a MATCH naming something not in the list as no match", () => {
		expect(parseMatchReply("MATCH: Woodworking", KB)).toEqual({
			kind: "none",
		});
	});

	it("reads a proposed new name off a NEW reply", () => {
		expect(parseMatchReply("NEW: Space-Industry", KB)).toEqual({
			kind: "new",
			name: "Space-Industry",
		});
	});

	it("treats a NEW reply with no name as no match", () => {
		expect(parseMatchReply("NEW:", KB)).toEqual({ kind: "none" });
	});

	it("accepts a bare candidate name, for prompts predating the contract", () => {
		expect(parseMatchReply("Personal-Finance", KB)).toEqual({
			kind: "match",
			name: "Personal-Finance",
		});
	});

	// The misrouting bug: a reply that merely mentions a note used to file the link there.
	// Reintroducing substring matching would make every assertion here fail.
	it.each([
		"This is probably related to AI-Security but not really",
		"I think AI-Security",
		"None of these fit, though AI-Security is closest",
	])("refuses a reply that only mentions a candidate: %s", (reply) => {
		expect(parseMatchReply(reply, KB)).toEqual({ kind: "none" });
	});

	it("reads only the first line, ignoring any commentary after it", () => {
		expect(
			parseMatchReply("MATCH: AI-Security\nBecause it covers prompt injection.", KB)
		).toEqual({ kind: "match", name: "AI-Security" });
	});

	it.each(["NONE", "none", "  none  ", "", "   "])(
		"treats %j as no match",
		(reply) => {
			expect(parseMatchReply(reply, KB)).toEqual({ kind: "none" });
		}
	);

	it("matches nothing when there are no candidates", () => {
		expect(parseMatchReply("MATCH: AI-Security", [])).toEqual({
			kind: "none",
		});
	});
});
