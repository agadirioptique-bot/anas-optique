import { pageMetadata, PlaceholderPage } from "@/components/shared/placeholder-page";

export const generateMetadata = pageMetadata("dashboard");

export default function Page() {
  return <PlaceholderPage page="dashboard" />;
}
