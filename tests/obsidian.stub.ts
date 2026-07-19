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

export class App {}

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
