import {
  avatarDetailsEqual,
  cloneAvatarDetails,
  type AvatarDetailsV1,
} from "./avatar-details.ts";

const AVATAR_DETAILS_HISTORY_LIMIT = 50;

export interface AvatarDetailsHistoryState {
  working: AvatarDetailsV1;
  undo: readonly AvatarDetailsV1[];
  redo: readonly AvatarDetailsV1[];
}

function appendHistory(
  history: readonly AvatarDetailsV1[],
  details: AvatarDetailsV1
): AvatarDetailsV1[] {
  const next = [...history, cloneAvatarDetails(details)];
  return next.length > AVATAR_DETAILS_HISTORY_LIMIT
    ? next.slice(next.length - AVATAR_DETAILS_HISTORY_LIMIT)
    : next;
}

export function commitAvatarDetailsHistory(
  state: AvatarDetailsHistoryState,
  nextWorking: AvatarDetailsV1
): AvatarDetailsHistoryState {
  if (avatarDetailsEqual(state.working, nextWorking)) return state;
  return {
    working: cloneAvatarDetails(nextWorking),
    undo: appendHistory(state.undo, state.working),
    redo: [],
  };
}

export function undoAvatarDetailsHistory(
  state: AvatarDetailsHistoryState
): AvatarDetailsHistoryState {
  const previous = state.undo.at(-1);
  if (!previous) return state;
  return {
    working: cloneAvatarDetails(previous),
    undo: state.undo.slice(0, -1),
    redo: appendHistory(state.redo, state.working),
  };
}

export function redoAvatarDetailsHistory(
  state: AvatarDetailsHistoryState
): AvatarDetailsHistoryState {
  const next = state.redo.at(-1);
  if (!next) return state;
  return {
    working: cloneAvatarDetails(next),
    undo: appendHistory(state.undo, state.working),
    redo: state.redo.slice(0, -1),
  };
}
