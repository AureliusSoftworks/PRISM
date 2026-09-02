"use client";

import {
  Component,
  createRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  captureFlytingGalleryPositions,
  FLYTING_GALLERY_REDUCED_MOTION_QUERY,
  FlytingGalleryShiftAnimator,
  type FlytingGallerySnapshot,
} from "./debateFlytingGalleryMotion";

interface FlytingGalleryMotionProps extends HTMLAttributes<HTMLSpanElement> {
  /** Stable seat ids + allegiances. Speech/mouth updates must not restart travel. */
  layoutKey: string;
}

/** A pre-commit snapshot is necessary here: allegiance changes re-parent seats,
 * so a post-render effect would miss their actual departure positions. */
export class FlytingGalleryMotion extends Component<
  FlytingGalleryMotionProps,
  Record<string, never>,
  FlytingGallerySnapshot | null
> {
  private readonly container = createRef<HTMLSpanElement>();
  private readonly shift = new FlytingGalleryShiftAnimator();
  private reducedMotion: MediaQueryList | undefined;

  private onMotionPreferenceChange = (): void => {
    if (this.reducedMotion?.matches) this.shift.cancel();
  };

  componentDidMount(): void {
    this.reducedMotion =
      this.container.current?.ownerDocument.defaultView?.matchMedia?.(
        FLYTING_GALLERY_REDUCED_MOTION_QUERY,
      );
    this.reducedMotion?.addEventListener(
      "change",
      this.onMotionPreferenceChange,
    );
  }

  getSnapshotBeforeUpdate(
    previous: FlytingGalleryMotionProps,
  ): FlytingGallerySnapshot | null {
    if (
      previous.layoutKey === this.props.layoutKey ||
      !this.container.current
    ) {
      return null;
    }
    return captureFlytingGalleryPositions(this.container.current);
  }

  componentDidUpdate(
    _previousProps: FlytingGalleryMotionProps,
    _previousState: Record<string, never>,
    snapshot: FlytingGallerySnapshot | null,
  ): void {
    if (snapshot && this.container.current) {
      this.shift.move(this.container.current, snapshot);
    }
  }

  componentWillUnmount(): void {
    this.reducedMotion?.removeEventListener(
      "change",
      this.onMotionPreferenceChange,
    );
    this.shift.cancel();
  }

  render(): ReactNode {
    const { children, layoutKey, ...attributes } = this.props;
    return (
      <span
        {...attributes}
        ref={this.container}
        data-flyting-gallery-layout={layoutKey}
      >
        {children}
      </span>
    );
  }
}
