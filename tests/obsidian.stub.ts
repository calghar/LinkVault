// Stands in for the `obsidian` module, which only exists inside the app.
//
// Deliberately minimal: it exists so modules that import obsidian can be loaded, not so
// Obsidian can be simulated. Only pure functions are under test — anything that actually
// calls these would be testing this stub rather than the plugin.

export class TFile {
	basename = "";
	path = "";
}

export class TFolder {
	path = "";
	children: unknown[] = [];
}

export class Notice {
	constructor(public message: string, public timeout?: number) {}
}

export class App {
	secretStorage = {
		getSecret: (): string | null => "test-key",
		setSecret: (): void => undefined,
	};
}

// Never instantiated by a test — it exists so settings.ts can be imported for its defaults.
export class PluginSettingTab {
	constructor(
		public app: App,
		public plugin: unknown
	) {}
}

export interface RequestOptions {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	throw?: boolean;
}

export interface RequestResponse {
	status: number;
	json?: unknown;
	text?: string;
}

// ESM live binding: a test reassigns this via setRequestUrl and the provider modules see it.
export let requestUrl: (options: RequestOptions) => Promise<RequestResponse> =
	() => {
		throw new Error("requestUrl was called without a stub");
	};

export function setRequestUrl(
	fn: (options: RequestOptions) => Promise<RequestResponse>
): void {
	requestUrl = fn;
}

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
