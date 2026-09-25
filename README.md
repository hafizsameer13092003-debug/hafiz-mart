# Hafiz Mart — Phase 7

Phase 7 builds on the working Phase 6 project and focuses on customer experience without adding dummy store data.

## Included

- Advanced shop search and filters
  - search by product, brand and SKU
  - category filter
  - min/max price
  - sale-only
  - in-stock-only
  - sorting by newest, name and price
- Product detail gallery with thumbnails
- Stock-aware add-to-cart quantity handling
- Customer reviews and 1–5 star ratings
- Review moderation in Admin → Reviews
- Customer account profile editing
- Customer order history
- Improved mobile-friendly filter/review/account UI
- Existing coupons, banners, orders, WhatsApp ordering and Supabase storage remain in place

## Supabase setup

Run this file once in Supabase SQL Editor:

`supabase/phase7-customer-experience.sql`

It adds the review fields/policies and customer profile update policy. It does not insert fake products, orders, customers or reviews.

## Run locally

Keep your existing `.env` values. Do not put a Supabase service-role/secret key in the frontend.

```powershell
npm.cmd install
npm.cmd run dev
```

## Review flow

1. Customer logs in.
2. Opens a product.
3. Submits a 1–5 star review.
4. Review starts as `pending`.
5. Admin → Reviews → Approve.
6. Approved review becomes visible publicly.

Only approved reviews are public. Customers can submit their own reviews; admins can moderate them.

## Important

The project package was prepared from the working Phase 6 source. A local dependency install/build could not be completed in the build environment because the npm dependency fetch timed out, so run `npm.cmd install` and `npm.cmd run dev` in your local project as the verification step.

## Phase 8 — GitHub Pages deployment

This release is deployment-ready for GitHub Pages.

- Uses `HashRouter` so GitHub Pages routes work without a server-side rewrite.
- Uses relative Vite asset paths.
- Includes `.github/workflows/deploy.yml` for automatic deployment from `main`.
- Configure the three GitHub Actions secrets documented in `GITHUB-PAGES-SETUP.md`.
- Keep Supabase service-role/secret keys out of the frontend and repository.
