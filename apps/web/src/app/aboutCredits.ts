export type AboutCreditGroupId =
  | "frameworks"
  | "services"
  | "assets"
  | "tooling";

export interface AboutCredit {
  id: string;
  name: string;
  description: string;
  href?: string;
  license?: string;
  /** Direct packages represented by this visible credit. Kept for coverage tests. */
  packageNames?: readonly string[];
  /** Direct Tauri/Rust crates represented by this visible credit. */
  cargoPackageNames?: readonly string[];
}

export interface AboutCreditGroup {
  id: AboutCreditGroupId;
  title: string;
  description: string;
  credits: readonly AboutCredit[];
}

/**
 * Settings > About is PRISM's living attribution surface.
 *
 * Add every new direct framework/package here. Also add manually sourced
 * services, datasets, fonts, sounds, images, or other external assets even
 * when they do not appear in a package manifest.
 */
export const ABOUT_CREDIT_GROUPS: readonly AboutCreditGroup[] = [
  {
    id: "frameworks",
    title: "Frameworks & libraries",
    description: "The open-source foundations used by the app itself.",
    credits: [
      {
        id: "next",
        name: "Next.js",
        description: "Web application framework and production renderer.",
        href: "https://nextjs.org/",
        license: "MIT",
        packageNames: ["next", "eslint-config-next"],
      },
      {
        id: "react",
        name: "React",
        description: "Interface component and DOM rendering system.",
        href: "https://react.dev/",
        license: "MIT",
        packageNames: [
          "react",
          "react-dom",
          "@types/react",
          "@types/react-dom",
        ],
      },
      {
        id: "typescript",
        name: "TypeScript & DefinitelyTyped",
        description: "Typed application code and community type definitions.",
        href: "https://www.typescriptlang.org/",
        license: "Apache-2.0 / MIT",
        packageNames: ["typescript", "@types/node"],
      },
      {
        id: "tauri",
        name: "Tauri",
        description:
          "Native desktop shell, single-instance lifecycle, windows, menus, and system integration.",
        href: "https://tauri.app/",
        license: "Apache-2.0 / MIT",
        packageNames: ["@tauri-apps/cli"],
        cargoPackageNames: [
          "tauri",
          "tauri-build",
          "tauri-plugin-single-instance",
        ],
      },
      {
        id: "tiptap",
        name: "Tiptap",
        description: "Structured rich-text editing and Markdown conversion in Slate.",
        href: "https://tiptap.dev/",
        license: "MIT",
        packageNames: [
          "@tiptap/extension-link",
          "@tiptap/extension-placeholder",
          "@tiptap/markdown",
          "@tiptap/react",
          "@tiptap/starter-kit",
        ],
      },
      {
        id: "markdown",
        name: "react-markdown & remark-gfm",
        description: "Safe Markdown rendering with GitHub-Flavored Markdown support.",
        href: "https://github.com/remarkjs/react-markdown",
        license: "MIT",
        packageNames: ["react-markdown", "remark-gfm"],
      },
      {
        id: "pixi",
        name: "PixiJS",
        description: "Accelerated 2D graphics for expressive applet presentation.",
        href: "https://pixijs.com/",
        license: "MIT",
        packageNames: ["pixi.js"],
      },
      {
        id: "mediabunny",
        name: "MediaBunny",
        description: "Browser-side media reading, writing, and conversion.",
        href: "https://mediabunny.dev/",
        license: "MPL-2.0",
        packageNames: ["mediabunny"],
      },
      {
        id: "sharp",
        name: "Sharp",
        description: "High-performance image inspection and transformation.",
        href: "https://sharp.pixelplumbing.com/",
        license: "Apache-2.0",
        packageNames: ["sharp"],
      },
      {
        id: "transformers",
        name: "Transformers.js",
        description: "Local machine-learning inference through Hugging Face runtimes.",
        href: "https://huggingface.co/docs/transformers.js/",
        license: "Apache-2.0",
        packageNames: ["@huggingface/transformers"],
      },
      {
        id: "kokoro",
        name: "Kokoro.js & Kokoro-82M",
        description:
          "Instant offline speech and the 28 portable English voice archetypes bundled with PRISM.",
        href: "https://github.com/hexgrad/kokoro",
        license: "Apache-2.0 · model revision and checksums recorded",
        packageNames: ["kokoro-js"],
      },
      {
        id: "phonemizer",
        name: "phonemizer.js & eSpeak NG",
        description: "Text-to-phoneme conversion for portable speech synthesis.",
        href: "https://github.com/xenova/phonemizer.js",
        license: "Apache-2.0",
        packageNames: ["phonemizer"],
      },
      {
        id: "soundtouch",
        name: "SoundTouchJS formant worklet",
        description: "Pitch shifting with formant-preserving voice correction.",
        href: "https://github.com/cutterbl/SoundTouchJS",
        license: "MPL-2.0 · notice bundled",
        packageNames: ["@soundtouchjs/formant-correction-worklet"],
      },
      {
        id: "lucide",
        name: "Lucide",
        description: "Interface icon library.",
        href: "https://lucide.dev/",
        license: "ISC",
        packageNames: ["lucide-react"],
      },
      {
        id: "documents",
        name: "docx",
        description: "Portable Word document generation.",
        href: "https://docx.js.org/",
        license: "MIT",
        packageNames: ["docx"],
      },
      {
        id: "compression",
        name: "fflate",
        description: "Fast browser and server compression for portable exports.",
        href: "https://github.com/101arrowz/fflate",
        license: "MIT",
        packageNames: ["fflate"],
      },
      {
        id: "qrcode",
        name: "node-qrcode",
        description: "QR code generation for device and connection handoffs.",
        href: "https://github.com/soldair/node-qrcode",
        license: "MIT",
        packageNames: ["qrcode", "@types/qrcode"],
      },
      {
        id: "dnssd",
        name: "dnssd-advertise",
        description: "Local-network service discovery through Bonjour DNS-SD.",
        href: "https://github.com/kitten/dnssd-advertise",
        license: "MIT",
        packageNames: ["dnssd-advertise"],
      },
      {
        id: "rust-foundations",
        name: "Serde, url, libc & objc2",
        description:
          "Serialization, URL handling, and native operating-system bindings for Tauri.",
        href: "https://www.rust-lang.org/",
        license: "Apache-2.0 / MIT",
        cargoPackageNames: [
          "serde",
          "serde_json",
          "url",
          "libc",
          "objc2",
          "objc2-app-kit",
        ],
      },
    ],
  },
  {
    id: "services",
    title: "Engines & connected resources",
    description: "Local engines and optional services PRISM can connect to.",
    credits: [
      {
        id: "node",
        name: "Node.js",
        description: "Server runtime and desktop application service layer.",
        href: "https://nodejs.org/",
      },
      {
        id: "sqlite",
        name: "SQLite",
        description: "Private local account, conversation, and applet storage.",
        href: "https://www.sqlite.org/",
        license: "Public domain",
      },
      {
        id: "qdrant-service",
        name: "Qdrant",
        description: "Local semantic index used by the memory engine.",
        href: "https://qdrant.tech/",
        license: "Apache-2.0",
      },
      {
        id: "ollama",
        name: "Ollama",
        description:
          "Local model discovery and inference, plus optional authenticated Ollama Cloud models.",
        href: "https://ollama.com/",
      },
      {
        id: "comfyui",
        name: "ComfyUI",
        description: "Optional local image workflows and checkpoints.",
        href: "https://github.com/comfyanonymous/ComfyUI",
        license: "GPL-3.0",
      },
      {
        id: "openai",
        name: "OpenAI",
        description: "Optional online language, image, and tool-capable models.",
        href: "https://openai.com/",
      },
      {
        id: "anthropic",
        name: "Anthropic",
        description: "Optional online Claude language models.",
        href: "https://www.anthropic.com/",
      },
      {
        id: "elevenlabs",
        name: "ElevenLabs",
        description: "Optional Premium voices, sound effects, music, and generated media.",
        href: "https://elevenlabs.io/",
      },
      {
        id: "brave-search",
        name: "Brave Search API",
        description: "Optional real-source web research for connected features.",
        href: "https://brave.com/search/api/",
      },
      {
        id: "docker",
        name: "Docker",
        description: "Self-hosted service orchestration and reproducible deployment.",
        href: "https://www.docker.com/",
      },
      {
        id: "nginx",
        name: "NGINX",
        description: "LAN ingress and reverse proxy for self-hosted builds.",
        href: "https://nginx.org/",
        license: "BSD-2-Clause",
      },
    ],
  },
  {
    id: "assets",
    title: "Art, audio & reference assets",
    description: "The visible and audible materials that give PRISM its character.",
    credits: [
      {
        id: "prism-originals",
        name: "Original PRISM production",
        description:
          "Interface art, stage sets, bot frames, illustrations, wallpapers, animations, and bundled audio authored and curated for PRISM by Aurelius Games LLC.",
        license: "© Aurelius Games LLC",
      },
      {
        id: "voice-asset-manifest",
        name: "PRISM voice asset manifest",
        description:
          "Machine-readable source revisions, checksums, licenses, redistribution rights, commercial-use status, and consent provenance for packaged voice assets.",
        license: "Packaged with each desktop runtime",
      },
      {
        id: "generated-assets",
        name: "Generated production assets",
        description:
          "Selected imagery, voices, music, foley, and UI earcons generated through PRISM's connected OpenAI and ElevenLabs tools, then reviewed and integrated in-house.",
      },
      {
        id: "the-midnight-clue",
        name: "The Midnight Clue",
        description:
          "Bundled instrumental music bed for Whodunnit mansion investigation, supplied and curated for PRISM.",
        license: "PRISM production asset",
      },
      {
        id: "prism-mansion-acoustics",
        name: "PRISM Mansion Acoustics",
        description:
          "Locally produced, clue-neutral Opus atmosphere fixtures and the content-addressed acoustic-template system used by Whodunnit mansions.",
        license: "PRISM production asset",
      },
      {
        id: "troll-rickroll",
        name: "Never Gonna Give You Up — Rick Astley",
        description:
          "A short lyrical hook and canonical music-video link power Troll's rare Rickroll gag; the full lyrics and recording are not bundled.",
        href: "https://youtu.be/dQw4w9WgXcQ",
        license: "Copyright retained by the respective rights holders",
      },
      {
        id: "subtlex",
        name: "SUBTLEX-US word frequencies",
        description:
          "Spoken-English frequency corpus used by composer language assistance.",
        href: "https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus",
        license: "Corpus credit · package ISC",
        packageNames: ["subtlex-word-frequencies"],
      },
      {
        id: "natural-earth",
        name: "Natural Earth",
        description:
          "Public-domain land geometry used by the georeferenced Accent Map.",
        href: "https://www.naturalearthdata.com/",
        license: "Public domain",
      },
      {
        id: "google-fonts",
        name: "Bundled Google Fonts",
        description:
          "Open Font License typefaces used throughout PRISM, including the Macondo avatar face.",
        href: "https://fonts.google.com/",
        license: "SIL Open Font License",
      },
      {
        id: "unicode",
        name: "Unicode",
        description: "Emoji and character standards rendered through each operating system.",
        href: "https://home.unicode.org/",
      },
    ],
  },
  {
    id: "tooling",
    title: "Development & quality tools",
    description: "Tools used to build, test, inspect, and maintain PRISM.",
    credits: [
      {
        id: "playwright",
        name: "Playwright",
        description: "Browser automation, visual checks, and integration testing.",
        href: "https://playwright.dev/",
        license: "Apache-2.0",
        packageNames: ["playwright", "@playwright/test"],
      },
      {
        id: "eslint",
        name: "ESLint",
        description: "JavaScript and TypeScript static analysis.",
        href: "https://eslint.org/",
        license: "MIT",
        packageNames: ["eslint"],
      },
      {
        id: "wikiwiki",
        name: "Wikiwiki",
        description: "Agent-maintained living repository documentation.",
        href: "https://github.com/Thjodann/Wikiwiki",
        license: "MIT",
        packageNames: ["@thjodann/wk"],
      },
    ],
  },
] as const;

export const ABOUT_CREDIT_MAINTENANCE_NOTE =
  "Credits are a living part of PRISM and are updated whenever new frameworks, connected services, datasets, fonts, sounds, images, or other external assets enter the project.";
