const COFFEE_REPLAY_STAGE_MOUNT_MAX_FRAMES = 90;

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForCoffeeReplayRenderStage<T>(
  getStage: () => T | null,
): Promise<T> {
  for (
    let frame = 0;
    frame <= COFFEE_REPLAY_STAGE_MOUNT_MAX_FRAMES;
    frame += 1
  ) {
    const stage = getStage();
    if (stage) return stage;
    if (frame < COFFEE_REPLAY_STAGE_MOUNT_MAX_FRAMES) {
      await nextAnimationFrame();
    }
  }
  throw new Error("Coffee table capture did not mount.");
}

export async function waitForCoffeeReplayRenderAssets(
  stage: HTMLElement,
): Promise<void> {
  await document.fonts?.ready;
  const images = Array.from(stage.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const finish = () => resolve();
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          window.setTimeout(finish, 15_000);
        });
      }
      await image.decode?.().catch(() => undefined);
    }),
  );
  await nextAnimationFrame();
  await nextAnimationFrame();
}
