export const BOOKING_REPLIES_SYNC = Symbol("BOOKING_REPLIES_SYNC");

export interface BookingRepliesSyncPort {
  sync(artistId: string): Promise<{ created: number }>;
}
