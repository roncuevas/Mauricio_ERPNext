# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de tienda que atiende caja y administración, además de dueños o administradores que gestionan ERPNext.

## Product Purpose

Mauricio ERPNext lets store staff and ERPNext administrators manage products, pricing, suppliers, inventory, point-of-sale operations, sales orders, and quotations from a browser. Success means completing those tasks against the user's configured ERPNext instance.

## Positioning

Connects directly to ERPNext over REST, without an app-owned backend. Connection credentials and profile-scoped caches stay in the browser.

## Operating Context

- Users configure an ERPNext base URL, API key, API secret, and local passphrase in a browser connection profile.
- The ERPNext instance must allow CORS from the app's origin. HTTPS is required except for localhost development.
- Catalog and other data caches are profile-scoped and refreshed explicitly; navigating between views does not trigger a catalog download.
- The interface supports Spanish and English.

## Capabilities and Constraints

- Manages Item products, variants and their `variant_of` hierarchy, units of measure and conversions, prices, suppliers, stock and reconciliation, POS sales and shifts, sales orders, quotations, and DocTypes.
- Supports multiple connection profiles. Credentials are encrypted with Web Crypto before local storage; a temporary local session survives page refreshes.
- Stores local catalogs in IndexedDB per connection profile. Queries are also profile-scoped so data from separate ERPNext connections does not mix.
- Reads UOM conversion details from `UOM Conversion Detail`, with an Item-document fallback when access to that child DocType is denied.
- Is a client-only React/Vite SPA with direct ERPNext REST access and no app backend.
- Production connections require HTTPS; HTTP is limited to localhost. ERPNext CORS configuration is the instance owner's responsibility.
- Credentials must remain encrypted in browser-local storage, caches must remain isolated by connection profile, and the interface must continue to support Spanish and English.

## Evidence on Hand

- `README.md` documents product scope, routes, local storage and cache behavior, development, and deployment.
- `src/App.tsx`, `src/pages/`, and `src/lib/` contain the routes, operational screens, and ERPNext client/cache logic.
- `public/mauricio-logo.png`, `public/mauricio-logo-cropped.png`, and app icons are present. Their binding brand requirements have not been confirmed.
- README identifies the project license as CC BY-NC-SA 4.0.

## Product Principles

- Connect to the user's ERPNext instance directly.
- Keep credentials and working data in browser-local storage.
- Keep cached data isolated by connection profile.
- Make data refreshes explicit and preserve useful local data when a sync cannot complete.
- Support Spanish and English.
