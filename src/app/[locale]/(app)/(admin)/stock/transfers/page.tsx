import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("transfers");

export default function Page() {
  return <PlaceholderPage page="transfers" backHref="/stock" />;
}
