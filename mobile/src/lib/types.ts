/** What /api/customer/catalog returns: everything a customer may book. */
export interface Catalog {
  services: Service[];
  barbers: {
    id: string;
    name: string;
    bio: string | null;
    photo: string | null;
    serviceIds: string[];
    work: string[];
    rating: { average: number | null; count: number };
  }[];
  offers: { id: string; title: string; titleAr: string | null; price: number | null; wasPrice: number | null }[];
  booking: {
    onlineBookingEnabled: boolean;
    maxDaysAhead: number;
    minNoticeMinutes: number;
    cancelWindowMinutes: number;
    timezone: string;
  };
}

export interface Service {
  id: string;
  name: string;
  arabicName: string | null;
  defaultPrice: number;
  durationMinutes: number;
}

/** What /api/customer/me returns. */
export interface Me {
  id: string;
  name: string;
  phone: string;
  photo: string | null;
  birthday: string | null;
  visitCount: number;
  upcomingCount: number;
  loyalty: Loyalty | null;
}

/** The punch card, from /api/customer/me, while the shop runs one. */
export interface Loyalty {
  stamps: number;
  toNext: number;
  available: number;
  visitsRequired: number;
  rewardText: string;
  rewardTextAr: string | null;
}

/** Their habit, from /api/customer/usual, with free times near their hour. */
export interface Usual {
  barber: { id: string; name: string; photo: string | null } | null;
  services: Service[];
  durationMinutes: number;
  price: number;
  times: string[];
}

/** One past haircut, from /api/customer/visits. */
export interface Visit {
  id: string;
  visitAt: string;
  total: number;
  barber: { id: string; name: string; photo: string | null } | null;
  rating: number | null;
  services: { name: string | null; arabicName: string | null; quantity: number; price: number }[];
  products: { name: string; quantity: number }[];
}

/** A cut that can be (or has been) rated, from /api/customer/reviews. */
export interface Reviewable {
  /** A booking, or a walk-in's visit — one of the two. */
  appointmentId: string | null;
  visitId: string | null;
  startAt: string;
  barber: { id: string; name: string; photo: string | null } | null;
  services: string[];
  canReview: boolean;
  review: { rating: number; comment: string | null; createdAt: string } | null;
}

/** One visit told as the customer's receipt, from /api/customer/visits/:id. */
export interface Receipt {
  id: string;
  receiptNo: string;
  visitAt: string;
  total: number;
  barber: { name: string } | null;
  rating: number | null;
  services: { name: string | null; arabicName: string | null; quantity: number; price: number }[];
  products: { name: string; quantity: number; total: number }[];
  shop: { name: string; phone: string | null };
}
