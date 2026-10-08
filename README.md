This project was created for a WhatsApp bot. Feel free to copy and experiment.

The quote renderer in `src/quote-api/` is a TypeScript port of Wildan Izzudin's [quote-generator](https://github.com/neoxr/quote-generator) (MIT, see its `LICENSE`).

## Usage

`POST /` with a quote JSON body returns `{ status, data: { image } }`, where `image` is the base64 PNG. A message's `media.url` may be a `data:` URL, so images can be sent inline instead of being hosted publicly.

- `pnpm dev`: run locally on port 8080 (Node 24+ runs the TypeScript directly)
- `pnpm check`: type check, format check and lint
- Deploy: Vercel detects the Express app in `src/index.ts`, no configuration needed
