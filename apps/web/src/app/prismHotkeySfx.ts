import { playPreparedCoffeeActionSfx } from "./coffee-action-sfx";

/** Play the short, local bodily Foley cue for an unavailable hotkey action. */
export function playPrismHotkeyInaccessibleSfx(): void {
  void playPreparedCoffeeActionSfx({
    kind: "fart",
    voiceVolume: 1,
    corporality: 0.5,
    voiceEffectsEnabled: false,
  });
}
