import { pageMetadata } from "@/components/shared/placeholder-page";
import { superAdminPage } from "@/features/auth/guards";
import { ChargesPage } from "@/features/charges/components/charges-page";
import { periodRange } from "@/features/charges/lib";
import { getBusinessToday, getChargeReference, getCharges, getChargeTotals, getPendingCharges, getRecurringCharges } from "@/features/charges/queries";
import { chargeFiltersSchema } from "@/features/charges/schemas";

export const generateMetadata = pageMetadata("charges");

export default superAdminPage(async function Page({ searchParams }: PageProps<"/[locale]/charges">) {
  const filters = chargeFiltersSchema.parse(await searchParams);
  const range = periodRange(filters.period, await getBusinessToday(), { from: filters.from, to: filters.to });
  const [charges, totals, pending, recurring, reference] = await Promise.all([
    getCharges(filters, range),
    getChargeTotals(filters, range),
    getPendingCharges(),
    getRecurringCharges(),
    getChargeReference(),
  ]);
  return <ChargesPage filters={filters} range={range} charges={charges} totals={totals} pending={pending} recurring={recurring} reference={reference} />;
});
