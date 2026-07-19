import { describe, it, expect } from "vitest";
import {
	writeManagedRegion,
	buildIndexBody,
	INDEX_BEGIN,
	INDEX_END,
} from "../src/vault";

const BODY = "| Note | Sections | Links |\n| ---- | -------- | ----- |";

// A hand-curated index note: everything outside the markers is the user's own writing.
const CURATED = [
	"# Knowledge Base Index",
	"",
	"## Topics Covered",
	"",
	"| Theme | Notes |",
	"| ----- | ----- |",
	"| 🔐 Security | AI-Security |",
	"",
	"## All Notes",
	"",
	INDEX_BEGIN,
	"| Note | Sections | Links |",
	"| ---- | -------- | ----- |",
	"| [[Stale-Note]] | Old | 3 |",
	INDEX_END,
	"",
	"_Maintained by hand above, generated below._",
	"",
].join("\n");

describe("writeManagedRegion", () => {
	// The whole point of the managed region: a rebuild must never touch curated content.
	it("preserves everything outside the markers byte for byte", () => {
		const { text, ok } = writeManagedRegion(CURATED, BODY);
		expect(ok).toBe(true);
		expect(text.slice(0, text.indexOf(INDEX_BEGIN))).toBe(
			CURATED.slice(0, CURATED.indexOf(INDEX_BEGIN))
		);
		expect(text.slice(text.indexOf(INDEX_END))).toBe(
			CURATED.slice(CURATED.indexOf(INDEX_END))
		);
	});

	it("replaces the previous region contents", () => {
		const { text } = writeManagedRegion(CURATED, BODY);
		expect(text).not.toContain("Stale-Note");
		expect(text).toContain(BODY);
	});

	// Repeated rebuilds must not accumulate regions or drift.
	it("is stable across repeated writes", () => {
		const once = writeManagedRegion(CURATED, BODY).text;
		expect(writeManagedRegion(once, BODY).text).toBe(once);
		expect(once.split(INDEX_BEGIN)).toHaveLength(2);
	});

	it("appends a region to a note that has none, keeping the existing text", () => {
		const { text, ok } = writeManagedRegion("# Index\n", BODY);
		expect(ok).toBe(true);
		expect(text.startsWith("# Index\n")).toBe(true);
		expect(text).toContain(INDEX_BEGIN);
		expect(text).toContain(INDEX_END);
	});

	it("creates a region for an empty note without leading blank lines", () => {
		const { text, ok } = writeManagedRegion("", BODY);
		expect(ok).toBe(true);
		expect(text.startsWith(INDEX_BEGIN)).toBe(true);
	});

	// Half-deleted markers mean the region's boundary is unknown. Writing anyway could
	// swallow or duplicate curated content, so the caller is told to write nothing.
	it.each([
		["begin marker only", `# Index\n${INDEX_BEGIN}\nbody\n`],
		["end marker only", `# Index\nbody\n${INDEX_END}\n`],
		["end before begin", `${INDEX_END}\nbody\n${INDEX_BEGIN}\n`],
	])("refuses to write when markers are malformed: %s", (_label, input) => {
		const { text, ok } = writeManagedRegion(input, BODY);
		expect(ok).toBe(false);
		expect(text).toBe(input);
	});
});

describe("buildIndexBody", () => {
	it("sorts notes case-insensitively by name", () => {
		const body = buildIndexBody([
			{ basename: "zebra", sections: [], links: 0 },
			{ basename: "AI-Security", sections: ["Prompt Injection"], links: 2 },
			{ basename: "kubernetes", sections: [], links: 1 },
		]);
		const names = body
			.split("\n")
			.slice(2)
			.map((line) => line.split("|")[1].trim());
		expect(names).toEqual(["[[AI-Security]]", "[[kubernetes]]", "[[zebra]]"]);
	});

	it("renders sections and link counts", () => {
		expect(
			buildIndexBody([
				{ basename: "AI-Security", sections: ["Attacks", "Defences"], links: 7 },
			])
		).toContain("| [[AI-Security]] | Attacks, Defences | 7 |");
	});

	// An unescaped pipe from a section heading would shift the index table's columns.
	it("escapes pipes coming from section headings", () => {
		expect(
			buildIndexBody([{ basename: "N", sections: ["A | B"], links: 0 }])
		).toContain(String.raw`A \| B`);
	});

	it("marks a note with no sections rather than leaving the cell blank", () => {
		expect(
			buildIndexBody([{ basename: "N", sections: [], links: 0 }])
		).toContain("| [[N]] | — | 0 |");
	});

	it("reports an empty KB instead of rendering a headerless table", () => {
		expect(buildIndexBody([])).toBe("_No KB files found._");
	});
});
