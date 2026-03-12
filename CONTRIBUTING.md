# Contributing to LinkVault

Development setup and contribution guidelines.

## Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/calghar/LinkVault.git
   cd LinkVault
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev build (watch mode):

   ```bash
   npm run dev
   ```

4. Symlink the plugin into your test vault:

   ```bash
   ln -s /path/to/LinkVault /path/to/your-vault/.obsidian/plugins/linkvault
   ```

5. In Obsidian, enable the plugin under **Settings → Community Plugins → LinkVault**.

6. Use **Ctrl/Cmd+Shift+I** to open the developer console for debugging.

## Project Structure

```sh
src/
├── main.ts         # Plugin entry point, registers commands
├── settings.ts     # Settings interface, defaults, and settings tab UI
├── llm.ts          # LLM provider abstraction (Anthropic, Ollama, OpenRouter)
├── processor.ts    # Core pipeline: extract → match file → match section → insert
└── vault.ts        # Vault helpers: find KB files, read sections, insert rows
```

## Code Style

- TypeScript with `strict: true`
- Tabs for indentation
- No external runtime dependencies — only `obsidian` module APIs
- All HTTP calls must use `requestUrl` from the `obsidian` module (never `fetch` or `axios`)
- Keep functions small and focused
- Use descriptive variable names

## Making Changes

1. **Fork** the repository and create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and ensure the project builds:

   ```bash
   npm run build
   ```

3. Test your changes in a real Obsidian vault with the plugin loaded.

4. **Commit** with a clear message describing what and why:

   ```bash
   git commit -m "Add support for custom table headers"
   ```

5. **Push** and open a pull request against `main`.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Describe what changed and why in the PR description
- Include testing steps so reviewers can verify
- If adding a new LLM provider, follow the existing `LLMProvider` interface pattern in `llm.ts`

## Reporting Bugs

Please use the [bug report template](https://github.com/calghar/LinkVault/issues/new?template=bug_report.md) and include:

- Obsidian version and OS
- Plugin version
- Steps to reproduce
- Expected vs actual behaviour
- Console errors (if any — open with Ctrl/Cmd+Shift+I)

## Feature Requests

Open an issue using the [feature request template](https://github.com/calghar/LinkVault/issues/new?template=feature_request.md). Describe the problem you're trying to solve, not just the solution you want.

## Tests

There are no automated tests yet. Test manually in an Obsidian vault with the plugin loaded. Enable debug mode for detailed console output.

## Releasing

1. Update `version` in `manifest.json` and `package.json`
2. Update `versions.json` with the new version mapping
3. Push a tag matching the version (e.g. `1.0.1` — no `v` prefix)
4. The GitHub Actions workflow builds and creates a release with `main.js`, `manifest.json`, and `styles.css` attached

See the [Obsidian plugin submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) for community store details.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
