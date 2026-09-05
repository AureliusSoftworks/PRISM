export const AVATAR_STUDIO_VIEWPORT_LAYOUT = {
  inspectorTopPx: 20,
  navigationBottomPx: 22,
  navigationHeightPx: 44,
  navigationGapPx: 16,
  voiceGapPx: 2,
  scrollEndPaddingPx: 36,
} as const;

export const AVATAR_STUDIO_VIEWPORT_CSS_PROPERTIES = {
  "--avatar-foundry-inspector-top": `${AVATAR_STUDIO_VIEWPORT_LAYOUT.inspectorTopPx}px`,
  "--avatar-foundry-navigation-bottom":
    `${AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationBottomPx}px`,
  "--avatar-foundry-navigation-height":
    `${AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationHeightPx}px`,
  "--avatar-foundry-navigation-gap":
    `${AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationGapPx}px`,
  "--avatar-foundry-voice-gap": `${AVATAR_STUDIO_VIEWPORT_LAYOUT.voiceGapPx}px`,
  "--avatar-foundry-scroll-end-padding":
    `${AVATAR_STUDIO_VIEWPORT_LAYOUT.scrollEndPaddingPx}px`,
} as const;

export interface AvatarStudioViewportMetrics {
  workspaceHeight: number;
  editorBodyHeight: number;
  inspectorHeight: number;
  inspectorViewportTop: number;
  inspectorViewportBottom: number;
  inspectorBottomClearance: number;
  navigationViewportTop: number;
  navigationViewportBottom: number;
  voicePreviewViewportBottom: number;
}

/**
 * Models the desktop Foundry's block-axis ownership. The backdrop alone clears
 * the app navbar; the modal fills that workspace; the editor body then reserves
 * the bottom navigation and its breathing room from the inspector scrollport.
 */
export function avatarStudioViewportMetrics({
  viewportHeight,
  appNavbarHeight,
  studioHeaderHeight,
}: {
  viewportHeight: number;
  appNavbarHeight: number;
  studioHeaderHeight: number;
}): AvatarStudioViewportMetrics {
  const workspaceHeight = Math.max(0, viewportHeight - appNavbarHeight);
  const editorBodyHeight = Math.max(0, workspaceHeight - studioHeaderHeight);
  const inspectorBottomClearance =
    AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationBottomPx +
    AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationHeightPx +
    AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationGapPx;
  const inspectorHeight = Math.max(
    0,
    editorBodyHeight -
      AVATAR_STUDIO_VIEWPORT_LAYOUT.inspectorTopPx -
      inspectorBottomClearance,
  );
  const editorBodyViewportTop = appNavbarHeight + studioHeaderHeight;
  const inspectorViewportTop =
    editorBodyViewportTop + AVATAR_STUDIO_VIEWPORT_LAYOUT.inspectorTopPx;
  const inspectorViewportBottom = inspectorViewportTop + inspectorHeight;
  const navigationViewportBottom =
    viewportHeight - AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationBottomPx;

  return {
    workspaceHeight,
    editorBodyHeight,
    inspectorHeight,
    inspectorViewportTop,
    inspectorViewportBottom,
    inspectorBottomClearance: viewportHeight - inspectorViewportBottom,
    navigationViewportTop:
      navigationViewportBottom -
      AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationHeightPx,
    navigationViewportBottom,
    voicePreviewViewportBottom:
      viewportHeight -
      inspectorBottomClearance -
      AVATAR_STUDIO_VIEWPORT_LAYOUT.voiceGapPx,
  };
}
