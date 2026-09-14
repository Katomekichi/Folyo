export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface Booking {
  id: string;
  userId: string;
  clientName: string;
  venue: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  advanceAmount: number;
  paymentStatus: PaymentStatus;
  completed: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingInput {
  clientName: string;
  venue: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  advanceAmount: number;
  notes?: string;
}
