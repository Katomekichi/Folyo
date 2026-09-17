export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface TeamMember {
  id: string;
  name: string;
  amount: number;
}

export interface TeamMemberInput {
  name: string;
  amount: number;
}

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
  travelExpense: number;
  paymentStatus: PaymentStatus;
  completed: boolean;
  notes: string | null;
  teamMembers: TeamMember[];
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
  travelExpense?: number;
  notes?: string;
  teamMembers?: TeamMemberInput[];
}

export interface BookingRequest {
  id: string;
  userId: string;
  status: 'pending' | 'confirmed' | 'rejected';
  clientName: string;
  clientContact: string;
  clientEmail: string | null;
  venue: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  totalAmount: number | null;
  advanceAmount: number | null;
  notes: string | null;
  createdAt: string;
}
