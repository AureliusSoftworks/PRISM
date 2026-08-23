import { notFound } from "next/navigation";
import { WhodunnitFixture } from "./WhodunnitFixture";

export default async function WhodunnitFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; theory?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const requested = await searchParams;
  return (
    <WhodunnitFixture
      setupMode={requested.setup === "1"}
      theoryMode={requested.theory === "1"}
    />
  );
}
