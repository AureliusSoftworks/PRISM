import { notFound } from "next/navigation";
import { WhodunnitFixture } from "./WhodunnitFixture";
import { WhodunnitV2Fixture } from "./WhodunnitV2Fixture";

export default async function WhodunnitFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; theory?: string; v2?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const requested = await searchParams;
  if (requested.v2 === "1") return <WhodunnitV2Fixture />;
  return (
    <WhodunnitFixture
      setupMode={requested.setup === "1"}
      theoryMode={requested.theory === "1"}
    />
  );
}
