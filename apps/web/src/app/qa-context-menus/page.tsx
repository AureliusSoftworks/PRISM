import { notFound } from "next/navigation";
import { ContextMenuFixtureGallery } from "./ContextMenuFixtureGallery";

export default function ContextMenuFixturesPage(): React.JSX.Element {
  if (process.env.NODE_ENV === "production") notFound();
  return <ContextMenuFixtureGallery />;
}
