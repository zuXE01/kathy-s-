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

The shared card displays photos for public browsing and staff catalog management, preserving existing ordering controls and permissions. Images lazy-load, retain full framing, and hide if unavailable. Test coverage verifies matches, asset signatures/size, responsive sources and fallback. This is a local asset/code change, not a Render deployment.
