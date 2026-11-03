import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("clientDetail");

export default function Page() {
  return <PlaceholderPage page="clientDetail" backHref="/clients" />;
}
