import { api } from "@/lib/api";

export type CouponDiscountType = "PERCENTAGE" | "FIXED";

export interface EventCouponDto {
  id: string;
  tenantId: string;
  eventId: string;
  code: string;
  name: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  maxUsesPerCpf: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  ticketTypeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventCouponBody {
  code: string;
  name?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses?: number | null;
  maxUsesPerCpf?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  active?: boolean;
  ticketTypeIds?: string[];
}

export type UpdateEventCouponBody = Partial<CreateEventCouponBody>;

export async function fetchEventCoupons(eventId: string) {
  const { data } = await api.get<{ items: EventCouponDto[] }>(
    `/admin/tenants/me/events/${eventId}/coupons`,
  );
  return data.items;
}

export async function createEventCoupon(
  eventId: string,
  body: CreateEventCouponBody,
) {
  const { data } = await api.post<EventCouponDto>(
    `/admin/tenants/me/events/${eventId}/coupons`,
    body,
  );
  return data;
}

export async function updateEventCoupon(
  eventId: string,
  couponId: string,
  body: UpdateEventCouponBody,
) {
  const { data } = await api.put<EventCouponDto>(
    `/admin/tenants/me/events/${eventId}/coupons/${couponId}`,
    body,
  );
  return data;
}

export async function deleteEventCoupon(eventId: string, couponId: string) {
  const { data } = await api.delete<{ success: boolean }>(
    `/admin/tenants/me/events/${eventId}/coupons/${couponId}`,
  );
  return data;
}
