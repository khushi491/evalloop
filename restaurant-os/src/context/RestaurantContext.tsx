"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  Branch,
  User,
  Table,
  Guest,
  Reservation,
  WaitlistEntry,
} from "../types";

// Mock Data Seed
const mockBranches: Branch[] = [
  { id: "b1", name: "Downtown Prime", address: "123 Main St", cancellationFeeFixed: 50, cancellationFeePercent: null },
  { id: "b2", name: "Uptown Grill", address: "456 High St", cancellationFeeFixed: null, cancellationFeePercent: 10 },
];

const mockUsers: User[] = [
  { id: "u1", name: "Sarah Connor (Manager)", role: "Manager", branchIds: ["b1", "b2"] },
  { id: "u2", name: "John Smith (Host)", role: "Host", branchIds: ["b1"] },
  { id: "u3", name: "Emily Davis (Server)", role: "Server", branchIds: ["b1"] },
];

const mockTables: Table[] = [
  // Downtown Prime (b1) - Top row
  { id: "t1", branchId: "b1", number: "101", capacity: 2, status: "available", x: 100, y: 100, shape: "square" },
  { id: "t2", branchId: "b1", number: "102", capacity: 2, status: "occupied", seatedAt: new Date(Date.now() - 45 * 60000).toISOString(), assignedServerId: "u3", x: 250, y: 100, shape: "square" },
  { id: "t3", branchId: "b1", number: "103", capacity: 4, status: "reserved", x: 400, y: 100, shape: "rectangle" },
  // Downtown Prime (b1) - Middle row
  { id: "t4", branchId: "b1", number: "201", capacity: 4, status: "cleaning", x: 100, y: 250, shape: "circle" },
  { id: "t5", branchId: "b1", number: "202", capacity: 6, status: "available", x: 300, y: 250, shape: "rectangle" },
  // Downtown Prime (b1) - Bottom row
  { id: "t6", branchId: "b1", number: "301", capacity: 2, status: "occupied", seatedAt: new Date(Date.now() - 10 * 60000).toISOString(), x: 100, y: 400, shape: "square" },
  
  // Uptown Grill (b2)
  { id: "t10", branchId: "b2", number: "1", capacity: 2, status: "available", x: 150, y: 150, shape: "circle" },
];

const mockGuests: Guest[] = [
  { id: "g1", name: "Alice Johnson", phone: "555-0100", email: "alice@example.com", visitCount: 5, loyaltyStatus: "VIP", dietaryRestrictions: ["Gluten-Free"], notes: "Prefers window seat" },
  { id: "g2", name: "Bob Martin", phone: "555-0200", email: "bob@example.com", visitCount: 1, loyaltyStatus: "Standard", dietaryRestrictions: [], notes: "" },
];

const mockReservations: Reservation[] = [
  { id: "r1", branchId: "b1", guestId: "g1", partySize: 4, date: new Date().toISOString().split('T')[0], time: "19:00", status: "upcoming", tableId: "t3", createdAt: new Date().toISOString(), notes: "Anniversary" },
  { id: "r2", branchId: "b1", guestId: "g2", partySize: 2, date: new Date().toISOString().split('T')[0], time: "20:30", status: "upcoming", createdAt: new Date().toISOString() },
];

const mockWaitlist: WaitlistEntry[] = [
  { id: "w1", branchId: "b1", guestId: "g2", partySize: 2, quotedWaitTimeMins: 30, joinedAt: new Date().toISOString(), status: "waiting", notes: "First available" }
];


interface RestaurantState {
  currentUser: User;
  currentBranch: Branch;
  branches: Branch[];
  tables: Table[];
  guests: Guest[];
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  users: User[];
  setCurrentBranch: (branch: Branch) => void;
  updateTableStatus: (tableId: string, status: Table["status"]) => void;
  assignServer: (tableId: string, serverId: string) => void;
  addReservation: (reservation: Omit<Reservation, "id" | "createdAt" | "status">) => void;
  updateReservationStatus: (id: string, status: Reservation["status"]) => void;
}

const RestaurantContext = createContext<RestaurantState | undefined>(undefined);

export const RestaurantProvider = ({ children }: { children: ReactNode }) => {
  const [branches] = useState<Branch[]>(mockBranches);
  const [users] = useState<User[]>(mockUsers);
  const [currentUser] = useState<User>(mockUsers[0]); // Default to Manager for demo
  const [currentBranch, setCurrentBranch] = useState<Branch>(mockBranches[0]);
  
  const [tables, setTables] = useState<Table[]>(mockTables);
  const [guests] = useState<Guest[]>(mockGuests);
  const [reservations, setReservations] = useState<Reservation[]>(mockReservations);
  const [waitlist] = useState<WaitlistEntry[]>(mockWaitlist);

  const updateTableStatus = (tableId: string, status: Table["status"]) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status, seatedAt: status === 'occupied' ? new Date().toISOString() : t.seatedAt } : t));
  };

  const assignServer = (tableId: string, serverId: string) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, assignedServerId: serverId } : t));
  };

  const addReservation = (resData: Omit<Reservation, "id" | "createdAt" | "status">) => {
    const newRes: Reservation = {
      ...resData,
      id: `r${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "upcoming"
    };
    setReservations([...reservations, newRes]);
  };

  const updateReservationStatus = (id: string, status: Reservation["status"]) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  return (
    <RestaurantContext.Provider value={{
      currentUser,
      currentBranch,
      branches,
      tables,
      guests,
      reservations,
      waitlist,
      users,
      setCurrentBranch,
      updateTableStatus,
      assignServer,
      addReservation,
      updateReservationStatus
    }}>
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = () => {
  const context = useContext(RestaurantContext);
  if (!context) throw new Error("useRestaurant must be used within RestaurantProvider");
  return context;
};
