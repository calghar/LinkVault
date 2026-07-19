import { describe, it, expect } from "vitest";
import { normalizeNoteName, validateNewName } from "../src/vault";

const EXISTING = ["AI-Security", "Kubernetes-Containers", "Personal-Finance"];

describe("normalizeNoteName", () => {
	it.each([
		["productivity technology culture", "Productivity-Technology-Culture"],
		["hand-tool-joinery-techniques", "Hand-Tool-Joinery-Techniques"],
		["  spaced   out  ", "Spaced-Out"],
		["MIXED case WORDS", "MIXED-Case-WORDS"],
	])("normalises %j to %j", (input, expected) => {
		expect(normalizeNoteName(input)).toBe(expected);
	});

	// Lowercasing these would turn AI-Security into Ai-Security and rename real notes.
	it.each(["AI-Security", "eBPF-Internals", "CodeQL-Queries"])(
		"leaves the acronym in %s intact",
		(name) => {
			expect(normalizeNoteName(name)).toBe(name);
		}
	);

	// Names are normalised on every route into the KB, so a second pass must not drift.
	it.each([...EXISTING, "eBPF-Internals", "hand tool joinery"])(
		"is idempotent for %s",
		(name) => {
			const once = normalizeNoteName(name);
			expect(normalizeNoteName(once)).toBe(once);
		}
	);
});

describe("validateNewName", () => {
	it("accepts a real topic and returns its canonical form", () => {
		expect(validateNewName("space industry", EXISTING)).toEqual({
			ok: true,
			name: "Space-Industry",
		});
	});

	// A shipped default prompt ended with the literal `NEW: Descriptive-Theme-Name`, and
	// small models copied it verbatim — creating a note actually named that. Users who
	// customised that prompt still carry the literal, so it must stay rejected.
	it.each([
		"Descriptive-Theme-Name",
		"descriptive theme name",
		"Short-Note-Name-Describing-The-Topic-This-Link-Belongs-To",
		"topic name",
		"New-Note",
	])("rejects the placeholder %j", (name) => {
		expect(validateNewName(name, EXISTING).ok).toBe(false);
	});

	it.each([
		["", "empty"],
		["   ", "whitespace only"],
		["Security/Notes", "path separator"],
		["C:-Drive", "colon"],
		["..-Escape", "leading dot"],
		["A".repeat(61), "over the length limit"],
	])("rejects %j (%s)", (name) => {
		expect(validateNewName(name, EXISTING).ok).toBe(false);
	});

	it("accepts a name exactly at the length limit", () => {
		expect(validateNewName("A".repeat(60), EXISTING).ok).toBe(true);
	});

	// Otherwise a differently-cased name creates a second note holding the same subject.
	it("returns the existing note when the name collides case-insensitively", () => {
		expect(validateNewName("ai-security", EXISTING)).toEqual({
			ok: true,
			name: "AI-Security",
		});
	});
});
