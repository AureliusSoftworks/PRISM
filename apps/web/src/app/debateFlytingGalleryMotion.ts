export const FLYTING_GALLERY_SHIFT_DURATION_MS = 900;
export const FLYTING_GALLERY_REDUCED_MOTION_QUERY =
  "(prefers-reduced-motion: reduce)";

const SEAT_SELECTOR = "[data-flyting-gallery-seat]";

interface GalleryPoint {
  x: number;
  y: number;
}

export type FlytingGallerySnapshot = ReadonlyMap<string, GalleryPoint>;

/** Read before React moves seats between allegiance groups, including any
 * in-flight shift. Container-relative coordinates ignore page scrolling. */
export function captureFlytingGalleryPositions(
  container: HTMLElement,
): FlytingGallerySnapshot {
  const origin = container.getBoundingClientRect();
  const positions = new Map<string, GalleryPoint>();
  for (const seat of container.querySelectorAll<HTMLElement>(SEAT_SELECTOR)) {
    const id = seat.dataset.flytingGallerySeat;
    const bounds = seat.getBoundingClientRect();
    if (!id || bounds.width <= 0 || bounds.height <= 0) continue;
    positions.set(id, {
      x: bounds.left - origin.left,
      y: bounds.top - origin.top,
    });
  }
  return positions;
}

/** Owns only inter-group translation. The slot's existing transform animation
 * remains free to mill, and the row keeps ownership of depth ordering. */
export class FlytingGalleryShiftAnimator {
  private readonly active = new Map<HTMLElement, Animation>();

  cancel(): void {
    const previous = [...this.active];
    this.active.clear();
    for (const [seat, animation] of previous) {
      delete seat.dataset.flytingGalleryMoving;
      animation.cancel();
    }
  }

  move(container: HTMLElement, previous: FlytingGallerySnapshot): void {
    // The snapshot already includes the visible position of a previous shift.
    // Remove that shift before measuring the new natural layout.
    this.cancel();
    if (
      container.ownerDocument.defaultView?.matchMedia?.(
        FLYTING_GALLERY_REDUCED_MOTION_QUERY,
      ).matches
    ) {
      return;
    }
    const origin = container.getBoundingClientRect();
    if (
      origin.width <= 0 ||
      origin.height <= 0 ||
      container.offsetWidth <= 0 ||
      container.offsetHeight <= 0
    ) {
      return;
    }
    // Rehearsal and the authored crowd container may both be scaled.
    const scaleX = origin.width / container.offsetWidth;
    const scaleY = origin.height / container.offsetHeight;
    const shifts: Array<{ seat: HTMLElement; x: number; y: number }> = [];
    for (const seat of container.querySelectorAll<HTMLElement>(SEAT_SELECTOR)) {
      const from = previous.get(seat.dataset.flytingGallerySeat ?? "");
      if (!from || typeof seat.animate !== "function") continue;
      const bounds = seat.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      const x = (from.x - (bounds.left - origin.left)) / scaleX;
      const y = (from.y - (bounds.top - origin.top)) / scaleY;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      shifts.push({ seat, x, y });
    }
    // Batch all layout reads before starting any animations.
    for (const { seat, x, y } of shifts) {
      const animation = seat.animate(
        [{ translate: `${x}px ${y}px` }, { translate: "0px 0px" }],
        {
          duration: FLYTING_GALLERY_SHIFT_DURATION_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      this.active.set(seat, animation);
      seat.dataset.flytingGalleryMoving = "true";
      const finish = (): void => {
        if (this.active.get(seat) !== animation) return;
        this.active.delete(seat);
        delete seat.dataset.flytingGalleryMoving;
      };
      animation.onfinish = finish;
      animation.oncancel = finish;
    }
  }
}
