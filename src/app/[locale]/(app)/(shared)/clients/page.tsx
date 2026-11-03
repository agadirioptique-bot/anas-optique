import { pageMetadata } from "@/components/shared/placeholder-page";
import { userPage } from "@/features/auth/guards";
import { ClientsPage } from "@/features/clients/components/clients-page";
import { getClientDirectory } from "@/features/clients/queries";
import { directorySearchSchema } from "@/features/clients/schemas";

export const generateMetadata = pageMetadata("clients");

export default userPage(async function Page({ searchParams }: PageProps<"/[locale]/clients">) {
  const filters = directorySearchSchema.parse(await searchParams);
  const data = await getClientDirectory(filters);
  return <ClientsPage data={data} filters={filters} />;
});
