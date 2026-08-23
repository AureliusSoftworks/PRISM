"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { CoffeeSeatBlinkPhase } from "./coffee-seat-plate-blink";
import { AvatarDetailsMask } from "./AvatarDetailsMask";
import {
  avatarDetailsHasVisuals,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsV1,
} from "./avatar-details";
import type { ZenLiveBotMouthShape } from "./zenLiveMouth";

export type MiniAvatarDetailsInkRenderProps = {
  renderAvatarDetailsInk: (
    depth: "behind-face" | "above-face",
  ) => React.JSX.Element | null;
  onBlinkPhaseChange: (phase: CoffeeSeatBlinkPhase) => void;
};

/**
 * Keeps Mini Ink on the same semantic state as its adjacent face without
 * importing Full HD Speech motion. CoffeeSeatPlateEmoji reports its final
 * displayed blink phase, including forced and suppressed blink states.
 */
export function MiniAvatarDetailsInk({
  details,
  color,
  faceGeometry,
  talking,
  thinking = false,
  mouthShape = null,
  staticRaster = true,
  className,
  children,
}: {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
  talking: boolean;
  thinking?: boolean;
  mouthShape?: ZenLiveBotMouthShape | null;
  staticRaster?: boolean;
  className: string;
  children: (props: MiniAvatarDetailsInkRenderProps) => ReactNode;
}): React.JSX.Element {
  const [blinkPhase, setBlinkPhase] = useState<CoffeeSeatBlinkPhase>("open");
  const onBlinkPhaseChange = useCallback((phase: CoffeeSeatBlinkPhase) => {
    setBlinkPhase((current) => (current === phase ? current : phase));
  }, []);
  const hasAvatarArt = avatarDetailsHasVisuals(details);
  const renderAvatarDetailsInk = (
    depth: "behind-face" | "above-face",
  ): React.JSX.Element | null =>
    hasAvatarArt && !thinking ? (
      <span className={className} data-avatar-details-depth={depth}>
        <AvatarDetailsMask
          details={details}
          color={color}
          detailLevel="audience"
          faceGeometry={faceGeometry}
          blinkPhase={blinkPhase}
          talking={talking}
          speechMotionActive={false}
          mouthShape={mouthShape}
          depth={depth}
          staticRaster={staticRaster}
          coreColor="ink"
        />
      </span>
    ) : null;

  return <>{children({ renderAvatarDetailsInk, onBlinkPhaseChange })}</>;
}
