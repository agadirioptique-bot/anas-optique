import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("stock");

export default function Page() {
  return <PlaceholderPage page="stock" />;
}
