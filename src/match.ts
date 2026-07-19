// Parsing of the model's match replies.
//
// The reply *form* is the confidence signal — there is no separate score. Small local
// models are unreliable at self-scoring, so the prompt asks for one of three shapes and
// anything else is treated as not confident:
//
//   MATCH: <name>   picked from the candidate list
//   NEW: <name>     no candidate fits; proposes a new file
//   NONE            no candidate fits and nothing is proposed

export type MatchReply =
	| { kind: "match"; name: string }
	| { kind: "new"; name: string }
	| { kind: "none" };

function findCandidate(value: string, candidates: string[]): string | null {
	const lowered = value.toLowerCase();
	return candidates.find((c) => c.toLowerCase() === lowered) ?? null;
}

// Resolves a raw model reply against the candidate list.
//
// Replies that carry no recognised form fall back to an exact (case-insensitive) match
// against a candidate. That path exists for users whose customised prompts predate this
// contract and still ask for a bare name — without it they would be gated on every link.
// It is deliberately exact-only: a reply that merely *contains* a candidate name is the
// same guess that used to misroute links, so it resolves to "none" instead.
export function parseMatchReply(
	raw: string,
	candidates: string[]
): MatchReply {
	const line = raw.trim().split("\n")[0]?.trim() ?? "";
	if (line.length === 0) return { kind: "none" };

	const upper = line.toUpperCase();

	if (upper.startsWith("MATCH:")) {
		const found = findCandidate(line.slice(6).trim(), candidates);
		return found ? { kind: "match", name: found } : { kind: "none" };
	}

	if (upper.startsWith("NEW:")) {
		const name = line.slice(4).trim();
		return name.length > 0 ? { kind: "new", name } : { kind: "none" };
	}

	if (upper === "NONE") return { kind: "none" };

	const bare = findCandidate(line, candidates);
	return bare ? { kind: "match", name: bare } : { kind: "none" };
}
