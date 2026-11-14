import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectDbError, hasDbEnv, setupFixtures, type Fixtures } from "./fixtures";

/** Secretary → admin WhatsApp: numbers on accounts, set by super admins, read through admin_contacts(). */
describe.skipIf(!hasDbEnv)("admin WhatsApp numbers", () => {
  let f: Fixtures;
  const number = `+2126${String(Date.now()).slice(-8)}`;

  beforeAll(async () => {
    f = await setupFixtures();
  });

  afterAll(async () => {
    await f?.admin.rpc("set_user_whatsapp", { p_user_id: f.adminId, p_phone: null as unknown as string });
    await f?.cleanup();
  });

  it("only a super admin sets a number, and only a valid E.164 one", async () => {
    expectDbError((await f.secretary.rpc("set_user_whatsapp", { p_user_id: f.secretaryId, p_phone: number })).error, "FORBIDDEN");
    expectDbError((await f.admin.rpc("set_user_whatsapp", { p_user_id: f.adminId, p_phone: "0612" })).error, "INVALID_INPUT");

    expect((await f.admin.rpc("set_user_whatsapp", { p_user_id: f.adminId, p_phone: number })).error).toBeNull();
    const { data } = await f.service.from("profiles").select("whatsapp_e164").eq("id", f.adminId).single();
    expect(data?.whatsapp_e164).toBe(number);

    const { data: users } = await f.admin.rpc("admin_list_users");
    expect(users?.find((u) => u.id === f.adminId)?.whatsapp_e164).toBe(number);
  });

  it("a secretary sees active super admins with a number: id, name and number only", async () => {
    const { data, error } = await f.secretary.rpc("admin_contacts");
    expect(error).toBeNull();
    const me = data!.find((c) => c.id === f.adminId);
    expect(me).toEqual({ id: f.adminId, full_name: "Test Super Admin", whatsapp_e164: number });
    expect(data!.some((c) => c.id === f.secretaryId)).toBe(false);

    const { data: profiles } = await f.service.from("profiles").select("id, role, is_active, whatsapp_e164").in("id", data!.map((c) => c.id));
    for (const p of profiles ?? []) expect(p).toMatchObject({ role: "super_admin", is_active: true });
    expect(profiles!.every((p) => p.whatsapp_e164)).toBe(true);
  });

  it("the caller is never in their own list", async () => {
    const { data } = await f.admin.rpc("admin_contacts");
    expect(data!.some((c) => c.id === f.adminId)).toBe(false);
  });

  it("clearing the number removes the admin from the list", async () => {
    expect((await f.admin.rpc("set_user_whatsapp", { p_user_id: f.adminId, p_phone: null as unknown as string })).error).toBeNull();
    const { data } = await f.secretary.rpc("admin_contacts");
    expect(data!.some((c) => c.id === f.adminId)).toBe(false);
  });
});
