# Whodunnit: Grand Venues with Dormant Rooms

Status: design note, pinned. Nothing here is implemented. Written 2026-09-03 after the
side-room work, so the next person can start from the coupling as it actually stands.

## The idea

A venue should be built grand: every room its setting would really have, named and sized
for that setting. A case then uses only some of them. The rooms a case does not use are
still there on the map, named and doored, but dormant: not visitable, not enterable, not
part of any route. A quick case on the same ship uses fewer rooms than a grand one, and
the ship stays the same ship.

Alongside that, the default room templates become available to every venue through a
per-setting redefinition. The estate's Foyer is the ship's Gangway Lobby; the estate's
Ballroom is the ship's Grand Salon on the upper deck. Same template, same footprint,
different vocabulary.

## How it is coupled today

These are the facts that make this more than a rendering change. All verified in source.

- **One list.** `createMysteryVenueProposalV1` (`packages/shared/src/mysteryVenue.ts`)
  builds exactly `length.rooms` rooms. The passenger ship uses `passengerCruiseRoomPlan`,
  which picks from a program of about sixteen rooms; every other archetype uses
  `expandedRooms`, which repeats the seed's rooms with numerals once the count exceeds the
  seed. Case length presets in `normalizeMysteryVenueLengthV1`: quick 5 rooms / 4 suspects /
  1 tier, standard 10 / 6 / 2, grand 15 / 8 / 3, custom 5 to 18.
- **The case takes all of them.** `freezeDebateMysteryMansionSnapshotV2`
  (`apps/api/src/debate-mystery-mansion-bundles.ts`) projects the bundle's rooms into the
  V1 room list the compiler reads. `compileDeterministicDebateMystery` scaffolds every one
  of them; `state.rooms` is that scaffold. Gating (`caseGatedRoomIds`, `unlocked`,
  `accessState: "hidden"`) exists, but gated rooms are still case rooms that unlock later.
  Dormancy is a different state: never in this case at all.
- **The map draws case rooms only.** `mansionRoomPlacements(state.rooms)` is merged with
  layout rectangles in `DebateMysteryV2Experience.tsx`. A layout room missing from
  `state.rooms` is simply not drawn.
- **Routes cross rooms.** `mansionLayoutV2TraversalRoute` walks `traversableAdjacency`,
  which joins every room and corridor through doors and vertical connectors. A dormant room
  with doors on two sides would be a shortcut unless excluded.
- **Suspect slots are assigned at generation.** The first `length.suspects` rooms get a
  `suspectSlotId`. If the case picks a subset, slots have to be assigned at compile time
  instead.
- **The editor freezes validated venues.** `venueArchitectureLocked` hides the template
  palette on profiled venues and shows the fixed "Venue room program". `addRoom` only
  knows `DEBATE_MYSTERY_ROOM_TEMPLATES` (18 templates; footprints from foyer 3 by 2 to
  ballroom 5 by 3 and rooftop lounge 10 by 6), one of each type in legacy estates, with
  floor rules from `debateMysteryRoomTypeIsAllowedOnFloorV1`.
- **Side rooms already exist.** Infill blocks with a `name`, corridor doors, and inert map
  tiles (`data-side-room`). Dormant rooms can reuse that rendering almost as is.
- **The studio couples them in the UI too.** The Mystery Venue step ("Create a Mystery
  Venue") shows Quick, Standard, Grand, and Custom cards and passes that choice into
  `createMysteryVenueProposalV1({ length })`, so the card sizes the building, not the case.
  Its own copy says "Quick, Standard, and Grand control only the accessible investigation
  spaces. The rest of a large venue still exists beyond the case map." That is the intended
  model and the code does not deliver it yet.

## Decouple venue creation from case length

Every venue is built grand. The mystery decides how much of it a case visits.

- **Venue step.** Drops the length cards. A venue proposal takes the setting description
  and the physical scale from intent (compact, standard, grand) and always emits the full
  program for its archetype: every seed room, the redefined default templates, and side
  rooms. Tier count comes from the archetype and scale, not from a room count. "Start
  Blank" opens an empty plan sized the same way.
- **Case step.** The Quick, Standard, Grand, and Custom cards move to the case, next to
  Suspects, as "Investigation scope": how many rooms this mystery opens (Custom keeps 5 to
  18, capped at the venue's program). Suspects stay a case parameter and must stay below
  the accessible room count, as the copy already says.
- **Installed venues.** The same venue serves a quick mystery and a grand one; the case
  picks a different subset each time. That is the whole payoff: venues become reusable
  places instead of one-case buildings.
- **API.** `createMysteryVenueProposalV1` loses `length` and gains `scale`; the bundle's
  `totalRooms` becomes the program size; `suspectSlotId` assignment leaves generation and
  happens at compile against the accessible set (see 3). The case compile request carries
  the scope.
- **Order of work.** Selection and dormancy (phase 1) must land first. Decoupling the
  studio before it would turn every venue into a fifteen-room case.

## Design

### 1. Program versus case

No new entity kind. A room stays `kind: "room"` in the layout. The venue owns the
program; the case owns a selection.

- Venue bundle: `totalRooms` becomes the program size, not the case size.
- Case snapshot config: add `roomProgram: { activeRoomIds: string[]; dormantRoomIds: string[] }`.
  Existing cases have every room active and an empty dormant list, so nothing migrates.
- Portable packages carry the full layout as they do now; the case file carries the
  selection. Importing a case onto the same venue reproduces the same dormant set.

### 2. Generation builds the program

- Ship: emit the whole cruise program (all decks), not the length-trimmed plan. The
  deck plan already places by `spatial` hints, so the geometry code needs no new ideas,
  only more rooms per deck and probably three decks always.
- Other archetypes: emit the full seed program plus redefined default templates (see 5)
  until a per-scale budget is reached: compact 10, standard 14, grand 18. Stop repeating
  rooms with numerals; a second "Guest Bedroom 2" is what side rooms and the redefined
  templates are for.
- Side rooms keep filling the gaps afterwards; they are unaffected.

### 3. Compile picks the case rooms

Deterministic, seeded by the case, so replays and exports agree.

1. The entry room (`venueContract.role === "entry"`) is always active.
2. Breadth-first over `traversableAdjacency` from the entry, preferring rooms on the entry's
   tier, then adjacent tiers, until `length.rooms` are chosen. This keeps a quick case on
   one deck instead of scattering five rooms over three.
3. The incident room and any room a plot node needs are forced active before the walk.
4. Suspect slots are assigned to active rooms at compile time; generation stops assigning
   them.
5. Everything else is dormant.

### 4. Dormant rooms at runtime

- Not in `state.rooms`. No hotspots, no dialogue, no Case File presence.
- Map: drawn from the layout as inert tiles with their names, the side-room styling plus a
  "closed for this case" cue in the title and label. Doors still draw.
- Routes: `mansionLayoutV2TraversalRoute` and `traversableAdjacency` take an exclusion set;
  the API passes the dormant ids. `neighborIds` are computed after exclusion, so a dormant
  room is never a neighbor.
- Assets: room art, anchors, and lights are not generated for dormant rooms. This is the
  cost win that makes grand venues affordable.
- Opening journey and travel choreography ignore them.

### 5. Template redefinition

A table per archetype, with a kind fallback, mapping each default template id to venue
vocabulary: name, emoji, role, preferred tier or deck band, and fixture anchors. Footprints
stay with the template. Illustrative cruise ship entries:

| Template | Ship redefinition | Tier |
|---|---|---|
| foyer | Gangway Lobby (entry) | embarkation |
| ballroom | Grand Salon | upper |
| library | Ship's Library | promenade |
| dining-room | Main Dining Room | promenade |
| kitchen | Main Galley | service |
| study | Purser's Office | embarkation |
| parlor | Observation Lounge | upper |
| primary-bedroom | Owner's Suite | upper |
| guest-bedroom | Stateroom | promenade |
| conservatory | Sun Deck Garden | upper |
| cellar | Engine Room | service |
| theater | Ship's Theatre | promenade |
| pool | Lido Pool | upper |
| rooftop-lounge | Sky Deck Lounge | upper |

Rooms added this way to a profiled venue use `templateId: "venue:<slug>"` with a
`venueContract.footprint` taken from the default template, scaled down when the envelope
cannot hold it. Hotspot regions come from the venue's generated art, as they do for every
profiled room today; the default template's bundled estate art is not reused.

### 6. Editor

- On validated venues the palette shows the default templates under their redefined names.
  Adding one places it at a legal shared-wall position and derives doors; accepted rooms
  stay frozen, added rooms move until saved. The lock message changes to say so.
- A room's card shows whether the current case has it active or dormant when the editor is
  opened from a case.
- Side rooms are unchanged.

## Risks and open questions

- **Old cases.** Any code that equates layout rooms with case rooms must read the
  selection instead. Search for `mansionSnapshot.rooms` and `layoutV2.entities` room
  filters in `debate-mystery-v2.ts` before starting.
- **Suspect placement.** Compile-time slot assignment changes who can be where; the
  authoring passes that read `suspectSlotId` need the active set.
- **Copy.** "Unknown room" means unvisited today. Dormant needs its own word on the map and
  in tutorials.
- **Exports.** The portable package threat model treats the layout as public; the dormant
  list is public too, and must not leak which rooms matter to the plot. Forcing plot rooms
  active is fine only if the selection reads as ordinary.
- **Envelope.** Sixteen by twelve cells per tier is tight for a full program plus side
  rooms. Grand venues may need the three-tier rule relaxed or larger envelopes for
  vessels.

## Phases

1. Selection and dormancy: `roomProgram` in the snapshot, compile-time picking, dormant
   tiles, traversal exclusion, asset skipping. Prove it on the cruise ship, whose sixteen
   room program already exceeds a standard case.
2. Decouple the studio: length cards move from the venue step to the case as investigation
   scope; venue proposals take a scale and always build the full program.
3. Grand generation for every archetype, with the per-scale budgets and no numeral repeats.
4. The redefinition table and the editor palette on validated venues.
5. Model-named program rooms in the venue creative draft, the way `sideRooms` works now.

## Acceptance

- A standard case on the ship shows ten active rooms, six or more dormant, all named, all
  with corridor doors, and no route ever enters a dormant room.
- A quick case on the same ship stays on one deck.
- Regenerating a case on the same venue yields the same selection for the same seed.
- Room art is generated only for active rooms.
- An existing saved case opens unchanged, with an empty dormant list.
- A venue created in the studio always carries its full program; a quick and a grand
  mystery on that same venue differ only in which rooms are accessible.
