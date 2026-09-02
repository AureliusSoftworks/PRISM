import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  captureFlytingGalleryPositions,
  FLYTING_GALLERY_SHIFT_DURATION_MS,
  FlytingGalleryShiftAnimator,
} from "./debateFlytingGalleryMotion.ts";

class TestAnimation {
  cancelled = false;
  onfinish: (() => void) | null = null;
  oncancel: (() => void) | null = null;
  cancel(): void {
    this.cancelled = true;
    this.oncancel?.();
  }
}

class TestSeat {
  dataset: Record<string, string>;
  bounds: { left: number; top: number; width: number; height: number };
  animations: Array<{
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
    animation: TestAnimation;
  }> = [];
  constructor(id: string, left: number, top = 100) {
    this.dataset = { flytingGallerySeat: id };
    this.bounds = { left, top, width: 60, height: 70 };
  }
  getBoundingClientRect(): typeof this.bounds {
    return this.bounds;
  }
  animate(
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ): TestAnimation {
    const animation = new TestAnimation();
    this.animations.push({ frames, options, animation });
    return animation;
  }
}

function gallery(seats: TestSeat[]) {
  const state = {
    seats,
    reducedMotion: false,
    bounds: { left: 0, top: 0, width: 1_000, height: 300 },
    offsetWidth: 1_000,
    offsetHeight: 300,
    getBoundingClientRect() {
      return this.bounds;
    },
    querySelectorAll() {
      return this.seats;
    },
    ownerDocument: {
      defaultView: {
        matchMedia: () => ({ matches: state.reducedMotion }),
      },
    },
  };
  return { state, element: state as unknown as HTMLElement };
}

describe("Flyting gallery allegiance movement", () => {
  it("captures stable ids relative to the container and ignores invisible seats", () => {
    const a = new TestSeat("a", 140, 120);
    const hidden = new TestSeat("hidden", 900);
    hidden.bounds.width = 0;
    const root = gallery([a, hidden]);
    root.state.bounds.left = 100;
    root.state.bounds.top = 50;
    assert.deepEqual(
      [...captureFlytingGalleryPositions(root.element)],
      [["a", { x: 40, y: 70 }]],
    );
  });

  it("glides replacement nodes from their pre-reparent positions without replacing milling transforms", () => {
    const root = gallery([new TestSeat("a", 100)]);
    const before = captureFlytingGalleryPositions(root.element);
    const moved = new TestSeat("a", 700, 140);
    root.state.seats = [moved];
    new FlytingGalleryShiftAnimator().move(root.element, before);
    assert.deepEqual(moved.animations[0]?.frames, [
      { translate: "-600px -40px" },
      { translate: "0px 0px" },
    ]);
    assert.equal(
      moved.animations[0]?.options.duration,
      FLYTING_GALLERY_SHIFT_DURATION_MS,
    );
    assert.equal(moved.dataset.flytingGalleryMoving, "true");
    assert.equal(moved.animations[0]?.options.fill, undefined);
    moved.animations[0]?.animation.onfinish?.();
    assert.equal(moved.dataset.flytingGalleryMoving, undefined);
  });

  it("corrects travel distance for authored and preview scaling without reacting to page scroll", () => {
    const root = gallery([new TestSeat("a", 150, 120)]);
    root.state.bounds = { left: 50, top: 20, width: 500, height: 150 };
    const before = captureFlytingGalleryPositions(root.element);
    const moved = new TestSeat("a", 450, 230);
    root.state.bounds.top = 100;
    root.state.seats = [moved];
    new FlytingGalleryShiftAnimator().move(root.element, before);
    assert.deepEqual(moved.animations[0]?.frames[0], {
      translate: "-600px -60px",
    });
  });

  it("retargets an interrupted shift from its current visible position", () => {
    const seat = new TestSeat("a", 100);
    const root = gallery([seat]);
    const animator = new FlytingGalleryShiftAnimator();
    const first = captureFlytingGalleryPositions(root.element);
    seat.bounds.left = 700;
    animator.move(root.element, first);
    const firstAnimation = seat.animations[0]!.animation;
    seat.bounds.left = 300; // Where the prior animation is currently visible.
    const interrupted = captureFlytingGalleryPositions(root.element);
    seat.bounds.left = 50; // Natural layout after the next allegiance update.
    animator.move(root.element, interrupted);
    assert.equal(firstAnimation.cancelled, true);
    assert.deepEqual(seat.animations[1]?.frames[0], { translate: "250px 0px" });
    firstAnimation.onfinish?.();
    assert.equal(seat.dataset.flytingGalleryMoving, "true");
  });

  it("does not animate first appearance, stationary seats, or removed seats", () => {
    const still = new TestSeat("still", 100);
    const root = gallery([still, new TestSeat("removed", 200)]);
    const before = captureFlytingGalleryPositions(root.element);
    const added = new TestSeat("added", 800);
    root.state.seats = [added, still];
    new FlytingGalleryShiftAnimator().move(root.element, before);
    assert.equal(added.animations.length, 0);
    assert.equal(still.animations.length, 0);
  });

  it("cancels only its own travel animations on cleanup or reduced motion", () => {
    const seat = new TestSeat("a", 100);
    const root = gallery([seat]);
    const animator = new FlytingGalleryShiftAnimator();
    const before = captureFlytingGalleryPositions(root.element);
    seat.bounds.left = 700;
    animator.move(root.element, before);
    root.state.reducedMotion = true;
    animator.move(root.element, before);
    assert.equal(seat.animations.length, 1);
    assert.equal(seat.animations[0]?.animation.cancelled, true);
    assert.equal(seat.dataset.flytingGalleryMoving, undefined);
    root.state.reducedMotion = false;
    animator.move(root.element, before);
    animator.cancel();
    assert.equal(seat.animations[1]?.animation.cancelled, true);
    assert.equal(seat.dataset.flytingGalleryMoving, undefined);
  });

  it("safely skips unmeasurable galleries and unsupported animation engines", () => {
    const seat = new TestSeat("a", 100);
    const root = gallery([seat]);
    const before = captureFlytingGalleryPositions(root.element);
    seat.bounds.left = 700;
    root.state.offsetWidth = 0;
    const animator = new FlytingGalleryShiftAnimator();
    animator.move(root.element, before);
    assert.equal(seat.animations.length, 0);
    root.state.offsetWidth = 1_000;
    Object.defineProperty(seat, "animate", { value: undefined });
    assert.doesNotThrow(() => animator.move(root.element, before));
  });

  it("wires the same pre-commit motion boundary into rehearsal and live Hall", () => {
    const source = readFileSync(
      new URL("./DebateFlyting.tsx", import.meta.url),
      "utf8",
    );
    const component = readFileSync(
      new URL("./FlytingGalleryMotion.tsx", import.meta.url),
      "utf8",
    );
    assert.equal([...source.matchAll(/<FlytingGalleryMotion\s/gu)].length, 2);
    assert.equal(
      [...source.matchAll(/data-flyting-gallery-seat=\{seat.id\}/gu)].length,
      2,
    );
    assert.equal(
      [...source.matchAll(/`\$\{seat.id\}:\$\{seat.leaning\}`/gu)].length,
      2,
    );
    assert.match(component, /getSnapshotBeforeUpdate/u);
    assert.match(component, /previous.layoutKey === this.props.layoutKey/u);
    assert.match(component, /componentDidUpdate[\s\S]*this.shift.move/u);
    assert.match(component, /componentWillUnmount[\s\S]*this.shift.cancel/u);
    assert.match(
      component,
      /if \(this.reducedMotion\?\.matches\) this.shift.cancel\(\)/u,
    );
  });
});
