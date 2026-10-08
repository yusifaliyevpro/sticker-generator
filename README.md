This project was created for a WhatsApp bot. Feel free to copy and experiment.

This repository is based on Wildan Izzudin's https://github.com/neoxr/quote-generator (vendored as TypeScript in `src/quote-api/`), with added font support for the Vercel environment. All credit goes to his repository.

## Usage

`POST /` with a quote JSON body returns `{ status, data: { image } }`, where `image` is the base64 PNG. A message's `media.url` may be a `data:` URL, so images can be sent inline instead of being hosted publicly.

- `pnpm dev`: run locally on port 8080 (Node 24+ runs the TypeScript directly)
- `pnpm check`: type check, format check and lint
- Deploy: Vercel detects the Express app in `src/index.ts`, no configuration needed
