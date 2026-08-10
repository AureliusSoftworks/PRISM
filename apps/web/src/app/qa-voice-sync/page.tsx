import { notFound } from "next/navigation";
import { VoiceSyncLab } from "./VoiceSyncLab";

export default function VoiceSyncLabPage(): React.JSX.Element {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceSyncLab />;
}
