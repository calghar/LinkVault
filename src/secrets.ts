import { App } from "obsidian";

// Fixed id for the provider API key. Must be lowercase alphanumeric with optional dashes.
export const SECRET_ID = "linkvault-api-key";

// Returns the stored key, or null when unset. The store has no delete, so an empty
// string is treated as "unset" (see clearApiKey).
export function readApiKey(app: App): string | null {
	const value = app.secretStorage.getSecret(SECRET_ID);
	return value !== null && value.length > 0 ? value : null;
}

// Writes the key to the secret store. Throws if the store rejects the write.
export function writeApiKey(app: App, value: string): void {
	app.secretStorage.setSecret(SECRET_ID, value);
}

// Clears the key. The store exposes no delete, so an empty value stands in for "unset".
export function clearApiKey(app: App): void {
	app.secretStorage.setSecret(SECRET_ID, "");
}
