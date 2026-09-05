export const DEBATE_TERRITORY_CATALOG = [
  "Housing affordability around public transit",
  "Whether art can be separated from its creator",
  "The four-day workweek",
  "Right-to-repair laws for consumer technology",
  "Smartphone restrictions in schools",
  "Universal basic income in an automated economy",
  "Public ownership of essential digital infrastructure",
  "Urban density versus neighborhood preservation",
  "AI-generated art and human authorship",
  "Social-media age limits",
  "Remote work and the future of city centers",
  "Nuclear power in the clean-energy transition",
  "Private companies in space exploration",
  "The role of standardized testing in education",
  "Congestion pricing in major cities",
  "Government subsidies for local journalism",
  "The ethics of predictive policing",
  "Open-source software in public institutions",
  "Mandatory national or community service",
  "Animal welfare standards in industrial farming",
  "The preservation of controversial public monuments",
  "Professional sports teams and public funding",
  "The cultural value of physical media",
  "Four-year degrees versus vocational education",
  "Tourism limits in fragile destinations",
  "Personal privacy versus public safety",
  "The ownership of genetic information",
  "Automation taxes for companies replacing human labor",
  "Ranked-choice voting in national elections",
  "The responsibilities of social-media platforms",
  "Public access to scientific research",
  "The future of cash in a digital economy",
  "Intergenerational responsibility for climate policy",
  "The boundary between satire and misinformation",
  "Whether museums should return contested artifacts",
  "The use of performance-enhancing technology in sports",
] as const;

function normalizedTerritory(value: string): string {
  return value.trim().toLowerCase();
}

export function randomDebateTerritory(
  currentTerritory: string,
  random: () => number = Math.random,
): string {
  const current = normalizedTerritory(currentTerritory);
  const candidates = DEBATE_TERRITORY_CATALOG.filter(
    (territory) => normalizedTerritory(territory) !== current,
  );
  const roll = random();
  const boundedRoll = Number.isFinite(roll)
    ? Math.min(0.999_999, Math.max(0, roll))
    : 0;
  return (
    candidates[Math.floor(boundedRoll * candidates.length)] ??
    DEBATE_TERRITORY_CATALOG[0]
  );
}
