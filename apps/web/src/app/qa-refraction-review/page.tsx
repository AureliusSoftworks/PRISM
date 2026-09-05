import { notFound } from "next/navigation";
import { RefractionReviewFixture } from "./RefractionReviewFixture";

export default async function RefractionReviewPage({ searchParams }: {
  searchParams: Promise<{ theme?: string }>;
}): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return <RefractionReviewFixture theme={params.theme === "light" ? "light" : "dark"} />;
}
