import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";
import { userPage } from "@/features/auth/guards";

export const generateMetadata = pageMetadata("notifications");

export default userPage(function Page() {
  return <PlaceholderPage page="notifications" />;
});
