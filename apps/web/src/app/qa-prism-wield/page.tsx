import { notFound } from "next/navigation";
import { PrismWieldFixture } from "./PrismWieldFixture";

export default async function PrismWieldFixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const requestedTheme = (await searchParams).theme;
  return (
    <PrismWieldFixture
      theme={requestedTheme === "light" ? "light" : "dark"}
    />
  );
}
