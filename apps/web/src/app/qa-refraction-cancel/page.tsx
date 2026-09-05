import { notFound } from "next/navigation";
import { RefractionCancelFixture } from "./RefractionCancelFixture";

export default async function RefractionCancelPage({ searchParams }: {
  searchParams: Promise<{ theme?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const { theme } = await searchParams;
  return <RefractionCancelFixture theme={theme === "light" ? "light" : "dark"} />;
}
