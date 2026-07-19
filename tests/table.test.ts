import { describe, it, expect } from "vitest";
import {
	insertTableRow,
	buildSeparatorRow,
	formatTableRow,
	buildNewKBFile,
	getSections,
	countLinks,
} from "../src/vault";

const HEADER = "| Title | Link | Key Points |";

const NOTE = [
	"# System Design",
	"",
	"#architecture",
	"",
	"---",
	"",
	"## Scalability",
	"",
	HEADER,
	"|-------|------|-----------|",
	"| Existing row | [Link](https://example.com/a) | Notes |",
	"",
	"---",
	"",
	"## Caching",
	"",
	HEADER,
	"|-------|------|-----------|",
	"",
].join("\n");

const ROW = "| New | [Link](https://example.com/new) | Summary |";

describe("insertTableRow", () => {
	it("inserts directly under the separator of the named section", () => {
		const lines = insertTableRow(NOTE, "Caching", ROW, HEADER).split("\n");
		const separator = lines.lastIndexOf("|-------|------|-----------|");
		expect(lines[separator + 1]).toBe(ROW);
	});

	// The row must land in the section the model chose, not the first table in the file.
	it("does not touch a different section's table", () => {
		const result = insertTableRow(NOTE, "Caching", ROW, HEADER);
		const scalability = result.slice(
			result.indexOf("## Scalability"),
			result.indexOf("## Caching")
		);
		expect(scalability).not.toContain(ROW);
		expect(scalability).toContain("| Existing row |");
	});

	it("keeps existing rows in place when prepending to a populated table", () => {
		const result = insertTableRow(NOTE, "Scalability", ROW, HEADER);
		expect(result.indexOf(ROW)).toBeLessThan(result.indexOf("| Existing row |"));
		expect(result).toContain("| Existing row |");
	});

	it("preserves everything above the table byte for byte", () => {
		const result = insertTableRow(NOTE, "Caching", ROW, HEADER);
		const head = NOTE.slice(0, NOTE.indexOf("## Caching"));
		expect(result.startsWith(head)).toBe(true);
	});

	it("builds a table when the section has none", () => {
		const bare = "## Empty Section\n\nSome prose.\n";
		const result = insertTableRow(bare, "Empty Section", ROW, HEADER);
		expect(result).toContain(HEADER);
		expect(result).toContain(ROW);
		expect(result).toContain("Some prose.");
	});

	// Obsidian's formatter pads header cells to align the column rules. The padded header is
	// the same table, so the row belongs in it. Matching the marker literally missed it and
	// grew a second table beside the first, leaving the original permanently unreachable —
	// observed in a real vault, where one note ended up with two tables under one heading.
	it("inserts into a header Obsidian has reformatted with padding", () => {
		const padded = [
			"## Scalability",
			"",
			"| Title      | Link      | Key Points |",
			"| ---------- | --------- | ---------- |",
			"| Existing row | [Link](https://example.com/a) | Notes |",
			"",
		].join("\n");

		const result = insertTableRow(padded, "Scalability", ROW, HEADER);

		expect(result).not.toContain(HEADER);
		expect(result.split("| Title").length - 1).toBe(1);
		expect(result.indexOf(ROW)).toBeLessThan(
			result.indexOf("| Existing row |")
		);
	});

	// A section with no table of its own must get one, not borrow the next section's. The
	// header search used to run to end of file, so the row was filed under a heading the
	// model never chose.
	it("does not reach into a later section's table", () => {
		const note = [
			"## Prose Only",
			"",
			"No table here.",
			"",
			"## Has Table",
			"",
			HEADER,
			"|-------|------|-----------|",
			"| Existing row | [Link](https://example.com/a) | Notes |",
			"",
		].join("\n");

		const result = insertTableRow(note, "Prose Only", ROW, HEADER);

		const later = result.slice(result.indexOf("## Has Table"));
		expect(later).not.toContain(ROW);
		expect(result.indexOf(ROW)).toBeLessThan(
			result.indexOf("## Has Table")
		);
	});

	// The separator was hardcoded to three columns while buildSeparatorRow sat unused, so a
	// custom header marker produced a table Obsidian would not render.
	it("builds a separator matching a custom header's column count", () => {
		const five = "| Title | Link | Key Points | Date | Tags |";
		const result = insertTableRow(
			"## Empty\n",
			"Empty",
			ROW,
			five
		);
		expect(result).toContain(buildSeparatorRow(five));
		expect(result).not.toContain("|-------|------|-----------|");
	});
});

describe("buildSeparatorRow", () => {
	it("matches the column count of the default header", () => {
		expect(buildSeparatorRow(HEADER)).toBe("|------|------|------|");
	});

	// A customised header used to get a hardcoded 3-column separator, producing a broken table.
	it("matches the column count of a customised header", () => {
		expect(buildSeparatorRow("| Title | Link | Notes | Date | Tags |")).toBe(
			"|------|------|------|------|------|"
		);
	});
});

describe("formatTableRow", () => {
	// An unescaped pipe splits the cell and silently shifts every column after it.
	it("escapes pipes in the title and key points", () => {
		const row = formatTableRow("A | B", "https://example.com", "x | y");
		expect(row).toBe(String.raw`| A \| B | [Link](https://example.com) | x \| y |`);
	});

	it("flattens newlines so a row stays one line", () => {
		expect(formatTableRow("A\nB", "https://example.com", "c\nd")).not.toContain(
			"\n"
		);
	});

	// A bare ")" would close the markdown link early and break the URL.
	it("escapes a closing parenthesis in the URL", () => {
		expect(
			formatTableRow("T", "https://en.wikipedia.org/wiki/Rust_(language)", "k")
		).toContain("Rust_(language%29");
	});
});

describe("buildNewKBFile", () => {
	const context = {
		tags: ["space", "Launch Vehicles"],
		description: "Links on the commercial space industry.",
		section: "Launch Providers",
		indexFile: "Index",
		headerMarker: HEADER,
	};

	it("follows the structure of a hand-written note", () => {
		expect(buildNewKBFile("Space-Industry", context)).toBe(
			[
				"# Space Industry",
				"",
				"#space #launch-vehicles",
				"",
				"[[Index]] → Links on the commercial space industry.",
				"",
				"---",
				"",
				"## Launch Providers",
				"",
				HEADER,
				"|------|------|------|",
				"",
			].join("\n")
		);
	});

	it("uses the configured header marker and a matching separator", () => {
		const result = buildNewKBFile("Test-Note", {
			...context,
			headerMarker: "| Name | URL | Notes | Added |",
		});
		expect(result).toContain("| Name | URL | Notes | Added |");
		expect(result).toContain("|------|------|------|------|");
	});

	it("points the backlink at the configured index note", () => {
		const result = buildNewKBFile("Test-Note", {
			...context,
			indexFile: "Knowledge Base Index",
		});
		expect(result).toContain("[[Knowledge Base Index]] →");
	});

	// Models carry the note name's hyphenation into the heading; headings use spaces.
	it("rewrites a fully hyphenated section heading into words", () => {
		const result = buildNewKBFile("Space-Industry", {
			...context,
			section: "Company-Valuations-and-Market-Performance",
		});
		expect(result).toContain("## Company Valuations and Market Performance");
	});

	// "Multi-Cloud Reports" and "AI Red-Teaming" are real compounds, not hyphenated headings.
	it("leaves a genuine compound heading alone", () => {
		const result = buildNewKBFile("Cloud", {
			...context,
			section: "Multi-Cloud Reports",
		});
		expect(result).toContain("## Multi-Cloud Reports");
	});

	it("falls back to a default heading when none was supplied", () => {
		expect(buildNewKBFile("Cloud", { ...context, section: "" })).toContain(
			"## Overview"
		);
	});

	// A pipe in the heading would break the table rendered under it.
	it("strips pipes and leading hashes from the heading", () => {
		const result = buildNewKBFile("Cloud", {
			...context,
			section: "## Broken | Heading",
		});
		expect(result).toContain("## Broken  Heading");
	});

	it("drops the tag line entirely when there are no usable tags", () => {
		const result = buildNewKBFile("Cloud", { ...context, tags: ["", "  "] });
		expect(result).not.toContain("#\n");
		expect(result.split("\n")[2]).toBe("[[Index]] → Links on the commercial space industry.");
	});
});

describe("getSections", () => {
	it("lists H2 headings in document order and ignores other levels", () => {
		expect(getSections(NOTE)).toEqual(["Scalability", "Caching"]);
		expect(getSections("# Title\n### Deep\n")).toEqual([]);
	});
});

describe("countLinks", () => {
	it("counts data rows and skips headers and separators", () => {
		expect(countLinks(NOTE, HEADER)).toBe(1);
	});

	it("counts across multiple tables in one note", () => {
		const twice = insertTableRow(
			insertTableRow(NOTE, "Caching", ROW, HEADER),
			"Scalability",
			"| Another | [Link](https://example.com/b) | Notes |",
			HEADER
		);
		expect(countLinks(twice, HEADER)).toBe(3);
	});

	it("stops counting once the table ends", () => {
		const trailing = NOTE + "\n| not a table row |\n";
		expect(countLinks(trailing, HEADER)).toBe(1);
	});
});
