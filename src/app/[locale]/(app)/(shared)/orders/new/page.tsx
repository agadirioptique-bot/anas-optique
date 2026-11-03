import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("newOrder");

export default function Page() {
  return <PlaceholderPage page="newOrder" backHref="/orders" />;
}
