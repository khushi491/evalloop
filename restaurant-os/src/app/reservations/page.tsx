"use client";

import { useRestaurant } from "@/context/RestaurantContext";

export default function Reservations() {
  const { currentBranch, reservations, guests } = useRestaurant();

  const branchReservations = reservations.filter(r => r.branchId === currentBranch.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>Reservations</h1>
        <button className="btn btn-primary">New Reservation</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Guest</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date & Time</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Party Size</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {branchReservations.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No reservations found.</td>
              </tr>
            ) : branchReservations.map(res => {
              const guest = guests.find(g => g.id === res.guestId);
              return (
                <tr key={res.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{guest?.name || 'Unknown Guest'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{guest?.phone}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div>{res.date}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{res.time}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>{res.partySize}</td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`status-badge ${res.status === 'upcoming' ? 'available' : res.status === 'seated' ? 'occupied' : 'cleaning'}`}>
                      {res.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {res.notes || '-'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
