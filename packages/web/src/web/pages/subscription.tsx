import { useState, useEffect } from 'react';
import { getSession } from "../lib/session";

export default function Subscription() {
  const session = getSession();
  const isAdmin = session?.role === 'admin';

  const [settings, setSettings] = useState({ buttonText: 'Contact Us', buttonUrl: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editButtonText, setEditButtonText] = useState('');
  const [editButtonUrl, setEditButtonUrl] = useState('');

  const [plans, setPlans] = useState({
    firstPurchase: { freeWeeks: 1, monthlyPrice: 10 },
    monthlyPlans: [
      { months: 1, price: 10 },
      { months: 3, price: 25 },
      { months: 6, price: 45 },
      { months: 12, price: 80 },
    ],
  });
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [editPlans, setEditPlans] = useState(plans);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('subscriptionSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
    const savedPlans = localStorage.getItem('subscriptionPlans');
    if (savedPlans) {
      setPlans(JSON.parse(savedPlans));
    }
  }, []);

  const handleEdit = () => {
    setEditButtonText(settings.buttonText);
    setEditButtonUrl(settings.buttonUrl);
    setShowEditModal(true);
  };

  const handleSave = () => {
    const newSettings = { buttonText: editButtonText, buttonUrl: editButtonUrl };
    setSettings(newSettings);
    localStorage.setItem('subscriptionSettings', JSON.stringify(newSettings));
    setShowEditModal(false);
  };

  const handleEditPlans = () => {
    setEditPlans(JSON.parse(JSON.stringify(plans)));
    setShowPlansModal(true);
  };

  const handleSavePlans = () => {
    setPlans(editPlans);
    localStorage.setItem('subscriptionPlans', JSON.stringify(editPlans));
    setShowPlansModal(false);
  };

  const updatePlanPrice = (index: number, price: number) => {
    const newPlans = { ...editPlans };
    newPlans.monthlyPlans[index].price = price;
    setEditPlans(newPlans);
  };

  const updatePlanMonths = (index: number, months: number) => {
    const newPlans = { ...editPlans };
    newPlans.monthlyPlans[index].months = months;
    setEditPlans(newPlans);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>Subscription</div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
          For more information on subscription, please contact:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={settings.buttonUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'var(--primary)', color: '#fff',
              padding: '12px 24px', borderRadius: 10,
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {settings.buttonText}
          </a>
          {isAdmin && (
            <button
              onClick={handleEdit}
              style={{
                display: 'inline-block',
                background: 'var(--border)', color: 'var(--text)',
                padding: '12px 16px', borderRadius: 10,
                fontSize: 14, fontWeight: 600, border: 'none',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Plans</div>
          {isAdmin && (
            <button
              onClick={handleEditPlans}
              style={{
                display: 'inline-block',
                background: 'var(--border)', color: 'var(--text)',
                padding: '8px 16px', borderRadius: 8,
                fontSize: 13, fontWeight: 600, border: 'none',
                cursor: 'pointer',
              }}
            >
              Edit Plans
            </button>
          )}
        </div>

        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            First purchase
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {plans.firstPurchase.freeWeeks} week{plans.firstPurchase.freeWeeks > 1 ? 's' : ''} for free, then ${plans.firstPurchase.monthlyPrice} per month
          </div>
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
            Monthly plans
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {plans.monthlyPlans.map((plan, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 16, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  ${plan.price}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {plan.months === 12 ? 'Annual' : `${plan.months} month${plan.months > 1 ? 's' : ''}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEditModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 32, maxWidth: 400, width: '100%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
              Edit Contact Button
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                Button Text
              </label>
              <input
                type="text"
                value={editButtonText}
                onChange={(e) => setEditButtonText(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                Button URL
              </label>
              <input
                type="text"
                value={editButtonUrl}
                onChange={(e) => setEditButtonUrl(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--border)', color: 'var(--text)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlansModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 32, maxWidth: 500, width: '100%',
            maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>
              Edit Plans
            </div>

            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                First Purchase
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                    Free Weeks
                  </label>
                  <input
                    type="number"
                    value={editPlans.firstPurchase.freeWeeks}
                    onChange={(e) => {
                      const newPlans = { ...editPlans };
                      newPlans.firstPurchase.freeWeeks = Number(e.target.value);
                      setEditPlans(newPlans);
                    }}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: 14,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                    Monthly Price ($)
                  </label>
                  <input
                    type="number"
                    value={editPlans.firstPurchase.monthlyPrice}
                    onChange={(e) => {
                      const newPlans = { ...editPlans };
                      newPlans.firstPurchase.monthlyPrice = Number(e.target.value);
                      setEditPlans(newPlans);
                    }}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: 14,
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                Monthly Plans
              </div>
              {editPlans.monthlyPlans.map((plan, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                      Months
                    </label>
                    <input
                      type="number"
                      value={plan.months}
                      onChange={(e) => updatePlanMonths(index, Number(e.target.value))}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                      Price ($)
                    </label>
                    <input
                      type="number"
                      value={plan.price}
                      onChange={(e) => updatePlanPrice(index, Number(e.target.value))}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                onClick={() => setShowPlansModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--border)', color: 'var(--text)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlans}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
