import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BotGlyphCategoryId =
  | "original"
  | "core"
  | "tools"
  | "tech"
  | "nature"
  | "animals"
  | "celestial"
  | "food"
  | "travel"
  | "shapes"
  | "sports"
  | "music"
  | "objects"
  | "symbols"
  | "time";

interface LucideGlyphGroup {
  id: Exclude<BotGlyphCategoryId, "original">;
  label: string;
  icons: readonly string[];
}

export interface LucideBotGlyphDefinition {
  label: string;
  category: BotGlyphCategoryId;
  icon: LucideIcon;
}

const iconComponents = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
const fallbackIcon = LucideIcons.CircleHelp as LucideIcon;

function icons(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function glyphIdForIcon(iconName: string): string {
  return `lucide${iconName}`;
}

function labelForIcon(iconName: string): string {
  return iconName
    // Strip trailing variant digits (Clock1-12, Music2-4, Volume1-2, Dice1-6,
    // etc.) so tooltips don't surface internal Lucide variant suffixes; the
    // visual glyph still distinguishes variants in the picker.
    .replace(/(\D)\d+$/, "$1")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bXml\b/g, "XML")
    .replace(/\bCpu\b/g, "CPU")
    .replace(/\bUsb\b/g, "USB")
    .replace(/\bNfc\b/g, "NFC")
    .replace(/\bCctv\b/g, "CCTV")
    .replace(/\bId\b/g, "ID")
    .replace(/\bWifi\b/g, "Wi-Fi");
}

export const LUCIDE_BOT_GLYPH_GROUPS: readonly LucideGlyphGroup[] = [
  {
    id: "core",
    label: "Core",
    icons: icons(`
      Accessibility Activity BadgeCheck BadgeHelp BadgeInfo CircleAlert CircleCheck CircleDashed
      CircleDot CircleEllipsis CircleEqual CircleGauge CircleHelp CircleOff CircleSlash CircleUser
      CircleX Clover Crosshair Drama Fingerprint Focus Goal HandHeart HeartHandshake IdCard
      Landmark LifeBuoy Medal Orbit Paintbrush2 Palette Scan Search Sparkles UserRound UsersRound
      Workflow Zap
    `),
  },
  {
    id: "tools",
    label: "Tools",
    icons: icons(`
      Anvil Archive Backpack Ban BookOpen Bookmark Briefcase Brush Clipboard ClipboardCheck
      ClipboardList ClipboardPen Code CodeXml Cog Compass DraftingCompass Eraser FilePen
      FileText FolderOpen Hammer HandHelping HardHat Highlighter KeyRound Keyboard Library
      Magnet Map Notebook PenLine Pencil Ruler Scissors Scroll SearchCheck ShieldCheck
      SquarePen Stamp StickyNote Wrench
    `),
  },
  {
    id: "tech",
    label: "Tech",
    icons: icons(`
      Airplay Antenna AppWindow AudioLines Barcode Bluetooth Bot Cable Camera Cctv ChartBar
      ChartLine ChartNoAxesCombined CircuitBoard CloudCog CloudDownload CloudUpload Code2 Cpu
      Database FileCode Gauge HardDrive Headphones Keyboard Laptop Microchip Monitor MousePointer
      Network Nfc PanelTop Plug Router Satellite Server Smartphone Tablet Terminal Usb Wifi
    `),
  },
  {
    id: "nature",
    label: "Nature",
    icons: icons(`
      CloudDrizzle CloudFog CloudHail CloudLightning CloudMoon CloudRain CloudSnow CloudSun
      Droplets Earth Eclipse Flame Flower Flower2 Leaf Mountain MountainSnow Rainbow Shell
      Snowflake Sprout SunDim Sunrise Sunset Thermometer TreeDeciduous TreePalm Trees Tornado
      Umbrella Waves Wind
    `),
  },
  {
    id: "animals",
    label: "Animals",
    icons: icons(`
      Baby Bug Cat Dog Fish PawPrint Rabbit Rat Shell Snail Squirrel Turtle Worm Bird Bone Egg
      Feather FishSymbol Footprints Origami
    `),
  },
  {
    id: "celestial",
    label: "Celestial",
    icons: icons(`
      CloudMoon CloudSun Eclipse Moon MoonStar Orbit Rocket Satellite Sparkle Star Sun Telescope
      WandSparkles
    `),
  },
  {
    id: "food",
    label: "Food",
    icons: icons(`
      Apple Beef Beer Cake Carrot Cherry Citrus Coffee Croissant CupSoda Dessert
      Donut Drumstick Egg Fish Grape Ham IceCreamBowl Martini Milk Pizza Popcorn Salad Sandwich
      Soup Utensils Wine
    `),
  },
  {
    id: "travel",
    label: "Travel",
    icons: icons(`
      Anchor Bike Bus CableCar Car Caravan CircleParking Compass FerrisWheel Flag Footprints Fuel
      House Map MapPin Navigation Plane Sailboat Ship Signpost Tent Tickets Train TramFront
      TreePalm Umbrella Warehouse
    `),
  },
  {
    id: "shapes",
    label: "Shapes",
    icons: icons(`
      Badge Circle CircleDot CircleOff CircleSlash Diamond Gem Hexagon Octagon Pentagon Shapes
      Square Squircle Star Triangle BadgeCheck BadgeX Boxes Box CircleDashed Component Cuboid
      Cylinder Dice1 Dice2 Dice3 Dice4 Dice5 Dice6
    `),
  },
  {
    id: "sports",
    label: "Sports",
    icons: icons(`
      Badge Trophy Dumbbell Goal Medal Bike BicepsFlexed Waves PersonStanding Footprints
      CircleGauge Crown Flag Mountain Target Timer Volleyball
    `),
  },
  {
    id: "music",
    label: "Music",
    icons: icons(`
      Album AudioLines Bell Drum Guitar Headphones Mic Music Music2 Music3 Music4 Piano Radio
      Volume Volume1 Volume2
    `),
  },
  {
    id: "objects",
    label: "Objects",
    icons: icons(`
      Armchair Backpack Badge DollarSign Banknote Bed Bell BookOpen Briefcase Building2 Cake
      CircleDollarSign Clock Coffee Coins Contact CreditCard DoorOpen Fence Gift Glasses Handbag
      Heart House Image Lamp Landmark Mailbox Package Paperclip PiggyBank Receipt Refrigerator
      RockingChair Sofa Store Wallet
    `),
  },
  {
    id: "symbols",
    label: "Symbols",
    icons: icons(`
      Ampersand Asterisk AtSign Binary Braces Brackets Check CheckCheck CirclePercent Divide
      Equal Hash Infinity IterationCcw IterationCw List Minus Omega Parentheses Percent Pi Plus
      Radical Sigma Slash SquareAsterisk Tally5 X
    `),
  },
  {
    id: "time",
    label: "Time",
    icons: icons(`
      AlarmClock Calendar CalendarCheck CalendarClock CalendarDays Clock Clock1 Clock2 Clock3
      Clock4 Clock5 Clock6 Clock7 Clock8 Clock9 Clock10 Clock11 Clock12 History Hourglass Timer
      TimerReset Watch
    `),
  },
];

const seenIconIds = new Set<string>();

export const LUCIDE_BOT_GLYPH_ORDER = LUCIDE_BOT_GLYPH_GROUPS.flatMap((group) =>
  group.icons.flatMap((iconName) => {
    const id = glyphIdForIcon(iconName);
    if (seenIconIds.has(id)) return [];
    seenIconIds.add(id);
    return [id];
  })
);

export const LUCIDE_BOT_GLYPHS: Record<string, LucideBotGlyphDefinition> =
  Object.fromEntries(
    LUCIDE_BOT_GLYPH_GROUPS.flatMap((group) =>
      group.icons.flatMap((iconName) => {
        const id = glyphIdForIcon(iconName);
        const label = labelForIcon(iconName);
        const icon = iconComponents[iconName] ?? fallbackIcon;
        return [[id, { label, category: group.id, icon }]];
      })
    )
  );
