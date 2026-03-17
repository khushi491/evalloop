"use client";

import { useRestaurant } from "@/context/RestaurantContext";

export default function Guests() {
  const { guests } = useRestaurant();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>Guest Directory</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input type="text" className="form-input" placeholder="Search guests..." style={{ width: '300px' }} />
          <button className="btn btn-primary">Add Guest</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {guests.map(guest => (
          <div key={guest.id} className="card" style={{ position: 'relative' }}>
            {guest.loyaltyStatus === 'VIP' && (
              <span style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#fef08a', color: '#854d0e', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>VIP</span>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '48px', height: '48px', borderRadius: '50%', 
                background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: '1.25rem'
              }}>
                {guest.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{guest.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{guest.phone}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Visits</span>
                <span style={{ fontWeight: 600 }}>{guest.visitCount}</span>
              </div>
              
              {guest.dietaryRestrictions.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Dietary</div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {guest.dietaryRestrictions.map(d => (
                      <span key={d} style={{ background: '#fee2e2', color: '#991b1b', padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}

              {guest.notes && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Notes</div>
                  <div style={{ fontSize: '0.875rem', fontStyle: 'italic', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>"{guest.notes}"</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
