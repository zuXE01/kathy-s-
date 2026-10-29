# Menu photos

Imported 2026-10-18 from the user-supplied Google Drive folder `1VBG5ihpM_RWGi_0PsB-5BHI3vxAviP3F`. Original Drive files/sharing remain unchanged.

13 named photos map to 10 existing products. Originals were converted to 400px and 800px-wide WebP assets in `public/assets/menu`, with orientation applied and EXIF metadata excluded. The browser uses local files, not expiring or authenticated Drive URLs. No database migration is required.

| Drive photo name | Website section / product | Views |
| --- | --- | --- |
| ube creamcheese | Cream Cheese Series / Ube Cream Cheese | 1 |
| red velvet cream cheese | Cream Cheese Series / Red Velvet Cream Cheese | 1 |
| meaty pizza | Pizza Thin Crust / Meaty | 1 |
| biscoff cookie; biscoff cookies | Desserts / Biscoff Cookie | 2 |
| walnut cookie; walnut cookies | Desserts / Chocolate Chip Walnut | 2 |
| cookies and cream cookie (two files) | Desserts / Cookies and Cream | 2 |
| double chocolate | Desserts / Double Chocolate Chip | 1 |
| chocolate oat cookies | Desserts / Chocolate Chip Oat | 1 |
| kiwi soda | Soda Pop / Kiwi | 1 |
| passion fruit soda | Soda Pop / Passion Fruit | 1 |

Mappings are explicit in `public/js/menu-card.js`, keyed by both section and product name. Related waffles, cheesecakes and frappes never receive cookie photos merely because flavors match. Extra views appear under More photos on the same product card; no duplicated products or prices. Renaming a product or section requires updating the mapping.

Camera-named files (`20261017_*.jpg`, `Copy of IMG_*.HEIC/heic`) remain unassigned because their names do not identify menu products. Rename them to the intended section/product or supply a mapping before assigning them. No visual flavor guessing was used to assign them.

The shared card displays photos for public browsing and staff catalog management, preserving existing ordering controls and permissions. Images lazy-load and hide if unavailable. Photos fill uniform 4:3 frames using cover (not stretching), with per-photo focal positions in menu-cards.css to emphasize the products. This crops presentation only; the complete optimized files remain intact. Test coverage verifies matches, asset signatures/size, responsive sources, focal attributes, framing CSS and fallback. This is a local asset/code change, not a Render deployment.

## Supplemental menu coverage — 2026-10-29

All 120 catalog products now resolve to local photos. The original 10 product mappings (13 photos) retain priority and their image files were preserved byte for byte. Explicit supplemental mappings cover the other 110 products, using 48 licensed web sources and three matching existing project JPG derivatives. Related products can share a family reference; these are illustrative images, not a claim about actual restaurant servings. Each supplemental card links a visible reference-photo disclosure to `/menu-photo-credits.html`, with source, author and license information.

The source manifest and non-overwriting importer live in `scripts/menu-reference-sources.json` and `scripts/import-menu-reference-photos.cjs`. Supply Sharp through the installed module or MENU_SHARP_PATH when reimporting. Replace a reference mapping with a verified restaurant photo when one becomes available. Existing photos, prices, cart behavior and permissions are unchanged. Responsive WebP variants are lazy loaded.

Validation: 171 tests pass. Local fixture browser checks at 320, 390 and 1280 pixels show all 120 cards, 123 decoded photos, 110 reference disclosures and no horizontal page overflow. This is a local change, not a deployment.
