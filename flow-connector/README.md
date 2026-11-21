# Cinemotion Studio — Google Flow Connector

This Chrome extension transfers a generated Cinemotion prompt and the image/video references used in that request into Google Flow's prompt composer. It **does not click Generate**; you review the prompt and generate manually.

## Install (Chrome / Edge)

1. Download this repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `flow-connector` folder.
5. Open Cinemotion Studio at `https://bhanuani.github.io/bhanu-ai-film-maker/`.
6. Generate a cinematic prompt from a request with optional reference images.
7. Click **Send to Flow**. Flow opens in a tab; open/select a project if needed. The prompt and references are inserted when its prompt composer is detected.
8. Switch Google accounts manually if needed, then click **Resend to Flow** on the same prompt.

## Notes / limitations

- The extension currently matches the GitHub Pages site URL and Google Flow at `https://labs.google/fx/tools/flow/`. If Cinemotion Studio is hosted on a different custom domain, add that exact host to the manifest's `host_permissions` and website `matches`.
- Reference transfer is limited to a total of 25 MB per handoff to avoid oversized Chrome messages.
- It sends image/video references selected in the original Cinemotion request; generated prompt-only requests send no files.
- Flow's UI may change. If the prompt composer or upload input cannot be detected, the extension reports a message and does not generate media.
- Google Flow is a web UI; this connector is unofficial and may need maintenance after UI changes.
