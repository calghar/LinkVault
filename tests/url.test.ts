import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../src/vault";

// normalizeUrl decides whether a link is a duplicate. Too loose and distinct links are
// refused as already filed; too strict and the same link is filed twice.
describe("normalizeUrl", () => {
	it.each([
		["scheme case", "HTTPS://example.com/a", "https://example.com/a"],
		["host case", "https://EXAMPLE.com/a", "https://example.com/a"],
		["trailing slash", "https://example.com/a/", "https://example.com/a"],
		["surrounding space", "  https://example.com/a  ", "https://example.com/a"],
	])("ignores %s", (_label, input, expected) => {
		expect(normalizeUrl(input)).toBe(expected);
	});

	it("treats these as the same link", () => {
		expect(normalizeUrl("HTTPS://Example.com/Post/")).toBe(
			normalizeUrl("https://example.com/Post")
		);
	});

	// Path case is significant on most hosts, and query and fragment often select content.
	it.each([
		["path case", "https://example.com/Post", "https://example.com/post"],
		["query", "https://example.com/a?id=1", "https://example.com/a?id=2"],
		["fragment", "https://example.com/a#one", "https://example.com/a#two"],
		["scheme", "https://example.com/a", "http://example.com/a"],
		["subdomain", "https://www.example.com/a", "https://example.com/a"],
	])("keeps links differing by %s distinct", (_label, a, b) => {
		expect(normalizeUrl(a)).not.toBe(normalizeUrl(b));
	});

	it("returns empty for blank input, so a note without a URL is never a duplicate", () => {
		expect(normalizeUrl("")).toBe("");
		expect(normalizeUrl("   ")).toBe("");
	});

	it("falls back to trimmed lowercase text for an unparseable URL", () => {
		expect(normalizeUrl("Not A URL/")).toBe("not a url");
	});
});
