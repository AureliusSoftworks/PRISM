import { notFound } from "next/navigation";
import { WhodunnitFixture } from "./WhodunnitFixture";

export default function WhodunnitFixturePage(): React.JSX.Element {
  if (process.env.NODE_ENV === "production") notFound();
  return <WhodunnitFixture />;
}
