"use client";

import { useState } from "react";
import { useRestaurant } from "@/context/RestaurantContext";

export default function FloorPlan() {
  const { currentBranch, tables, users, updateTableStatus, assignServer } = useRestaurant();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const branchTables = tables.filter(t => t.branchId === currentBranch.id);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectedTableId) {
      updateTableStatus(selectedTableId, e.target.value as any);
    }
  };

  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (selectedTableId) {
      assignServer(selectedTableId, e.target.value);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
      {/* Floor Plan View */}
      <div className="card" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e2e8f0' }}>
        <h2 className="card-title" style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 10 }}>
          {currentBranch.name} Floor Plan
        </h2>
        
        {branchTables.map(table => {
          let bgClass = "status-badge available";
          if (table.status === 'occupied') bgClass = "status-badge occupied";
          if (table.status === 'reserved') bgClass = "status-badge reserved";
          if (table.status === 'cleaning') bgClass = "status-badge cleaning";

          return (
            <div
              key={table.id}
              onClick={() => setSelectedTableId(table.id)}
              style={{
                position: 'absolute',
                left: table.x,
                top: table.y,
                width: table.shape === 'rectangle' ? '120px' : '80px',
                height: '80px',
                borderRadius: table.shape === 'circle' ? '50%' : 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: selectedTableId === table.id ? '0 0 0 4px var(--brand-accent)' : 'var(--shadow-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '2px solid var(--border-color)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{table.number}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cap: {table.capacity}</div>
              <div className={bgClass} style={{ marginTop: '0.25rem', fontSize: '0.65rem', padding: '0.125rem 0.375rem' }}>
                {table.status}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sidebar Controls */}
      <div className="card" style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
        <h2 className="card-title">Table Controls</h2>
        
        {selectedTableId ? (() => {
          const table = tables.find(t => t.id === selectedTableId);
          if (!table) return null;
          
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Table Number</label>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{table.number} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}>({table.capacity} seats)</span></div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>Status</label>
                <select className="form-select" style={{ width: '100%' }} value={table.status} onChange={handleStatusChange}>
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="occupied">Occupied</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="combined">Combined</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>Assigned Server</label>
                <select className="form-select" style={{ width: '100%' }} value={table.assignedServerId || ""} onChange={handleServerChange}>
                  <option value="">Unassigned</option>
                  {users.filter(u => u.branchIds.includes(currentBranch.id) && u.role === 'Server').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              
              {table.seatedAt && table.status === 'occupied' && (
                <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Time Seated</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {Math.floor((Date.now() - new Date(table.seatedAt).getTime()) / 60000)} mins ago
                  </div>
                </div>
              )}
            </div>
          );
        })() : (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
            Select a table on the floor plan to manage its status and assignments.
          </div>
        )}
      </div>
    </div>
  );
}
