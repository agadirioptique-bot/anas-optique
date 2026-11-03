import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";
import { userPage } from "@/features/auth/guards";

export const generateMetadata = pageMetadata("clientDetail");

export default userPage(function Page() {
  return <PlaceholderPage page="clientDetail" backHref="/clients" />;
});
