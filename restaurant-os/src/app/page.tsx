"use client";

import { useRestaurant } from "@/context/RestaurantContext";

export default function Dashboard() {
  const { currentBranch, tables, reservations, waitlist } = useRestaurant();

  const branchTables = tables.filter(t => t.branchId === currentBranch.id);
  const branchReservations = reservations.filter(r => r.branchId === currentBranch.id);
  const branchWaitlist = waitlist.filter(w => w.branchId === currentBranch.id);

  const occupiedTables = branchTables.filter(t => t.status === 'occupied').length;
  const availableTables = branchTables.filter(t => t.status === 'available').length;
  const cleaningTables = branchTables.filter(t => t.status === 'cleaning').length;

  return (
    <div>
      <h1 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
        Overview: {currentBranch.name}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ borderLeft: '4px solid var(--status-occupied)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Occupied Tables</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{occupiedTables} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/ {branchTables.length}</span></div>
        </div>
        
        <div className="card" style={{ borderLeft: '4px solid var(--status-available)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Available Tables</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{availableTables}</div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--status-reserved)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Upcoming Reservations (Today)</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{branchReservations.length}</div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--status-cleaning)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>Waitlist</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{branchWaitlist.length}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Recent Activity</h2>
        <div style={{ color: 'var(--text-secondary)' }}>
          Dashboard metrics are derived from the live simulated state. Use the sidebar to interact with the floor plan, manage reservations, and view guest history.
        </div>
      </div>
    </div>
  );
}
