import { requestUrl } from "obsidian";
import type { LinkVaultSettings } from "./settings";

export type LLMErrorCode =
	| "auth_failed"
	| "rate_limited"
	| "network_error"
	| "server_error"
	| "model_not_found"
	| "context_limit";

export class LLMError extends Error {
	code: LLMErrorCode;
	retryable: boolean;

	constructor(message: string, code: LLMErrorCode, retryable = false) {
		super(message);
		this.name = "LLMError";
		this.code = code;
		this.retryable = retryable;
	}
}

export interface LLMProvider {
	ask(prompt: string): Promise<string>;
	testConnection(): Promise<boolean>;
}

function parseErrorResponse(status: number, body: string): LLMError {
	if (status === 401 || status === 403) {
		return new LLMError(
			`Authentication failed (${status}): ${body}`,
			"auth_failed"
		);
	}
	if (status === 429) {
		return new LLMError(
			"Rate limited. Please wait and try again.",
			"rate_limited",
			true
		);
	}
	if (status === 404) {
		return new LLMError(
			`Model not found: ${body}`,
			"model_not_found"
		);
	}
	if (status >= 500) {
		return new LLMError(
			`Server error (${status}): ${body}`,
			"server_error",
			true
		);
	}
	if (body.toLowerCase().includes("context length") ||
		body.toLowerCase().includes("too many tokens")) {
		return new LLMError(
			"Input exceeds model context limit.",
			"context_limit"
		);
	}
	return new LLMError(
		`Request failed (${status}): ${body}`,
		"server_error"
	);
}

function classifyError(err: unknown): LLMError {
	if (err instanceof LLMError) return err;
	const msg = err instanceof Error ? err.message : String(err);
	if (
		msg.includes("ECONNREFUSED") ||
		msg.includes("Failed to fetch") ||
		msg.includes("net::")
	) {
		return new LLMError(
			`Network error: ${msg}`,
			"network_error",
			true
		);
	}
	return new LLMError(msg, "server_error");
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
	const MAX_RETRIES = 3;
	const BASE_DELAY = 1000;
	let lastError: LLMError | undefined;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = classifyError(err);
			if (!lastError.retryable || attempt === MAX_RETRIES) {
				throw lastError;
			}
			const delay =
				BASE_DELAY * Math.pow(2, attempt) +
				Math.random() * 500;
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError ?? new LLMError("Unknown error after retries", "server_error");
}

class AnthropicProvider implements LLMProvider {
	constructor(private readonly settings: LinkVaultSettings) {}

	private get baseUrl(): string {
		return (
			this.settings.customBaseUrl?.replace(/\/+$/, "") ||
			"https://api.anthropic.com"
		);
	}

	async ask(prompt: string): Promise<string> {
		if (!this.settings.apiKey) {
			throw new LLMError(
				"Anthropic API key is not configured.",
				"auth_failed"
			);
		}
		return withRetry(async () => {
			let response;
			try {
				response = await requestUrl({
					url: `${this.baseUrl}/v1/messages`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": this.settings.apiKey,
						"anthropic-version": "2023-06-01",
					},
					body: JSON.stringify({
						model: this.settings.model,
						max_tokens: this.settings.maxTokens,
						messages: [{ role: "user", content: prompt }],
					}),
					throw: false,
				});
			} catch (err) {
				throw classifyError(err);
			}
			if (response.status !== 200) {
				throw parseErrorResponse(
					response.status,
					JSON.stringify(response.json ?? response.text)
				);
			}
			const text = response.json?.content?.[0]?.text;
			if (typeof text !== "string") {
				throw new LLMError("Unexpected Anthropic response format.", "server_error");
			}
			return text;
		});
	}

	async testConnection(): Promise<boolean> {
		if (!this.settings.apiKey) {
			throw new LLMError(
				"Anthropic API key is not configured.",
				"auth_failed"
			);
		}
		let response;
		try {
			response = await requestUrl({
				url: `${this.baseUrl}/v1/messages`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.settings.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.settings.model,
					max_tokens: 1,
					messages: [{ role: "user", content: "Hi" }],
				}),
				throw: false,
			});
		} catch (err) {
			throw classifyError(err);
		}
		if (response.status !== 200) {
			throw parseErrorResponse(
				response.status,
				JSON.stringify(response.json ?? response.text)
			);
		}
		return true;
	}
}

class OllamaProvider implements LLMProvider {
	constructor(private readonly settings: LinkVaultSettings) {}

	private get host(): string {
		return this.settings.ollamaHost.replace(/\/+$/, "");
	}

	async ask(prompt: string): Promise<string> {
		return withRetry(async () => {
			let response;
			try {
				response = await requestUrl({
					url: `${this.host}/api/generate`,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: this.settings.model,
						prompt: prompt,
						stream: false,
					}),
					throw: false,
				});
			} catch (err) {
				throw classifyError(err);
			}
			if (response.status !== 200) {
				throw parseErrorResponse(
					response.status,
					JSON.stringify(response.json ?? response.text)
				);
			}
			const text = response.json?.response;
			if (typeof text !== "string") {
				throw new LLMError("Unexpected Ollama response format.", "server_error");
			}
			return text;
		});
	}

	async testConnection(): Promise<boolean> {
		let response;
		try {
			response = await requestUrl({
				url: `${this.host}/api/tags`,
				method: "GET",
				throw: false,
			});
		} catch (err) {
			throw classifyError(err);
		}
		if (response.status !== 200) {
			throw parseErrorResponse(
				response.status,
				JSON.stringify(response.json ?? response.text)
			);
		}
		return true;
	}
}

class OpenRouterProvider implements LLMProvider {
	constructor(private readonly settings: LinkVaultSettings) {}

	private get baseUrl(): string {
		return (
			this.settings.customBaseUrl?.replace(/\/+$/, "") ||
			"https://openrouter.ai/api/v1"
		);
	}

	async ask(prompt: string): Promise<string> {
		if (!this.settings.apiKey) {
			throw new LLMError(
				"OpenRouter API key is not configured.",
				"auth_failed"
			);
		}
		return withRetry(async () => {
			let response;
			try {
				response = await requestUrl({
					url: `${this.baseUrl}/chat/completions`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.settings.apiKey}`,
					},
					body: JSON.stringify({
						model: this.settings.model,
						max_tokens: this.settings.maxTokens,
						messages: [
							{ role: "user", content: prompt },
						],
					}),
					throw: false,
				});
			} catch (err) {
				throw classifyError(err);
			}
			if (response.status !== 200) {
				throw parseErrorResponse(
					response.status,
					JSON.stringify(response.json ?? response.text)
				);
			}
			const text = response.json?.choices?.[0]?.message?.content;
			if (typeof text !== "string") {
				throw new LLMError("Unexpected OpenRouter response format.", "server_error");
			}
			return text;
		});
	}

	async testConnection(): Promise<boolean> {
		if (!this.settings.apiKey) {
			throw new LLMError(
				"OpenRouter API key is not configured.",
				"auth_failed"
			);
		}
		let response;
		try {
			response = await requestUrl({
				url: `${this.baseUrl}/chat/completions`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.settings.apiKey}`,
				},
				body: JSON.stringify({
					model: this.settings.model,
					max_tokens: 1,
					messages: [{ role: "user", content: "Hi" }],
				}),
				throw: false,
			});
		} catch (err) {
			throw classifyError(err);
		}
		if (response.status !== 200) {
			throw parseErrorResponse(
				response.status,
				JSON.stringify(response.json ?? response.text)
			);
		}
		return true;
	}
}

export function createProvider(settings: LinkVaultSettings): LLMProvider {
	switch (settings.provider) {
		case "anthropic":
			return new AnthropicProvider(settings);
		case "ollama":
			return new OllamaProvider(settings);
		case "openrouter":
			return new OpenRouterProvider(settings);
		default: {
			const _exhaustive: never = settings.provider;
			throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
		}
	}
}
