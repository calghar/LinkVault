# Troubleshooting

| Message | Fix |
| --- | --- |
| "No KB files found" | Check that **KB folder** matches the actual folder name in your vault |
| "Active file is not in the Inbox folder" | Open a note inside the configured Inbox folder |
| "Cannot reach Ollama at ..." | Run `ollama serve` and check the **Ollama host** setting |
| "API key is not configured" | Enter your API key in **Settings → LinkVault** |
| "Rate limited" | The plugin retries automatically — wait a moment and try again |
| "Already filed in ..." | The URL is already in that note. One URL lives in one note; file it elsewhere by hand |
| "Could not name a note for ..." | The naming step produced nothing usable. The link stays in your Inbox — retry, or create the note yourself |
| "No clear section in ... — filed under ..." | The note was chosen confidently but no section fit. Move the row if it landed wrong |
| "Index markers are malformed" | The managed region's markers are broken. Restore both, in order, then rebuild |
| Wrong file or section matched | Enable **Debug mode** to see raw AI responses in the console (Ctrl/Cmd+Shift+I) |

## Nothing happens when running the command

If neither LinkVault command appears in the command palette, the plugin failed to load.
Open the developer console (Ctrl/Cmd+Shift+I) and look for `[LinkVault]` errors.

## Links keep landing in the wrong note

Enable **Debug mode** and check the raw file-match reply. A model that will not follow the
`MATCH:` / `NEW:` / `NONE` contract is treated as declining every time, which shows up as
new notes being created rather than existing ones being matched. Smaller local models vary a
lot here — an instruct-tuned model follows the contract far more reliably than a base one.
