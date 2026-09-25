# Photo menu catalog

The two supplied Kathy's Diners / Kathy's Cafe photos are transcribed in `server/menu-catalog.cjs`: **120 products, 22 sections, 169 priced options**. Names follow the photos, including their original spellings. A dash means that size is not offered, never a zero price. Sizes are retained as printed: coffee frappe 18 oz, non-coffee frappe and cream cheese series 16 oz, soda pop and bingsu 18 oz.

One product owns its sizes/portions. For example, a cheesecake has Slice and Whole options, and a coffee has only its listed Hot/Cold sizes. Fries styles and flavors are described on the same product rather than generating duplicate cards. The grouped Coke/Coke Zero/Sprite/Royal entry remains one item as printed. Add-ons have their own clearly named sections; no ordering relationship is implied.

## Reuse and growth

Mobile-first filters (760px and below): one horizontally swipeable row, 44px touch targets, and a native section picker populated from the same catalog. The picker and buttons stay synchronized. Search/select fields use 16px text and 48px minimum heights. Checked at 320px and 390px widths without page overflow, including meal and pasta selection; desktop retains wrapped section buttons.

The member menu has data-generated section buttons matching the photos, starting with Fire Fighter's Meal. All 22 sections are directly selectable; adding a new section in the manager automatically adds its filter after reload. The member menu keeps section selection and search without redundant category/sort controls.

- `public/js/menu-card.js`: one safe DOM renderer shared by members and admins, including option selection and price updates.
- `public/js/menu-filter.js`: shared name/section search, category/section filtering and price sorting.
- `public/js/menu-options.js`: parses the admin option editor.
- `server/menu-validation.js`: validates products and unique options; derives the starting price from option prices.
- `server/menu-store.js`: reads deterministic database batches, avoiding the former 500-item cutoff. The UI renders 12 matches at a time.
- `public/menu-cards.css`: shared responsive card styles in the existing cream/red/indigo palette.

The current restaurant catalog is loaded into browser memory for fast filtering. For a very large multi-restaurant catalog, move filtering and pagination into the API; database batching is not a substitute for server-side search at that scale.

## Database setup / import

The connected project was updated with the new fields and the photo catalog. For a fresh project, run these SQL scripts in order:

1. `supabase/schema.sql` (initial profiles setup; existing script is not repeatable).
2. `supabase/admin-setup.sql` (menu table and permission policies).
3. `supabase/menu-catalog-setup.sql` (sections, options, import keys and uniqueness).
4. Run `node scripts/menu-import.cjs` locally, then paste its generated SQL into the Supabase SQL Editor.

The catalog setup is additive and repeatable. Unique import keys and a case-insensitive category/section/name index prevent repeated imports or duplicate admin entries. Conflicts are skipped rather than overwriting existing prices or availability. If existing duplicate rows prevent the index from being created, review them manually; the setup never deletes records automatically.

The source file is the original import snapshot. Supabase is the live editable catalog. To change current prices, use the admin manager; rerunning the import intentionally preserves edits. Reimporting after deleting an original source item restores that missing item; use Hidden for temporary unavailability.

## Editing

Sign in with the existing admin account, then open `/admin.html` → Menu manager. Choose a section and enter options as one `label | price` per line, for example `Slice | 145` and `Whole | 1088`. With options present, the starting price is calculated automatically. Leave options empty for a single regular price. Hidden products are excluded from the public menu by database policy. Reload an already-open member page to see changes.

Member cards support a mobile-first draft cart. Selected sizes become separate cart lines; repeat additions of the same product/size increase quantity (maximum 99). The bottom cart button shows item count and subtotal; the dialog supports quantity changes and removal. Prices are calculated in integer centavos. Cart logic is separate in `public/js/cart-state.js`, with its interface in `public/js/cart.js` and mobile-first styling in `public/cart.css`.

The cart now survives page navigation and refresh using this tab's session storage. Sign-out or successful demo checkout clears it. See [demo checkout](CHECKOUT.md) for COD, simulated online payment, address fields, and limitations. Checkout now saves demo orders through an authenticated server API with database-enforced prices. Admins can manage them in Orders; payments and delivery booking remain simulated.

## Verification and deployment

25 automated tests pass, including source counts, option validation, price changes, filtering and multi-batch loading. The live database import was run twice and stayed at 120 items. A rolled-back database check verified duplicate-name rejection and anonymous read-only access. Browser checks used the isolated loopback fixture (`node test/admin-preview.cjs`), including a 390px phone viewport and admin option editing; no real prices were changed during UI tests.

The existing Supabase advisories about signup-trigger execution permissions and disabled leaked-password protection are unrelated and remain unchanged. See [function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Commit and push the updated code to GitHub, then verify Render finishes deploying. Populating Supabase alone does not deploy the new card interface.
