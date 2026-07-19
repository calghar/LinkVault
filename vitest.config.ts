import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		// `obsidian` resolves to a types-only package outside the app, so importing a module
		// that pulls it in would fail at runtime. Point it at a stub instead.
		alias: {
			obsidian: fileURLToPath(
				new URL("./tests/obsidian.stub.ts", import.meta.url)
			),
		},
	},
	test: {
		include: ["tests/**/*.test.ts"],
	},
});
