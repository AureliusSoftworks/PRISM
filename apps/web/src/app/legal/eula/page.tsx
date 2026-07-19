import type { Metadata } from "next";

import { EulaStandalone } from "../../EulaAgreement";

export const metadata: Metadata = {
  title: "PRISM End User License Agreement",
  description: "PRISM End User License Agreement and AI Notice.",
};

export default function EulaPage(): React.JSX.Element {
  return <EulaStandalone />;
}
