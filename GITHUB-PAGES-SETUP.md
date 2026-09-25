# Hafiz Mart — GitHub Pages Production Setup

## 1. Create the repository

Create a GitHub repository and upload the contents of this project (not the outer ZIP folder).
Use the `main` branch.

## 2. Add GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions → New repository secret.

Create exactly these three secrets:

- `VITE_SUPABASE_URL` — your Supabase Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — your Supabase browser-safe publishable/anon key
- `VITE_WHATSAPP_NUMBER` — `923133420712`

Never add a Supabase service-role/secret key to GitHub Actions secrets for this frontend build.

## 3. Enable Pages

Repository → Settings → Pages → Source: **GitHub Actions**.

Push to `main`. The workflow `.github/workflows/deploy.yml` will build and deploy the `dist` folder.

## 4. Important routing choice

This release uses `HashRouter`. GitHub Pages does not need a custom 404 rewrite for routes such as:

`/#/shop`

`/#/product/<id>`

`/#/admin`

The same build can later be moved to a custom domain.

## 5. Supabase Auth URL configuration

In Supabase → Authentication → URL Configuration:

- Set the production Site URL to the exact GitHub Pages URL after the first deployment.
- Add the production GitHub Pages URL to Redirect URLs if your authentication flow requires it.
- When you later add a custom domain, add that domain as well.

## 6. Before launch

Test all of these on the deployed URL:

- customer registration/login/logout
- admin login and admin-only pages
- product/category CRUD
- product image upload
- search/filter/sort
- cart and stock handling
- coupon validation
- checkout/order creation
- WhatsApp order message
- customer order history
- review submission/moderation
- sale banner expiry

## 7. Custom domain later

When a domain is purchased, configure the domain in GitHub Pages and update Supabase Auth URL/Redirect URL settings to the new HTTPS domain.
No domain is required for the current deployment.
