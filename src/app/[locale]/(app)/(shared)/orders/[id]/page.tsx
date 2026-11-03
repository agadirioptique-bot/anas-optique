import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("orderDetail");

export default function Page() {
  return <PlaceholderPage page="orderDetail" backHref="/orders" />;
}
