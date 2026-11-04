import { pageMetadata } from "@/components/shared/placeholder-page";
import { userPage } from "@/features/auth/guards";
import { NotificationsPage } from "@/features/notifications/components/notifications-page";
import { getNotifications } from "@/features/notifications/queries";

export const generateMetadata = pageMetadata("notifications");

export default userPage(async function Page({ searchParams }: PageProps<"/[locale]/notifications">) {
  const unreadOnly = (await searchParams).filter === "unread";
  return <NotificationsPage items={await getNotifications({ unreadOnly })} unreadOnly={unreadOnly} />;
});
