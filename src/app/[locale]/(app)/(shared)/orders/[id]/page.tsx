import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";
import { userPage } from "@/features/auth/guards";

export const generateMetadata = pageMetadata("orderDetail");

export default userPage(function Page() {
  return <PlaceholderPage page="orderDetail" backHref="/orders" />;
});
