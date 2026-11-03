"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SlipCheck } from "../actions";
import type { ClientForOrder, NewOrderData } from "../data";

interface NewOrderState {
  data: NewOrderData;
  /** Existing client chosen in step 1 (pending discount, last measurements). */
  client: ClientForOrder | null;
  setClient: (c: ClientForOrder | null) => void;
  slip: SlipCheck | null;
  setSlip: (s: SlipCheck | null) => void;
  /** Prescription photo, uploaded once the order exists. */
  photo: File | null;
  setPhoto: (f: File | null) => void;
}

const Ctx = createContext<NewOrderState | null>(null);

export function NewOrderProvider({ data, children }: { data: NewOrderData; children: ReactNode }) {
  const [client, setClient] = useState<ClientForOrder | null>(data.prefillClient);
  const [slip, setSlip] = useState<SlipCheck | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  return <Ctx.Provider value={{ data, client, setClient, slip, setSlip, photo, setPhoto }}>{children}</Ctx.Provider>;
}

export function useNewOrder(): NewOrderState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNewOrder must be used inside <NewOrderProvider>");
  return v;
}
