import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: ["node_modules/**", "main.js", "esbuild.config.mjs"],
	},
	{
		files: ["src/**/*.ts"],
		plugins: { obsidianmd },
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			...obsidianmd.configs.recommended,
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					acronyms: ["KB", "API", "LLM", "URL", "AI", "OK"],
					brands: ["LinkVault", "Anthropic", "Claude", "Ollama", "OpenRouter"],
					allowAutoFix: true,
					ignoreRegex: ["^https?://"],
				},
			],
		},
	},
];
