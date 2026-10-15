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
}
