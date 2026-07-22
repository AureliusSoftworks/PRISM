# PRISM Living Shell Architecture

PRISM is organized by the role a surface plays, not by a flat list of applets.
The typed source of truth is
`apps/web/src/app/prismSurfaceRegistry.ts`.

## Product roles

- **Home:** All Bots, Prism Home, persona Zen Homes, and group Homes. All Bots
  is the canonical root.
- **Experiences:** Coffee, Signal, Story, and future contextual activities
  entered with selected bots or a saved group.
- **Studios:** Slate and future standalone project applications. A Studio may
  be used without personas, Marketplace, or social Experiences.
- **Tools:** Marketplace, Avatar Studio, Images, Settings, and other supporting
  controls opened in context.

Applet versions remain a separate provenance catalog. They do not determine
navigation hierarchy or startup eligibility.

## Entry and return contract

Home and Slate are the only explicit startup roots. **Last workspace** is a
startup preference that resolves to a saved checkpoint; it is not another
surface or a command-line launch mode.

Coffee and Signal are contextual Experiences. Their entry packet retains an
exact app-relative origin, selected bot or group identity, workspace identity
when relevant, and a focus target. Leaving the Experience restores that
checkpoint instead of guessing where the player came from.

Tools use the same origin-checkpoint behavior. Slate resumes its own persisted
workspace. All Bots always resolves to the Home root.

## Shell direction

The final global shell contains a minimal location strip for Back/Home, current
location, provider/privacy status, and critical session state. The global Prism
companion owns contextual commands and assistance; it does not silently speak
for the player, alter comprehension, or mutate manuscripts and memories.

The living shell is being introduced incrementally so existing routes remain
compatible while each consumer moves to the shared surface registry.
