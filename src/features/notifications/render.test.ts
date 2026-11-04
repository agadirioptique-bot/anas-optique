import { describe, expect, it } from "vitest";
import { notificationView, type NotificationRow } from "./render";

// Echo translator: "<key>|<values as json>", enough to check what is passed.
const t = (key: string, values?: Record<string, string | number>) => (values ? `${key}|${JSON.stringify(values)}` : key);
const status = (s: string) => `status:${s}`;
const now = new Date("2026-11-04T12:00:00Z");
const row = (kind: string, params: Record<string, unknown>, link: string | null = null): NotificationRow => ({
  id: "n1",
  kind,
  params,
  link,
  readAt: null,
  createdAt: "2026-11-04T10:00:00Z",
});

describe("notificationView", () => {
  it("client_became_loyal → the client file", () => {
    const v = notificationView(row("client_became_loyal", { client_id: "c1", client_name: "Salma", orders: 5 }, "/clients/c1"), t, status, now);
    expect(v).toEqual({ kind: "client_became_loyal", title: "client_became_loyal.title", body: 'client_became_loyal.body|{"client":"Salma","orders":5}', href: "/clients/c1" });
  });

  it("clients_became_loyal → loyal clients", () => {
    expect(notificationView(row("clients_became_loyal", { count: 3, threshold: 5 }), t, status, now).href).toBe("/clients?segment=loyal");
  });

  it("low_stock → the stock of that location", () => {
    const v = notificationView(row("low_stock", { store_id: "s1", store_name: "Maârif", category_id: "k", category_name: "Cat A", quantity: 1, min: 2 }, "/stock"), t, status, now);
    expect(v.href).toBe("/stock?location=s1");
    expect(v.body).toBe('low_stock.body|{"category":"Cat A","store":"Maârif","quantity":1,"min":2}');
  });

  it("order_stuck → the order, with the status label and whole days", () => {
    const v = notificationView(row("order_stuck", { order_id: "o1", display_number: "CNT-00832", status: "in_workshop", since: "2026-10-30T09:00:00Z" }), t, status, now);
    expect(v.href).toBe("/orders/o1");
    expect(v.body).toBe('order_stuck.body|{"number":"CNT-00832","status":"status:in_workshop","days":5}');
  });

  it("duplicate_slip_blocked → the existing order; recurring → charges", () => {
    expect(notificationView(row("duplicate_slip_blocked", { order_id: "o2", display_number: "TSA-1" }), t, status, now).href).toBe("/orders/o2");
    expect(notificationView(row("recurring_charges_pending", { created: 2, count: 4 }), t, status, now).body).toBe('recurring_charges_pending.body|{"created":2,"count":4}');
  });

  it("unknown kinds fall back to the stored link", () => {
    expect(notificationView(row("something_new", {}, "/somewhere"), t, status, now)).toEqual({
      kind: "unknown",
      title: "unknown.title",
      body: "unknown.body",
      href: "/somewhere",
    });
  });
});
