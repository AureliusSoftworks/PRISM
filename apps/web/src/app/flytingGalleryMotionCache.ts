import type { FlytingGalleryMember } from "./debateFlytingGalleryMotion";

/** Only relative foot order affects paint order. Subpixel Y changes do not. */
export function flytingGalleryDepthRanks(
  bodies: Iterable<{ id: string; y: number }>,
): Map<string, number> {
  return new Map([...bodies]
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
    .map((body, index) => [body.id, 100 + index]));
}

/** Keeps DOM work proportional to changed floor values, not animation frames. */
export class FlytingGalleryWriteCache<T extends object = object> {
  private readonly values = new WeakMap<T, Map<string, string>>();

  write(target: T, property: string, value: string, apply: () => void): boolean {
    let known = this.values.get(target);
    if (!known) {
      known = new Map();
      this.values.set(target, known);
    }
    if (known.get(property) === value) return false;
    known.set(property, value);
    apply();
    return true;
  }
}

export function flytingGalleryMembersSignature(
  members: readonly FlytingGalleryMember[],
): string {
  return members.map((member) => `${member.id}:${member.leaning}`).join("|");
}
