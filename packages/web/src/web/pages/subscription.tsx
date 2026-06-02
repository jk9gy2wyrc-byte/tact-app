import { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { getSession } from "../lib/session";
import { fetchAccess } from "../lib/access";
import {
  DEFAULT_SUBSCRIPTION_SETTINGS,
  type SubscriptionPlans,
  type SubscriptionSettingsPayload,
} from "../../shared/subscription";

const clonePlans = (plans: SubscriptionPlans): SubscriptionPlans => ({
  firstPurchase: { ...plans.firstPurchase },
  monthlyPlans: plans.monthlyPlans.map(p => ({ ...p })),
});

const cloneConfig = (config: SubscriptionSettingsPayload): SubscriptionSettingsPayload => ({
  buttonText: config.buttonText,
  buttonUrl: config.buttonUrl,
  plans: clonePlans(config.plans),
});

type SubscriptionApiResponse = SubscriptionSettingsPayload & { updatedAt?: string | null };

export default function Subscription() {
  const session = getSession();
  const isAdmin = session?.role === 'admin';
  const userRole = session?.role ?? 'free';

  const { data: accessData } = useQuery({
    queryKey: ['access'],
    queryFn: fetchAccess,
    staleTime: 30_000,
  });

  // Use role from API (always fresh from DB), fallback to localStorage
  const effectiveRole = accessData?.role ?? userRole;

  const [config, setConfig] = useState<SubscriptionSettingsPayload>(() => cloneConfig(DEFAULT_SUBSCRIPTION_SETTINGS));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editButtonText, setEditButtonText] = useState(DEFAULT_SUBSCRIPTION_SETTINGS.buttonText);
  const [editButtonUrl, setEditButtonUrl] = useState(DEFAULT_SUBSCRIPTION_SETTINGS.buttonUrl);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  const [showPlansModal, setShowPlansModal] = useState(false);
  const [editPlans, setEditPlans] = useState<SubscriptionPlans>(() => clonePlans(DEFAULT_SUBSCRIPTION_SETTINGS.plans));
  const [plansModalError, setPlansModalError] = useState<string | null>(null);

  const getRoleInfo = () => {
    switch (effectiveRole) {
      case 'admin':
        return { label: 'Expanded rights', color: '#facc15', bg: '#facc1522', border: '#facc1544' };
      case 'paid':
        return { label: 'Subscribed', color: '#4ade80', bg: '#4ade8022', border: '#4ade8044' };
      case 'free':
        return { label: 'Free access', color: '#9ca3af', bg: '#9ca3af22', border: '#9ca3af44' };
      case 'no-access':
        return { label: 'Unsubscribed', color: '#9ca3af', bg: '#9ca3af22', border: '#9ca3af44' };
      case 'free-trial': {
        if (accessData?.hasAccess) {
          return { label: 'Free trial', color: '#7eb8f7', bg: '#7eb8f722', border: '#7eb8f744' };
        }
        return { label: 'Unsubscribed', color: '#9ca3af', bg: '#9ca3af22', border: '#9ca3af44' };
      }
      default:
        return { label: 'Free access', color: '#9ca3af', bg: '#9ca3af22', border: '#9ca3af44' };
    }
  };

  const roleInfo = getRoleInfo();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/subscription/settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Не вдалося отримати налаштування');
        if (cancelled) return;
        const next = cloneConfig(data as SubscriptionApiResponse);
        setConfig(next);
        setEditButtonText(next.buttonText);
        setEditButtonUrl(next.buttonUrl);
        setEditPlans(clonePlans(next.plans));
        setUpdatedAt((data as SubscriptionApiResponse).updatedAt ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Помилка завантаження');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const saveConfig = async (nextConfig: SubscriptionSettingsPayload) => {
    if (!session || !isAdmin) throw new Error('Немає прав для редагування');
    setSaving(true);
    setGlobalMessage(null);
    try {
      const res = await fetch('/api/subscription/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asLogin: session.login,
          buttonText: nextConfig.buttonText,
          buttonUrl: nextConfig.buttonUrl,
          plans: nextConfig.plans,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Не вдалося зберегти');
      const normalized = cloneConfig(data as SubscriptionApiResponse);
      setConfig(normalized);
      setEditButtonText(normalized.buttonText);
      setEditButtonUrl(normalized.buttonUrl);
      setEditPlans(clonePlans(normalized.plans));
      setUpdatedAt((data as SubscriptionApiResponse).updatedAt ?? null);
      setGlobalMessage('Налаштування збережено');
      return normalized;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setEditModalError(null);
    setEditButtonText(config.buttonText);
    setEditButtonUrl(config.buttonUrl);
    setShowEditModal(true);
  };

  const handleSaveButton = async () => {
    setEditModalError(null);
    try {
      await saveConfig({
        ...config,
        buttonText: editButtonText.trim() || DEFAULT_SUBSCRIPTION_SETTINGS.buttonText,
        buttonUrl: editButtonUrl.trim(),
      });
      setShowEditModal(false);
    } catch (err) {
      setEditModalError(err instanceof Error ? err.message : 'Помилка збереження');
    }
  };

  const handleEditPlans = () => {
    setPlansModalError(null);
    setEditPlans(clonePlans(config.plans));
    setShowPlansModal(true);
  };

  const handleSavePlans = async () => {
    setPlansModalError(null);
    try {
      await saveConfig({
        ...config,
        plans: clonePlans(editPlans),
      });
      setShowPlansModal(false);
    } catch (err) {
      setPlansModalError(err instanceof Error ? err.message : 'Помилка збереження планів');
    }
  };

  const updatePlanPrice = (index: number, price: number) => {
    setEditPlans(prev => {
      const next = clonePlans(prev);
      if (next.monthlyPlans[index]) next.monthlyPlans[index].price = Math.max(0, price);
      return next;
    });
  };

  const updatePlanMonths = (index: number, months: number) => {
    setEditPlans(prev => {
      const next = clonePlans(prev);
      if (next.monthlyPlans[index]) next.monthlyPlans[index].months = Math.max(1, Math.floor(months));
      return next;
    });
  };

  const updateFirstPurchase = (key: 'freeWeeks' | 'monthlyPrice', value: number) => {
    setEditPlans(prev => ({
      firstPurchase: {
        ...prev.firstPurchase,
        [key]: key === 'freeWeeks' ? Math.max(0, Math.floor(value)) : Math.max(0, value),
      },
      monthlyPlans: prev.monthlyPlans.map(p => ({ ...p })),
    }));
  };

  const contactDisabled = !config.buttonUrl?.trim();
  const plans = config.plans;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>Subscription</div>

      {error && (
        <div style={{
          background: '#fecaca22', border: '1px solid #f87171', color: '#f87171',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {globalMessage && !error && (
        <div style={{
          background: '#4ade8033', border: '1px solid #4ade80', color: '#22c55e',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12,
        }}>
          {globalMessage}
          {updatedAt && (
            <span style={{ marginLeft: 8, color: 'var(--text2)' }}>
              (оновлено {new Date(updatedAt).toLocaleString('uk-UA')})
            </span>
          )}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Завантаження налаштувань...</div>
      )}

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
          Ваш поточний статус:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            background: roleInfo.bg, color: roleInfo.color,
            border: `1px solid ${roleInfo.border}`,
          }}>
            {roleInfo.label}
          </span>
          {(effectiveRole === 'no-access' || (effectiveRole === 'free-trial' && !accessData?.hasAccess)) && (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              Subscribe to get full access
            </span>
          )}
        </div>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
          For more information on subscription, please contact:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={contactDisabled ? undefined : config.buttonUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => contactDisabled && e.preventDefault()}
            style={{
              display: 'inline-block',
              background: contactDisabled ? 'var(--surface2)' : 'var(--primary)',
              color: contactDisabled ? 'var(--text2)' : '#fff',
              padding: '12px 24px', borderRadius: 10,
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              cursor: contactDisabled ? 'not-allowed' : 'pointer',
              opacity: contactDisabled ? 0.6 : 1,
            }}
          >
            {config.buttonText}
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
            {editModalError && (
              <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{editModalError}</div>
            )}
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
                onClick={handleSaveButton}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save'}
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
                    onChange={(e) => updateFirstPurchase('freeWeeks', Number(e.target.value))}
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
                    onChange={(e) => updateFirstPurchase('monthlyPrice', Number(e.target.value))}
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
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
