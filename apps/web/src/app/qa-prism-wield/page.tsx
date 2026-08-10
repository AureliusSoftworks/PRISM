import { notFound } from "next/navigation";
import { PrismWieldFixture } from "./PrismWieldFixture";

export default async function PrismWieldFixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ home?: string; soft?: string; theme?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const requested = await searchParams;
  return (
    <PrismWieldFixture
      theme={requested.theme === "light" ? "light" : "dark"}
      softSynthesis={requested.soft === "1"}
      homeDocked={requested.home === "1"}
    />
  );
}
