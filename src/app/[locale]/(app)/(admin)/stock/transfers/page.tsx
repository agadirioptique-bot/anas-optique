import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";
import { superAdminPage } from "@/features/auth/guards";

export const generateMetadata = pageMetadata("transfers");

export default superAdminPage(function Page() {
  return <PlaceholderPage page="transfers" backHref="/stock" />;
});
