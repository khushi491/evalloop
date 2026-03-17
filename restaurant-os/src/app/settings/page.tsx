"use client";

import { useRestaurant } from "@/context/RestaurantContext";

export default function Settings() {
  const { currentBranch, currentUser } = useRestaurant();

  if (currentUser.role !== 'Manager') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
        <h2 className="card-title">Access Denied</h2>
        <p>You do not have permission to view or edit branch settings. Please contact a manager.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
        Settings: {currentBranch.name}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', maxWidth: '800px' }}>
        <div className="card">
          <h2 className="card-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>Cancellation Policy</h2>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Define the cancellation fee applied if a guest cancels within 2 hours of their reservation time.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Fee Type</label>
                <select className="form-select" defaultValue={currentBranch.cancellationFeeFixed ? 'fixed' : 'percent'} style={{ width: '100%', maxWidth: '300px' }}>
                  <option value="fixed">Fixed Amount ($)</option>
                  <option value="percent">Percentage of Estimated Bill (%)</option>
                  <option value="none">No Fee</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Fee Value</label>
                <input 
                  type="number" 
                  className="form-input" 
                  defaultValue={currentBranch.cancellationFeeFixed || currentBranch.cancellationFeePercent || 0} 
                  style={{ width: '100%', maxWidth: '300px' }} 
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <button className="btn btn-primary">Save Changes</button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>Branch Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Branch ID</div>
            <div>{currentBranch.id}</div>
            
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Name</div>
            <div>{currentBranch.name}</div>
            
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Address</div>
            <div>{currentBranch.address}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
