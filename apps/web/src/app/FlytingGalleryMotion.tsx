"use client";

import { Component, createRef, type HTMLAttributes } from "react";
import {
  FLYTING_GALLERY_REDUCED_MOTION_QUERY,
  FlytingGalleryWorld,
  type FlytingGalleryMember,
} from "./debateFlytingGalleryMotion";
import {
  FlytingGalleryWriteCache,
  flytingGalleryDepthRanks,
  flytingGalleryMembersSignature,
} from "./flytingGalleryMotionCache";

interface FlytingGalleryNode {
  seat: HTMLElement;
  portrait: HTMLElement | null;
}

interface FlytingGalleryMotionProps extends HTMLAttributes<HTMLSpanElement> {
  /** Stable identities are direct children: votes never re-parent a bot. */
  members: readonly FlytingGalleryMember[];
  maxVerticalRoam: number;
  botScale: number;
}

export class FlytingGalleryMotion extends Component<FlytingGalleryMotionProps> {
  private readonly container = createRef<HTMLSpanElement>();
  private readonly world = new FlytingGalleryWorld();
  private readonly writes = new FlytingGalleryWriteCache<HTMLElement>();
  private nodes: FlytingGalleryNode[] = [];
  private reducedMotion?: MediaQueryList;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private visible = true;
  private frame: number | null = null;
  private lastTime: number | null = null;
  private membersSignature = "";
  private geometry?: {
    width: number;
    height: number;
    bodySize: number;
    botScale: number;
    roam: number;
  };

  componentDidMount(): void {
    const root = this.container.current!;
    const view = root.ownerDocument.defaultView!;
    this.reducedMotion = view.matchMedia?.(FLYTING_GALLERY_REDUCED_MOTION_QUERY);
    this.reducedMotion?.addEventListener("change", this.refreshLifecycle);
    root.ownerDocument.addEventListener("visibilitychange", this.refreshLifecycle);
    this.resizeObserver = new ResizeObserver(() => {
      this.refreshGeometry();
      this.refreshLifecycle();
    });
    this.resizeObserver.observe(root);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      this.refreshLifecycle();
    });
    this.intersectionObserver.observe(root);
    this.refreshNodesAndGeometry();
  }

  componentDidUpdate(): void {
    const nextMembersSignature = flytingGalleryMembersSignature(this.props.members);
    if (nextMembersSignature !== this.membersSignature) {
      this.refreshNodes();
      this.syncMembers(nextMembersSignature);
    }
    if (
      this.geometry?.roam !== this.props.maxVerticalRoam ||
      this.geometry?.botScale !== this.props.botScale
    ) {
      this.refreshGeometry();
    }
    this.refreshLifecycle();
  }

  componentWillUnmount(): void {
    this.stop();
    this.reducedMotion?.removeEventListener("change", this.refreshLifecycle);
    this.container.current?.ownerDocument.removeEventListener("visibilitychange", this.refreshLifecycle);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }

  private stop(): void {
    if (this.frame !== null) {
      this.container.current?.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    }
    this.frame = this.lastTime = null;
  }

  private refreshNodes = (): void => {
    const root = this.container.current;
    if (!root) return;
    this.nodes = [...root.querySelectorAll<HTMLElement>("[data-flyting-gallery-seat]")]
      .map((seat) => ({
        seat,
        portrait: seat.querySelector<HTMLElement>("[data-flyting-gallery-portrait]"),
      }));
  };

  private syncMembers = (signature = flytingGalleryMembersSignature(this.props.members)): void => {
    this.membersSignature = signature;
    this.world.sync(this.props.members, this.reducedMotion?.matches);
    this.paint();
  };

  private refreshNodesAndGeometry = (): void => {
    this.refreshNodes();
    this.refreshGeometry();
    this.syncMembers();
    this.refreshLifecycle();
  };

  private refreshGeometry = (): void => {
    const root = this.container.current;
    if (!root) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    const bodySize = (this.nodes[0]?.seat.offsetWidth || 76) * this.props.botScale / 100;
    const roam = this.props.maxVerticalRoam;
    if (
      this.geometry?.width === width &&
      this.geometry.height === height &&
      this.geometry.bodySize === bodySize &&
      this.geometry.roam === roam &&
      this.geometry.botScale === this.props.botScale
    ) return;
    this.geometry = { width, height, bodySize, botScale: this.props.botScale, roam };
    this.world.configure(
      width,
      height,
      bodySize,
      roam,
    );
    this.paint();
  };

  private refreshLifecycle = (): void => {
    const root = this.container.current;
    if (!root) return;
    if (this.reducedMotion?.matches) {
      this.world.settle();
      this.paint();
      this.stop();
      return;
    }
    if (
      root.ownerDocument.hidden ||
      !this.visible ||
      !this.geometry?.width ||
      !this.geometry.height ||
      !this.nodes.length
    ) {
      this.stop();
      return;
    }
    this.paint();
    if (this.frame === null) {
      this.frame = root.ownerDocument.defaultView!.requestAnimationFrame(this.tick);
    }
  };

  private tick = (time: number): void => {
    if (this.lastTime !== null) this.world.step((time - this.lastTime) / 1000);
    this.lastTime = time;
    this.paint();
    this.frame = this.container.current!.ownerDocument.defaultView!.requestAnimationFrame(this.tick);
  };

  private paint(): void {
    const depthRanks = flytingGalleryDepthRanks(this.world.bodies.values());
    for (const { seat, portrait } of this.nodes) {
      const body = this.world.bodies.get(seat.dataset.flytingGallerySeat!);
      if (!body) continue;
      const depth = 0.84 + 0.16 * body.y / this.world.height;
      const motion = this.reducedMotion?.matches ? 0 : Math.min(1, Math.hypot(body.vx, body.vy) / (this.world.width * 0.018));
      // Translate the foot anchor without asking the browser to reflow layout.
      const translate = `calc(${body.x.toFixed(3)}px - 50%) calc(${body.y.toFixed(3)}px - 100%)`;
      const zIndex = String(depthRanks.get(body.id));
      // A tenth of a percent is subpixel at these footprints. Avoid reraster
      // scale churn while translation and independent gait remain continuous.
      const transform = `scale(${depth.toFixed(3)})`;
      const bob = (-Math.abs(Math.sin(body.phase)) * motion * 1.6).toFixed(2);
      const lean = (Math.max(-1, Math.min(1, body.vx / (this.world.width * 0.035))) * motion * 1.8).toFixed(2);
      this.writes.write(seat, "translate", translate, () => { seat.style.translate = translate; });
      this.writes.write(seat, "z-index", zIndex, () => { seat.style.zIndex = zIndex; });
      this.writes.write(seat, "transform", transform, () => { seat.style.transform = transform; });
      this.writes.write(seat, "moving", body.travelling ? "true" : "false", () => {
        seat.dataset.flytingGalleryMoving = body.travelling ? "true" : "false";
      });
      if (portrait) {
        const portraitTransform = `translateY(${bob}px) rotate(${lean}deg)`;
        this.writes.write(portrait, "transform", portraitTransform, () => {
          portrait.style.transform = portraitTransform;
        });
      }
    }
  }

  render() {
    const attributes: Partial<FlytingGalleryMotionProps> = { ...this.props };
    const { children } = attributes;
    delete attributes.children;
    delete attributes.members;
    delete attributes.maxVerticalRoam;
    delete attributes.botScale;
    return <span {...attributes} ref={this.container}>{children}</span>;
  }
}
