# Repository Guidelines

## Project Structure & Module Organization

This repository is a client-only React/Vite SPA for connecting directly to user-configured ERPNext instances.

- `src/App.tsx`: routing, connection flow, product workspace, and DocType screens.
- `src/components/`: shared Tailwind-based UI primitives.
- `src/lib/`: ERPNext REST client, local encrypted storage, cryptography, and shared types.
- `src/lib/*.test.ts`: unit tests.
- `src/styles.css`: global styles and shared utility component classes.
- `index.html`, `vite.config.ts`, and `tsconfig*.json`: application and build configuration.

Keep ERPNext API logic in `src/lib/erpnext.ts`; do not call `fetch` directly from page components. Keep reusable visual behavior in `src/components/` instead of duplicating Tailwind class groups.

## Build, Test, and Development Commands

```bash
npm install       # Install dependencies
npm run dev       # Start the local Vite server
npm run build     # Type-check and create the production bundle
npm test          # Run the Vitest suite once
npm run test:watch # Run Vitest interactively
```

The production build is the required type-check because `tsc -b` runs before Vite. ERPNext integration tests require a real instance and credentials; never commit those credentials.

## Coding Style & Naming Conventions

Use TypeScript with strict mode, two-space indentation, single quotes, and semicolon-free statements, matching the existing code. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive query keys such as `['items', search, page]`. Keep user-facing text in Spanish unless the surrounding feature establishes another language.

## Testing Guidelines

Use Vitest for unit tests. Name files `*.test.ts` or `*.test.tsx` and test observable behavior, especially encryption, URL validation, request construction, and error handling. Run `npm run build` and `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Use atomic Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, or `chore:` followed by an imperative description, for example `feat: add DocType metadata editor`. Pull requests should describe behavior changes, include validation commands, call out ERPNext/CORS assumptions, and include screenshots for meaningful UI changes. Never include API keys, secrets, or real ERPNext data.

## Security & Configuration

Credentials must remain browser-local and encrypted with Web Crypto. Do not log authorization headers, persist decrypted credentials, add a default ERPNext URL, or place secrets in environment files or the bundle. Production connections must use HTTPS; CORS is configured on each user’s ERPNext instance.
