# Landing page design

The user requested the warm, light editorial language of their Cursor style reference, Emil's design engineering guidance, and Rubik's ASCII treatment. This supersedes the first dark landing-page composition.

The installed `design-taste-frontend` skill dealt “The product performs” (seed 1238870284), keeping the supplied palette and typography direction. On this page, Flare's nineteen supported source combinations become a working command builder; an original ASCII flame carries the Flare identity. The artwork is drawn deterministically in code. No Rubik artwork, photographs, fake customer claims, or motion assets are copied.

The supplied reference takes precedence over the skill's generic restrictions on warm palettes and hairlines. The skill's photography and large motion quotas are unsuitable for this simple developer tool; the real interface and user-requested ASCII drawing provide the visual material. Motion stays limited to control feedback and the stack art, with reduced-motion support. Anchor navigation is immediate. Browser inspection uses the provided browser tool rather than launching another browser from the skill script.

| Before                                            | After                                                          | Why                                               |
| ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Oversized dark panels and heavy headings          | Parchment canvas, warm ink, weight-400 DM Sans                 | Follow the user's reference and improve hierarchy |
| Shared button classes were incompletely generated | UI stylesheet declares its Tailwind source directory           | Restore real padding and primitive styles         |
| Long repeated stack paragraph                     | Frontend plus runtime/database/auth facts and expandable tools | Keep the selected stack readable                  |
| Dense scrolling mobile table                      | Responsive rows with expandable stack details                  | Keep every combination usable on a phone          |
| Plain copy label                                  | Stable-width success feedback and an accessible status         | Confirm that copying completed                    |

All preset choices use the shared Base UI-backed shadcn Select. Fonts are self-hosted through the pinned Fontsource dependency. Colors, radii, typography, and stack-brand accents are CSS custom properties. Source/release availability continues to come from the shared catalog: three published v0.14.1 combinations and nineteen source combinations.

Initial render review found a wrapping mobile header, a hard-to-read repeated summary, and missing shared primitive padding. Those were corrected. The taste source check reports zero failures or warnings; React Doctor reports 100/100. Responsive browser measurements and final screenshots are recorded with implementation validation, not presented as deployment evidence.

## ASCII stack section

The eight-card section uses local SVG brand marks over original ASCII character fields. It presents TanStack, Cloudflare Workers, Effect, D1 + Drizzle, Better Auth, Base UI + Tailwind v4, WXT, and Neon permanently; the builder below remains responsible for preset variations. A dark showcase and each technology's brand accent draw on the supplied reference, while the rest of the landing page keeps the parchment palette. Hover and keyboard focus emphasize the matching brand color. This uses no scroll-linked motion or external image requests.

| Before                                         | After                                                  | Why                                                         |
| ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Stack information only appeared in the builder | Eight permanent branded technology cards               | Include the full set of tools shown across the presets      |
| Approximate ASCII logo silhouettes             | Actual local logos with brand colors and ASCII texture | Identify each technology accurately and match its identity  |
| Static labels without an interaction           | Brand-color hover and keyboard-focus feedback          | Make each tool recognizable and linked to its documentation |
| Continuous decoration without a control        | Pause/resume and reduced-motion fallback               | Let visitors control the animation                          |

On 16 October, the user explicitly changed the builder preference to shadcn Select. Use the shared Base UI-backed primitive for all preset controls; this supersedes earlier native-select notes. On 16 October, the user also requested official brand colors and marks, the WXT and Neon cards, and consistent casing. The ASCII texture remains decorative and original, with no dependence on Rubik runtime code or scrolling behavior. Database names in the preset table use their proper casing: None, D1, and Neon.

The bundled TanStack, Cloudflare, Effect, Drizzle, Better Auth, and Base UI marks come from Simple Icons; the Tailwind CSS, WXT, and Neon SVGs come from their official sites. The cards link to the official product or documentation sites. Neon keeps its published green mark; all SVG proportions are preserved.

Validation for the 16 October update: `bun check`, the site production build, React Doctor (100/100), and taste source lint (zero findings) pass. Browser inspection confirms eight locally loaded logos, the TanStack orange hover state, proper database casing, four desktop columns and one phone column, no horizontal overflow, and static reduced-motion art. The preset controls remain shared shadcn Select components.
