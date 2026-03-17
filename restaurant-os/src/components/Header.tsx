"use client";

import { useRestaurant } from "../context/RestaurantContext";

export default function Header() {
  const { currentUser, branches, currentBranch, setCurrentBranch } = useRestaurant();

  return (
    <header className="top-header">
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{currentBranch.name}</h2>
      </div>
      <div className="header-actions">
        <select 
          className="form-select"
          value={currentBranch.id}
          onChange={(e) => {
            const branch = branches.find(b => b.id === e.target.value);
            if (branch) setCurrentBranch(branch);
          }}
        >
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '50%', 
            background: 'var(--brand-primary)', color: 'white', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: '0.875rem'
          }}>
            {currentUser.name.charAt(0)}
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 600 }}>{currentUser.name.split(' ')[0]}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{currentUser.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
