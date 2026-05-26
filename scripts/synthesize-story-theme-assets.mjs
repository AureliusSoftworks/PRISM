import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const THEME_ID = "prism_default";
const DRAFT_DIR = join(ROOT, ".codex/output/story-mode", THEME_ID);
const MOCKUP_DIR = join(DRAFT_DIR, "mockups");
const RAW_DIR = join(DRAFT_DIR, "synthesized_raw");
const POSE_RAW_DIR = join(RAW_DIR, "sprite_reference_poses");
const SYNTHESIZED_DIR = join(DRAFT_DIR, "synthesized");
const PUBLIC_DIR = join(ROOT, "apps/web/public/story-themes", THEME_ID);

const MODEL = process.env.STORY_THEME_IMAGE_MODEL ?? "gpt-image-1";
const QUALITY = process.env.STORY_THEME_IMAGE_QUALITY ?? "high";
const SKIP_EXISTING_RAW = process.env.STORY_THEME_IMAGE_SKIP_EXISTING === "1";
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  throw new Error("OPENAI_API_KEY is required to synthesize Story theme assets.");
}

const basePrompt = [
  "Transform the supplied PRISM mockup into a finished high-resolution raster asset.",
  "Preserve the mockup's composition, broad silhouettes, staging zones, and alpha/background intent.",
  "Use a middle-light grayscale visual novel/storybook style that works over light or dark app themes.",
  "Keep neon prism accents restrained and integrated into the scene.",
  "No text, captions, logos, watermarks, UI controls, or named-artist imitation.",
].join(" ");

const assets = [
  {
    fileName: "sprite_reference_sheet.png",
    source: "sprite_sheet_poses",
    size: "1024x1536",
    targetWidth: 2048,
    targetHeight: 1536,
    transparent: true,
    referencePath: join(PUBLIC_DIR, "sprite_fallback_silhouette.png"),
    poses: [
      {
        id: "idle",
        promptRole: "neutral idle stance, arms relaxed, professional reference pose",
      },
      {
        id: "speaking",
        promptRole: "compact conversational speaking gesture, one forearm raised close to the torso, no wide arm extension",
      },
      {
        id: "thinking",
        promptRole: "one hand raised near the blank face panel in a thinking gesture",
      },
      {
        id: "action",
        promptRole: "compact active step or running gesture, contained inside the sprite cell",
      },
    ],
  },
  {
    fileName: "sprite_fallback_silhouette.png",
    source: "sprite_sheet_first_pose",
    targetWidth: 1024,
    targetHeight: 1536,
    transparent: true,
  },
  {
    fileName: "background_reference_exterior.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a 16:9 exterior location reference: open projected landscape, readable foreground and midground, soft grayscale atmosphere, and restrained cyan/white prism accents.",
      "The image should feel like a projected scene on glass, with soft edge falloff and enough center readability for visual novel dialogue staging.",
    ].join(" "),
  },
  {
    fileName: "background_reference_interior.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a 16:9 enclosed interior location reference: quiet room or chamber, projected grayscale lighting, strong readable perspective, and sparse white/violet/amber prism accents.",
      "Keep the center usable for character staging and dialogue boxes.",
    ].join(" "),
  },
  {
    fileName: "background_reference_liminal.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a 16:9 liminal threshold location reference: strange but calm projected space, grayscale fog, subtle portal or crossing motif, sparse cyan/violet/pink prism accents.",
      "Readable silhouettes, not horror, not pure dark.",
    ].join(" "),
  },
  {
    fileName: "cutscene_reference.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a 16:9 cinematic cutscene reference based on the two-character mockup composition.",
      "Use dramatic but restrained grayscale projection lighting, clear silhouettes, soft vignette-compatible edges, and no text.",
      "Characters should stay blank-face android silhouettes with pure white tintable accents.",
    ].join(" "),
  },
  {
    fileName: "projection_fallback.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a generic 16:9 PRISM projected-scene fallback: middle-light grayscale projection surface, central prism refraction motif, soft scanline/glass texture, restrained rainbow rays.",
      "It should work as a loading or missing-background image without feeling empty.",
    ].join(" "),
  },
  {
    fileName: "map_style_reference.png",
    size: "1536x1024",
    targetWidth: 1920,
    targetHeight: 1080,
    fit: "cover",
    transparent: false,
    prompt: [
      basePrompt,
      "Create a 16:9 map style reference: scribbled regional contours, discovered route nodes, unknown-region feel, grayscale paper/glass projection base, and sparse neon outline accents.",
      "No readable words, labels, numbers, UI, or compass text.",
    ].join(" "),
  },
];

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(POSE_RAW_DIR, { recursive: true });
mkdirSync(SYNTHESIZED_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });

const PYTHON_RESIZE_SCRIPT = String.raw`
from PIL import Image
import numpy as np
import sys

src, dst, width, height, fit, cleanup = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6]
img = Image.open(src).convert("RGBA")
iw, ih = img.size

def remove_speckles(alpha):
    return remove_small_components(alpha, 1600)

def remove_small_components(alpha, min_pixels):
    arr = np.array(alpha)
    mask = arr >= 16
    h, w = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    keep = np.zeros(mask.shape, dtype=bool)
    coords = np.argwhere(mask)

    for y0, x0 in coords:
        y0 = int(y0)
        x0 = int(x0)
        if visited[y0, x0]:
            continue

        stack = [(y0, x0)]
        visited[y0, x0] = True
        component = []

        while stack:
            y, x = stack.pop()
            component.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))

        if len(component) >= min_pixels:
            for y, x in component:
                keep[y, x] = True

    arr[~keep] = 0
    return Image.fromarray(arr, "L")

if fit == "cover":
    target_ratio = width / height
    input_ratio = iw / ih
    if input_ratio > target_ratio:
        crop_w = int(ih * target_ratio)
        left = (iw - crop_w) // 2
        img = img.crop((left, 0, left + crop_w, ih))
    else:
        crop_h = int(iw / target_ratio)
        top = (ih - crop_h) // 2
        img = img.crop((0, top, iw, top + crop_h))
    img = img.resize((width, height), Image.Resampling.LANCZOS)
elif fit == "contain":
    scale = min(width / iw, height / ih)
    resized = img.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), Image.Resampling.LANCZOS)
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    img.alpha_composite(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
else:
    raise ValueError(f"Unknown fit mode: {fit}")

if cleanup == "sprite_reference":
    alpha = img.getchannel("A").point(lambda a: 0 if a < 16 else a)
    keep = Image.new("L", img.size, 0)
    boxes = [
        (70, 330, 550, 1485),
        (510, 330, 1060, 1485),
        (940, 330, 1525, 1485),
        (1360, 330, 2048, 1485),
    ]
    for box in boxes:
        keep.paste(255, box)
    alpha = Image.composite(alpha, Image.new("L", img.size, 0), keep)
    alpha = remove_speckles(alpha)
    img.putalpha(alpha)
elif cleanup == "sprite_fallback":
    alpha = img.getchannel("A").point(lambda a: 0 if a < 18 else a)
    keep = Image.new("L", img.size, 0)
    keep.paste(255, (110, 60, width - 110, height - 20))
    alpha = Image.composite(alpha, Image.new("L", img.size, 0), keep)
    alpha = remove_speckles(alpha)
    img.putalpha(alpha)

if cleanup in ("sprite_reference", "sprite_fallback"):
    rgba = np.array(img)
    transparent = rgba[:, :, 3] == 0
    rgba[transparent, 0:3] = 0
    img = Image.fromarray(rgba, "RGBA")
elif cleanup == "opaque":
    img = img.convert("RGB")

img.save(dst, "PNG", optimize=True)
`;

const PYTHON_SPRITE_SHEET_SCRIPT = String.raw`
from PIL import Image
import numpy as np
import sys

dst = sys.argv[1]
width = int(sys.argv[2])
height = int(sys.argv[3])
pose_paths = sys.argv[4:]
cell_w = width // len(pose_paths)
top_pad = 116
bottom_pad = 88
side_pad = 54
androgynous_x_scale = 0.92

def remove_small_components(alpha, min_pixels=1600):
    arr = np.array(alpha)
    mask = arr >= 16
    h, w = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    keep = np.zeros(mask.shape, dtype=bool)
    coords = np.argwhere(mask)

    for y0, x0 in coords:
        y0 = int(y0)
        x0 = int(x0)
        if visited[y0, x0]:
            continue

        stack = [(y0, x0)]
        visited[y0, x0] = True
        component = []

        while stack:
            y, x = stack.pop()
            component.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))

        if len(component) >= min_pixels:
            for y, x in component:
                keep[y, x] = True

    arr[~keep] = 0
    return Image.fromarray(arr, "L")

def clean_pose(img):
    img = img.convert("RGBA")
    alpha = img.getchannel("A").point(lambda a: 0 if a < 14 else a)
    alpha = remove_small_components(alpha)
    img.putalpha(alpha)
    rgba = np.array(img)
    rgba[rgba[:, :, 3] == 0, 0:3] = 0
    return Image.fromarray(rgba, "RGBA")

sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
for index, path in enumerate(pose_paths):
    pose = clean_pose(Image.open(path))
    alpha = pose.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"Pose has no visible pixels: {path}")

    l, t, r, b = bbox
    margin = 32
    l = max(0, l - margin)
    t = max(0, t - margin)
    r = min(pose.width, r + margin)
    b = min(pose.height, b + margin)
    crop = pose.crop((l, t, r, b))

    max_w = cell_w - side_pad * 2
    max_h = height - top_pad - bottom_pad
    scale = min(max_w / crop.width, max_h / crop.height)
    resized = crop.resize(
        (max(1, int(crop.width * scale)), max(1, int(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    resized = resized.resize(
        (max(1, int(resized.width * androgynous_x_scale)), resized.height),
        Image.Resampling.LANCZOS,
    )

    x = index * cell_w + (cell_w - resized.width) // 2
    y = height - bottom_pad - resized.height
    if y < top_pad:
        y = top_pad
    sheet.alpha_composite(resized, (x, y))

rgba = np.array(sheet)
rgba[rgba[:, :, 3] == 0, 0:3] = 0
Image.fromarray(rgba, "RGBA").save(dst, "PNG", optimize=True)
`;

const PYTHON_SPRITE_FALLBACK_FROM_SHEET_SCRIPT = String.raw`
from PIL import Image
import numpy as np
import sys

src, dst, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
sheet = Image.open(src).convert("RGBA")
cell_w = sheet.width // 4
first_pose = sheet.crop((0, 0, cell_w, sheet.height))

scale = min(width / first_pose.width, height / first_pose.height, 1)
if scale != 1:
    first_pose = first_pose.resize(
        (max(1, int(first_pose.width * scale)), max(1, int(first_pose.height * scale))),
        Image.Resampling.LANCZOS,
    )

canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
canvas.alpha_composite(first_pose, ((width - first_pose.width) // 2, height - first_pose.height))

rgba = np.array(canvas)
rgba[rgba[:, :, 3] == 0, 0:3] = 0
Image.fromarray(rgba, "RGBA").save(dst, "PNG", optimize=True)
`;

for (const asset of assets) {
  const mockupPath = join(MOCKUP_DIR, asset.fileName);
  const rawPath = join(RAW_DIR, asset.fileName);
  const finalDraftPath = join(SYNTHESIZED_DIR, asset.fileName);
  const publicPath = join(PUBLIC_DIR, asset.fileName);

  if (asset.source === "sprite_sheet_poses") {
    await synthesizeSpriteSheetFromPoses(asset, finalDraftPath);
    mkdirSync(dirname(publicPath), { recursive: true });
    copyFileSync(finalDraftPath, publicPath);
    console.log(`Promoted ${asset.fileName} -> ${asset.targetWidth}x${asset.targetHeight}`);
    continue;
  }

  if (asset.source === "sprite_sheet_first_pose") {
    const sheetPath = join(SYNTHESIZED_DIR, "sprite_reference_sheet.png");
    if (!existsSync(sheetPath)) {
      throw new Error(`Missing sprite reference sheet for fallback extraction: ${sheetPath}`);
    }

    deriveSpriteFallbackFromSheet(sheetPath, finalDraftPath, asset.targetWidth, asset.targetHeight);
    mkdirSync(dirname(publicPath), { recursive: true });
    copyFileSync(finalDraftPath, publicPath);
    console.log(`Derived ${asset.fileName} from sprite_reference_sheet.png -> ${asset.targetWidth}x${asset.targetHeight}`);
    continue;
  }

  if (asset.source !== "generation" && !existsSync(mockupPath)) {
    throw new Error(`Missing mockup for ${asset.fileName}: ${mockupPath}`);
  }

  if (!SKIP_EXISTING_RAW || !existsSync(rawPath)) {
    console.log(`Synthesizing ${asset.fileName} with ${MODEL} (${asset.size}, ${QUALITY})...`);
    const raw =
      asset.source === "generation"
        ? await generateAsset(asset)
        : await synthesizeAsset(asset, mockupPath);
    writeFileSync(rawPath, raw);
  } else {
    console.log(`Using existing raw synthesis for ${asset.fileName}.`);
  }

  processImage(
    rawPath,
    finalDraftPath,
    asset.targetWidth,
    asset.targetHeight,
    asset.fit,
    asset.transparent ? asset.cleanup ?? "none" : "opaque"
  );
  mkdirSync(dirname(publicPath), { recursive: true });
  copyFileSync(finalDraftPath, publicPath);
  console.log(`Promoted ${asset.fileName} -> ${asset.targetWidth}x${asset.targetHeight}`);
}

console.log(`Synthesized and promoted ${assets.length} PRISM story theme assets.`);

async function synthesizeAsset(asset, imagePath) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", asset.prompt);
  form.append("size", asset.size);
  form.append("quality", QUALITY);
  form.append("background", asset.transparent ? "transparent" : "opaque");
  form.append("output_format", "png");
  form.append("image", new Blob([readFileSync(imagePath)], { type: "image/png" }), asset.fileName);

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Image synthesis failed for ${asset.fileName}: ${response.status} ${errorBody}`);
  }

  const json = await response.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error(`Image synthesis response for ${asset.fileName} did not include b64_json.`);
  }

  return Buffer.from(b64, "base64");
}

async function generateAsset(asset) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: asset.prompt,
      size: asset.size,
      quality: QUALITY,
      background: asset.transparent ? "transparent" : "opaque",
      output_format: "png",
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Image generation failed for ${asset.fileName}: ${response.status} ${errorBody}`);
  }

  const json = await response.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error(`Image generation response for ${asset.fileName} did not include b64_json.`);
  }

  return Buffer.from(b64, "base64");
}

async function synthesizeSpriteSheetFromPoses(asset, outputPath) {
  const posePaths = [];
  for (const pose of asset.poses) {
    const posePath = join(POSE_RAW_DIR, `${pose.id}.png`);
    posePaths.push(posePath);

    if (SKIP_EXISTING_RAW && existsSync(posePath)) {
      console.log(`Using existing raw pose for sprite_reference_sheet:${pose.id}.`);
      continue;
    }

    console.log(`Synthesizing sprite_reference_sheet:${pose.id} with ${MODEL} (${asset.size}, ${QUALITY})...`);
    const raw = existsSync(asset.referencePath)
      ? await synthesizePoseFromReference(asset, pose)
      : await generatePose(asset, pose);
    writeFileSync(posePath, raw);
  }

  composeSpriteSheet(outputPath, asset.targetWidth, asset.targetHeight, posePaths);
}

async function synthesizePoseFromReference(asset, pose) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", composePosePrompt(pose));
  form.append("size", asset.size);
  form.append("quality", QUALITY);
  form.append("background", "transparent");
  form.append("output_format", "png");
  form.append(
    "image",
    new Blob([readFileSync(asset.referencePath)], { type: "image/png" }),
    `sprite_reference_${pose.id}.png`
  );

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Pose synthesis failed for ${pose.id}: ${response.status} ${errorBody}`);
  }

  const json = await response.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error(`Pose synthesis response for ${pose.id} did not include b64_json.`);
  }

  return Buffer.from(b64, "base64");
}

async function generatePose(asset, pose) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: composePosePrompt(pose),
      size: asset.size,
      quality: QUALITY,
      background: "transparent",
      output_format: "png",
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Pose generation failed for ${pose.id}: ${response.status} ${errorBody}`);
  }

  const json = await response.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error(`Pose generation response for ${pose.id} did not include b64_json.`);
  }

  return Buffer.from(b64, "base64");
}

function composePosePrompt(pose) {
  return [
    "Create one isolated full-body humanoid android sprite as a transparent PNG.",
    "Use the supplied reference only for material language and PRISM identity; redesign toward a more professional humanoid visual-novel game sprite if needed.",
    `Pose role: ${pose.promptRole}.`,
    "The entire body must be visible: full head, full hands, raised arms, legs, feet, and shoes with generous transparent padding on all sides.",
    "Do not crop any body part. Do not touch the image edges. Keep at least 12 percent transparent margin above, below, left, and right.",
    "Keep the pose compact and upright so all four sprites can share the same scale in a four-column sprite sheet.",
    "Middle-light PRISM visual novel/storybook rendering with refined graphite and charcoal robotic body panels.",
    "Blank face panel only: no eyes, nose, mouth, emotion, or facial detail. Leave a clear face zone for runtime ASCII overlays.",
    "Do not make the armor white. The robot body must remain graphite gray; only narrow accent strips, glow bars, and the blank face panel may be pure white or near-white so CSS can recolor those accents to each bot actor color.",
    "No labels, no text, no pose names, no background, no frame, no card, no logo, no UI.",
  ].join(" ");
}

function composeSpriteSheet(outputPath, width, height, posePaths) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const result = spawnSync(
    "python3",
    [
      "-c",
      PYTHON_SPRITE_SHEET_SCRIPT,
      outputPath,
      String(width),
      String(height),
      ...posePaths,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`Sprite sheet composition failed:\n${result.stderr || result.stdout}`);
  }
}

function deriveSpriteFallbackFromSheet(sheetPath, outputPath, width, height) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const result = spawnSync(
    "python3",
    [
      "-c",
      PYTHON_SPRITE_FALLBACK_FROM_SHEET_SCRIPT,
      sheetPath,
      outputPath,
      String(width),
      String(height),
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`Sprite fallback extraction failed:\n${result.stderr || result.stdout}`);
  }
}

function processImage(inputPath, outputPath, width, height, fit, cleanup) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const result = spawnSync(
    "python3",
    [
      "-c",
      PYTHON_RESIZE_SCRIPT,
      inputPath,
      outputPath,
      String(width),
      String(height),
      fit,
      cleanup,
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`Image processing failed for ${inputPath}:\n${result.stderr || result.stdout}`);
  }
}
