# Hosted Guest Beta

Production: `https://digipiano.vercel.app/`

## Supported experience

The hosted guest beta targets current desktop Chrome and Edge. Web MIDI support and permission behaviour are browser-dependent; Firefox and Safari are not supported for MIDI practice. The app requires HTTPS when hosted. Local development and the portable build use `localhost` or `127.0.0.1`, which browsers treat as trustworthy local origins.

The learner selects MusicXML, XML, or MXL files through the browser. Parsing, rendering, playback, MIDI processing, scoring, learning plans, and current progress remain in that browser session. Phase 2 does not upload the selected file, its musical contents, MIDI messages, or attempt data.

Device preferences remain in browser local storage. Clearing site data removes those preferences. Permissions belong to the browser and deployment origin, so staging, production, local development, and the portable build each request MIDI independently.

## Environments

- Local: `VITE_APP_ENV=local`
- Staging: `VITE_APP_ENV=staging`
- Production: `VITE_APP_ENV=production`

Only variables prefixed with `VITE_` enter the client bundle. Never place secrets in a Vite environment variable. Operational reporting remains disabled until a vendor, data fields, retention period, consent basis, and deletion process are approved.

## Deployment checks

Run `npm run verify:deployment`. It must pass type checking, lint, all unit/component tests, and the production build.

After deploying staging, verify in desktop Chrome and Edge:

1. The response headers match `vercel.json`, especially CSP, Permissions Policy, frame denial, referrer policy, and content-type protection.
2. A local score opens and renders without a network upload.
3. MIDI permission, device selection, note input, audio unlock, normal Practice, Guided Practice, Foundations, and Sight Reading work.
4. Refresh preserves device preferences but not intentionally session-only plans/progress.
5. An offline/network interruption after page load does not interrupt already-loaded score practice.
6. An intentionally induced render failure shows the recovery screen without claiming that a local score was uploaded or saved.

Repeat the same smoke test against production before announcing the beta. Actual Vercel project creation, domain selection, and deployment are external state changes and require explicit authorization.
