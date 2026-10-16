# Landing page design

The user requested the warm, light editorial language of their Cursor style reference, Emil's design engineering guidance, and Rubik's ASCII treatment. This supersedes the first dark landing-page composition.

The installed `design-taste-frontend` skill dealt “The product performs” (seed 1238870284), keeping the supplied palette and typography direction. On this page, Flare's nineteen supported source combinations become a working command builder; an original ASCII flame carries the Flare identity. The artwork is drawn deterministically in code. No Rubik artwork, photographs, fake customer claims, or motion assets are copied.

The supplied reference takes precedence over the skill's generic restrictions on warm palettes and hairlines. The skill's photography and large motion quotas are unsuitable for this simple developer tool; the real interface and user-requested ASCII drawing provide the visual material. Motion stays limited to control feedback and optional smooth anchor scrolling, with reduced-motion support. Browser inspection uses the provided browser tool rather than launching another browser from the skill script.

| Before                                            | After                                                          | Why                                               |
| ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Oversized dark panels and heavy headings          | Parchment canvas, warm ink, weight-400 DM Sans                 | Follow the user's reference and improve hierarchy |
| Shared button classes were incompletely generated | UI stylesheet declares its Tailwind source directory           | Restore real padding and primitive styles         |
| Long repeated stack paragraph                     | Frontend plus runtime/database/auth facts and expandable tools | Keep the selected stack readable                  |
| Dense scrolling mobile table                      | Responsive rows with expandable stack details                  | Keep every combination usable on a phone          |
| Plain copy label                                  | Stable-width success feedback and an accessible status         | Confirm that copying completed                    |

All preset selects remain native HTML controls. Fonts are self-hosted through the pinned Fontsource dependency. Colors, radii, and typography are CSS custom properties. Source/release availability continues to come from the shared catalog: three published v0.14.1 combinations and nineteen source combinations.

Initial render review found a wrapping mobile header, a hard-to-read repeated summary, and missing shared primitive padding. Those were corrected. The taste source check reports zero failures or warnings; React Doctor reports 100/100. Responsive browser measurements and final screenshots are recorded with implementation validation, not presented as deployment evidence.

## ASCII stack section

The approved six-card section uses original negative-space ASCII drawings inspired by Rubik's character-texture treatment. It presents TanStack, Workers, Effect, D1 + Drizzle, Better Auth, and Base UI + Tailwind permanently; the builder below remains responsible for preset variations. This replaces the earlier design note's optional smooth scrolling with instant anchor navigation.

| Before                                         | After                                            | Why                                                            |
| ---------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Stack information only appeared in the builder | Six permanent illustrated technology cards       | Show the core tools before choosing a preset                   |
| Smooth anchor scrolling                        | Instant anchor navigation; fixed responsive grid | Respect the request for no scrolling effects                   |
| Static ASCII identity only in the hero         | Subtle character shimmer inside the stack art    | Extend the requested ASCII treatment without moving the layout |
| Continuous decoration without a control        | Pause/resume and reduced-motion fallback         | Let visitors control the animation                             |

On 16 October, the user explicitly changed the builder preference to shadcn Select. Use the shared Base UI-backed primitive for all preset controls; this supersedes earlier native-select notes. The new stack artwork remains decorative and original, with no dependence on Rubik runtime code or scrolling behavior.

Validation for the 16 October update: `bun check`, the site production build, React Doctor (100/100), and taste source lint (zero findings) pass. Browser checks confirm six cards, 3/2/1 columns at 1440/768/390, no horizontal overflow, static reduced-motion artwork, pause/resume, and instant anchor scrolling. The shadcn controls select Router/source/database values correctly; keyboard Home/Enter and Escape focus restoration work; selecting no database disables auth and preserves its described hint. Copy success feedback appears, but the browser tool's isolated clipboard read returned empty, so this pass does not claim OS clipboard readback. The shared Select and generator mirror have identical bytes.
