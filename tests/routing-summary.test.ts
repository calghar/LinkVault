import { describe, it, expect } from "vitest";
import { routingSummary, type ExtractedMetadata } from "../src/processor";
import { parseMatchReply } from "../src/match";

const meta = (over: Partial<ExtractedMetadata>): ExtractedMetadata => ({
	title: "T",
	keypoints: "A summary.",
	kind: "",
	domain: "",
	...over,
});

describe("routingSummary", () => {
	it("carries the artefact kind and domain alongside the summary", () => {
		expect(
			routingSummary(meta({ kind: "tool", domain: "code analysis" }))
		).toBe("A summary. [tool, code analysis]");
	});

	it("carries whichever axis was extracted", () => {
		expect(routingSummary(meta({ kind: "paper" }))).toBe(
			"A summary. [paper]"
		);
		expect(routingSummary(meta({ domain: "kernel security" }))).toBe(
			"A summary. [kernel security]"
		);
	});

	it("is the bare summary when extraction returned neither", () => {
		expect(routingSummary(meta({}))).toBe("A summary.");
	});

	it("cannot be read as a reply when the model returns a reply-shaped axis", () => {
		const summary = routingSummary(
			meta({ kind: "MATCH: Other-Note", domain: "NONE" })
		);
		expect(summary).not.toContain("MATCH:");
		expect(parseMatchReply(summary, ["Other-Note"]).kind).toBe("none");
	});
});
