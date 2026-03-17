export type Role = 'Manager' | 'Host' | 'Server';

export interface User {
  id: string;
  name: string;
  role: Role;
  branchIds: string[]; // Branches this user has access to
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  cancellationFeeFixed: number | null;
  cancellationFeePercent: number | null;
}

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'combined';

export interface Table {
  id: string;
  branchId: string;
  number: string;
  capacity: number;
  status: TableStatus;
  assignedServerId?: string;
  currentReservationId?: string;
  seatedAt?: string; // ISO string
  x: number; // For floor plan positioning
  y: number; // For floor plan positioning
  shape: 'circle' | 'square' | 'rectangle';
}

export interface Guest {
  id: string;
  name: string;
  phone: string;
  email: string;
  visitCount: number;
  loyaltyStatus: 'Standard' | 'VIP';
  dietaryRestrictions: string[];
  favoriteTable?: string;
  notes: string;
}

export type ReservationStatus = 'upcoming' | 'seated' | 'completed' | 'cancelled' | 'no-show';

export interface Reservation {
  id: string;
  branchId: string;
  guestId: string;
  partySize: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: ReservationStatus;
  tableId?: string;
  notes?: string;
  cancellationFeeApplied?: number;
  createdAt: string; // ISO string
}

export interface WaitlistEntry {
  id: string;
  branchId: string;
  guestId: string;
  partySize: number;
  quotedWaitTimeMins: number;
  joinedAt: string; // ISO string
  status: 'waiting' | 'seated' | 'abandoned';
  notes?: string;
}
