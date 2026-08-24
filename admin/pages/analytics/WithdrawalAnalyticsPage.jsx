import { useState, useEffect } from 'react';
import {
  Wallet, Coins, ArrowUpFromLine, TrendingUp, TrendingDown,
  DollarSign, Users, Calendar, RefreshCw, Search, Filter,
  CheckCircle2, XCircle, Clock, Loader, Download, BarChart3,
  PieChart, LineChart
} from 'lucide-react';
import api from '../../../api';

/**
 * Admin Withdrawal Analytics Page
 *
 * Features:
 * - View withdrawal revenue analytics
 * - Platform fee collection tracking (20%)
 * - Withdrawal table with user data
 * - Revenue charts and statistics
 * - Filter by date, status, user
 */
export function WithdrawalAnalyticsPage({ theme }) {
  const T = theme || defaultTheme();
  const [activeTab, setActiveTab] = useState('overview'); // overview | withdrawals | revenue

  const [analytics, setAnalytics] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'withdrawals') {
      loadWithdrawals();
    }
  }, [activeTab, statusFilter, dateFrom, dateTo, page]);

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError('');
      const data = await api.request('/admin/withdrawal-analytics/');
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  async function loadWithdrawals() {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (searchQuery) params.append('search', searchQuery);
      params.append('page', page);

      const data = await api.request(`/admin/wallet/withdrawals/?${params.toString()}`);
      setWithdrawals(data.results || []);
    } catch (err) {
      console.error('Failed to load withdrawals:', err);
      setError(err.message || 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const statusColors = {
    pending: { bg: '#FEF3C7', text: '#92400E', icon: Clock },
    processing: { bg: '#DBEAFE', text: '#1E40AF', icon: Loader },
    completed: { bg: '#D1FAE5', text: '#065F46', icon: CheckCircle2 },
    failed: { bg: '#FEE2E2', text: '#991B1B', icon: XCircle },
    rejected: { bg: '#FEE2E2', text: '#991B1B', icon: XCircle },
    cancelled: { bg: '#F3F4F6', text: '#374151', icon: XCircle },
  };

  if (loading && !analytics) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Loader className="spin" size={32} color={T.pri} />
        <p style={{ color: T.sub, marginTop: 16 }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: T.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={28} color={T.pri} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.txt }}>
              Withdrawal Analytics
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: T.sub }}>
              Platform revenue and withdrawal tracking
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            loadAnalytics();
            if (activeTab === 'withdrawals') loadWithdrawals();
          }}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.card,
            color: T.txt,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {['overview', 'withdrawals', 'revenue'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${T.pri}` : '2px solid transparent',
              color: activeTab === tab ? T.pri : T.sub,
              fontSize: 14,
              fontWeight: activeTab === tab ? 600 : 500,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: '#FEE2E2',
          color: '#991B1B',
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && analytics && (
        <div>
          {/* Key Metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}>
            <MetricCard
              title="Total Gross Revenue"
              value={formatCurrency(analytics.total_gross_birr)}
              icon={DollarSign}
              color="#10B981"
              theme={T}
            />
            <MetricCard
              title="Platform Fees (20%)"
              value={formatCurrency(analytics.total_platform_fee_birr)}
              icon={TrendingUp}
              color="#8B5CF6"
              theme={T}
            />
            <MetricCard
              title="Total Paid to Users"
              value={formatCurrency(analytics.total_net_birr)}
              icon={ArrowUpFromLine}
              color="#3B82F6"
              theme={T}
            />
            <MetricCard
              title="Total Withdrawals"
              value={analytics.total_withdrawals?.toLocaleString() || 0}
              icon={Users}
              color="#F59E0B"
              theme={T}
            />
          </div>

          {/* Additional Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}>
            <StatBox
              label="Completed Withdrawals"
              value={analytics.completed_count?.toLocaleString() || 0}
              color="#10B981"
              theme={T}
            />
            <StatBox
              label="Pending Withdrawals"
              value={analytics.pending_count?.toLocaleString() || 0}
              color="#F59E0B"
              theme={T}
            />
            <StatBox
              label="Failed Withdrawals"
              value={analytics.failed_count?.toLocaleString() || 0}
              color="#EF4444"
              theme={T}
            />
            <StatBox
              label="Average Withdrawal"
              value={formatCurrency(analytics.avg_withdrawal_birr)}
              color="#3B82F6"
              theme={T}
            />
          </div>

          {/* Revenue Chart Placeholder */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: T.txt }}>
              Revenue Trend (Last 30 Days)
            </h3>
            <div style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: T.bg,
              borderRadius: 8,
              border: `1px dashed ${T.border}`,
            }}>
              <div style={{ textAlign: 'center', color: T.sub }}>
                <LineChart size={48} style={{ margin: '0 auto 12px' }} />
                <p>Chart visualization coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawals Tab */}
      {activeTab === 'withdrawals' && (
        <div>
          {/* Filters */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.txt,
              }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.txt,
              }}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.txt,
              }}
            />
            <input
              type="text"
              placeholder="Search user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.txt,
                flex: 1,
                minWidth: 200,
              }}
            />
            <button
              onClick={() => {
                setStatusFilter('');
                setDateFrom('');
                setDateTo('');
                setSearchQuery('');
                setPage(1);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.card,
                color: T.txt,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>

          {/* Withdrawals Table */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    ID
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    User
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Points
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Gross
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Platform Fee
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Net
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Method
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Status
                  </th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 12, fontWeight: 600, color: T.sub }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => {
                  const statusInfo = statusColors[w.status] || statusColors.pending;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <tr key={w.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        #{w.id}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        {w.user?.username || '-'}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        {w.point_amount?.toLocaleString() || 0}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        {formatCurrency(w.gross_birr)}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: '#8B5CF6', fontWeight: 600 }}>
                        {formatCurrency(w.platform_fee_birr)}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        {formatCurrency(w.net_birr)}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: T.txt }}>
                        {w.payout_method_display || w.payout_method}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: statusInfo.bg,
                          color: statusInfo.text,
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          <StatusIcon size={12} />
                          {w.status_display || w.status}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: T.sub }}>
                        {formatDate(w.created_at)}
                      </td>
                    </tr>
                  );
                })}
                {withdrawals.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: T.sub }}>
                      No withdrawals found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, color: T.sub }}>
              Showing {withdrawals.length} withdrawals
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: T.card,
                  color: T.txt,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span style={{ padding: '8px 16px', color: T.txt }}>
                Page {page}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={withdrawals.length === 0}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: T.card,
                  color: T.txt,
                  cursor: withdrawals.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && analytics && (
        <div>
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: T.txt }}>
              Revenue Breakdown
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}>
              <RevenueItem
                label="Gross Revenue"
                value={formatCurrency(analytics.total_gross_birr)}
                percentage="100%"
                color="#10B981"
                theme={T}
              />
              <RevenueItem
                label="Platform Fee (20%)"
                value={formatCurrency(analytics.total_platform_fee_birr)}
                percentage="20%"
                color="#8B5CF6"
                theme={T}
              />
              <RevenueItem
                label="User Payouts (80%)"
                value={formatCurrency(analytics.total_net_birr)}
                percentage="80%"
                color="#3B82F6"
                theme={T}
              />
            </div>
          </div>

          {/* Chart Placeholder */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: T.txt }}>
              Revenue Distribution
            </h3>
            <div style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: T.bg,
              borderRadius: 8,
              border: `1px dashed ${T.border}`,
            }}>
              <div style={{ textAlign: 'center', color: T.sub }}>
                <PieChart size={48} style={{ margin: '0 auto 12px' }} />
                <p>Pie chart visualization coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, theme: T }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: color + '15',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.txt }}>{value}</div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color, theme: T }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function RevenueItem({ label, value, percentage, color, theme: T }) {
  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.txt, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color, fontWeight: 600 }}>{percentage}</div>
    </div>
  );
}

function defaultTheme() {
  return {
    bg: '#F9FAFB',
    card: '#FFFFFF',
    txt: '#111827',
    sub: '#6B7280',
    pri: '#8FC441',
    border: '#E5E7EB',
  };
}
