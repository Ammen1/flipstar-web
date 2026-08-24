import React, { useState, useEffect } from 'react';
import api from '../../../api';

const theme = {
  bg: '#0a0a0a',
  card: '#1a1a1a',
  txt: '#ffffff',
  sub: '#888888',
  accent: '#6366f1',
  accentHover: '#4f46e5',
  border: '#333333',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b'
};

const CRMWinnersPage = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [winners, setWinners] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [packages, setPackages] = useState([]);
  const [sendingGift, setSendingGift] = useState(false);
  const [sendingToAll, setSendingToAll] = useState(false);
  const [sendingToSelected, setSendingToSelected] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState(new Set());
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultTitle, setResultTitle] = useState('');

  const tabs = [
    { id: 'daily', label: 'Daily Winners (50)', limit: 50 },
    { id: 'weekly', label: 'Weekly Winners (10)', limit: 10 },
    { id: 'monthly', label: 'Monthly Winners (5)', limit: 5 },
    { id: 'grand', label: 'Grand Winners (3)', limit: 3 },
    { id: 'transactions', label: 'Transaction History' }
  ];

  useEffect(() => {
    loadPackages();
    if (activeTab === 'transactions') {
      loadTransactions();
    } else {
      loadWinners();
    }
  }, [activeTab]);

  const loadPackages = async () => {
    try {
      const response = await api.request('/admin/crm/packages/active/');
      const packagesList = response.results || response;
      setPackages(packagesList);
      
      // Auto-select 1MB package as default (match variations: 1MB, 1 MB, 1mb, 1 mb)
      const oneMBPackage = packagesList.find(pkg => 
        pkg.name && /1\s*mb/i.test(pkg.name)
      );
      if (oneMBPackage) {
        const packageId = String(oneMBPackage.id);
        setSelectedPackage(packageId);
      } else {
        // Fallback: select first package if no 1MB found
        if (packagesList.length > 0) {
          const packageId = String(packagesList[0].id);
          setSelectedPackage(packageId);
        }
      }
    } catch (error) {
      // Error loading packages
    }
  };

  const loadWinners = async () => {
    setLoading(true);
    try {
      const response = await api.request(`/admin/crm/campaign-winners/?selection_type=${activeTab}`);
      setWinners(response.winners || []);
    } catch (error) {
      // Error loading winners
      setWinners([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const response = await api.request('/admin/crm/transactions/');
      setTransactions(response.results || response);
    } catch (error) {
      // Error loading transactions
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const sendGift = async (userId, username) => {
    if (!selectedPackage) {
      return;
    }

    setSendingGift(true);

    try {
      const response = await api.request('/admin/crm/award/', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          package_id: parseInt(selectedPackage),
          trigger_source: `crm_${activeTab}_winners`
        })
      });

      if (response.success || response.status === 'success' || response.id) {
        setResultMessage(`Gift sent successfully to ${username}`);
        setResultSuccess(true);
        setResultTitle('Success');
        setResultModalOpen(true);
        // Refresh winners to update status
        loadWinners();
      } else {
        const errorMsg = response.error || response.message || 'Unknown error';
        let userMessage = errorMsg;
        let title = 'Failed';

        // Check for gift limit reached error
        if (errorMsg.includes('already received') || errorMsg.includes('max')) {
          userMessage = 'Gift receiving limit reached for this user';
          title = 'Skipped';
        }

        setResultMessage(userMessage);
        setResultSuccess(false);
        setResultTitle(title);
        setResultModalOpen(true);
      }
    } catch (error) {
      // Error sending gift
      let userMessage = error.message || 'Unknown error';
      let title = 'Failed';

      // Check for gift limit reached error
      if (error.message && (error.message.includes('already received') || error.message.includes('max'))) {
        userMessage = 'Gift receiving limit reached for this user';
        title = 'Skipped';
      }

      setResultMessage(userMessage);
      setResultSuccess(false);
      setResultTitle(title);
      setResultModalOpen(true);
    } finally {
      setSendingGift(false);
    }
  };

  const sendGiftToAll = async () => {
    if (!selectedPackage) {
      return;
    }

    setConfirmAction(() => async () => {
      setSendingToAll(true);

      try {
        const response = await api.request('/admin/crm/award-campaign-winners/', {
          method: 'POST',
          body: JSON.stringify({
            selection_type: activeTab,
            package_id: parseInt(selectedPackage)
          })
        });

        setResultMessage(`Bulk send complete: ${response.successful} successful, ${response.failed} failed, ${response.skipped} skipped`);
        setResultSuccess(true);
        setResultTitle('Success');
        setResultModalOpen(true);
      } catch (error) {
        let userMessage = `Error sending gifts: ${error.message || 'Unknown error'}`;
        let title = 'Failed';

        // Check for gift limit reached error
        if (error.message && (error.message.includes('already received') || error.message.includes('max'))) {
          userMessage = 'Some users have reached their gift receiving limit';
          title = 'Skipped';
        }

        setResultMessage(userMessage);
        setResultSuccess(false);
        setResultTitle(title);
        setResultModalOpen(true);
      } finally {
        setSendingToAll(false);
        loadWinners();
      }
    });
    setConfirmModalOpen(true);
  };

  const sendGiftToSelected = async () => {
    if (!selectedPackage) {
      return;
    }

    if (selectedWinners.size === 0) {
      return;
    }

    setConfirmAction(() => async () => {
      setSendingToSelected(true);

      let successful = 0;
      let failed = 0;
      const errors = [];

      for (const winnerId of selectedWinners) {
        const winner = winners.find(w => w.id === winnerId);
        if (!winner) {
          continue;
        }

        try {
          const response = await api.request('/admin/crm/award/', {
            method: 'POST',
            body: JSON.stringify({
              user_id: winner.user_id,
              package_id: parseInt(selectedPackage),
              trigger_source: `crm_${activeTab}_winners_selected`
            })
          });

          if (response.status === 'success' || response.id) {
            successful++;
          } else {
            failed++;
            const errorMsg = response.error || response.message || 'Unknown error';
            let userError = errorMsg;
            
            // Check for gift limit reached error
            if (errorMsg.includes('already received') || errorMsg.includes('max')) {
              userError = 'Gift receiving limit reached';
            }
            
            errors.push({ user: winner.username, error: userError });
          }
        } catch (error) {
          failed++;
          let userError = error.message || 'API Error';
          
          // Check for gift limit reached error
          if (error.message && (error.message.includes('already received') || error.message.includes('max'))) {
            userError = 'Gift receiving limit reached';
          }
          
          errors.push({ user: winner.username, error: userError });
        }
      }

      // Check if all failures are due to gift limit
      const allLimitReached = failed > 0 && errors.every(e => e.error === 'Gift receiving limit reached');
      
      if (allLimitReached) {
        setResultMessage(`Selected send complete: ${successful} successful, ${failed} skipped (gift limit reached)`);
        setResultTitle(failed > 0 && successful === 0 ? 'Skipped' : 'Partial Success');
      } else {
        setResultMessage(`Selected send complete: ${successful} successful, ${failed} failed`);
        setResultTitle(failed === 0 ? 'Success' : 'Failed');
      }
      
      setResultSuccess(failed === 0);
      setResultModalOpen(true);

      setSendingToSelected(false);
      setSelectedWinners(new Set());
      loadWinners();
    });
    setConfirmModalOpen(true);
  };

  const toggleWinnerSelection = (winnerId) => {
    const newSelected = new Set(selectedWinners);
    if (newSelected.has(winnerId)) {
      newSelected.delete(winnerId);
    } else {
      newSelected.add(winnerId);
    }
    setSelectedWinners(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedWinners.size === winners.length) {
      setSelectedWinners(new Set());
    } else {
      setSelectedWinners(new Set(winners.map(w => w.id)));
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ color: theme.txt, marginBottom: '24px', fontSize: '28px', fontWeight: '700' }}>
        CRM Winners Management
      </h1>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '16px'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab.id ? theme.accent : theme.card,
              color: theme.txt,
              border: `1px solid ${activeTab === tab.id ? theme.accent : theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Package Selection - Hide on transactions tab */}
      {activeTab !== 'transactions' && (
        <div style={{
          background: theme.card,
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: `1px solid ${theme.border}`
        }}>
          <h3 style={{ color: theme.txt, marginBottom: '16px', fontSize: '16px' }}>
            Gift Configuration
          </h3>


          {/* CRM Package Selection */}
          <div>
              <h3 style={{ color: theme.txt, marginBottom: '16px', fontSize: '16px' }}>
                Select CRM Package
              </h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={selectedPackage}
                  onChange={(e) => {
                    setSelectedPackage(e.target.value);
                  }}
                  style={{
                    padding: '12px 16px',
                    background: theme.bg,
                    color: theme.txt,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    minWidth: '300px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">-- Select Package --</option>
                  {packages.map(pkg => (
                    <option key={pkg.id} value={String(pkg.id)}>
                      {pkg.name} - {pkg.charge_amount} ETB (OfferingId: {pkg.offering_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            <button
              onClick={sendGiftToAll}
              disabled={!selectedPackage || sendingToAll || winners.length === 0}
              style={{
                padding: '12px 24px',
                background: theme.accent,
                color: theme.txt,
                border: 'none',
                borderRadius: '8px',
                cursor: (!selectedPackage || sendingToAll || winners.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: (!selectedPackage || sendingToAll || winners.length === 0) ? 0.5 : 1
              }}
            >
              {sendingToAll ? 'Sending...' : `Send to All (${winners.length})`}
            </button>
            <button
              onClick={sendGiftToSelected}
              disabled={!selectedPackage || sendingToSelected || selectedWinners.size === 0}
              style={{
                padding: '12px 24px',
                background: theme.success,
                color: theme.txt,
                border: 'none',
                borderRadius: '8px',
                cursor: (!selectedPackage || sendingToSelected || selectedWinners.size === 0) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: (!selectedPackage || sendingToSelected || selectedWinners.size === 0) ? 0.5 : 1
              }}
            >
              {sendingToSelected ? 'Sending...' : `Send Selected (${selectedWinners.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Winners Table - Hide on transactions tab */}
      {activeTab !== 'transactions' && (
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1px solid ${theme.border}`
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.sub }}>
              Loading winners...
            </div>
          ) : winners.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.sub }}>
              No winners found for this period
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.bg }}>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    width: '40px'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedWinners.size === winners.length && winners.length > 0}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Rank
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Username
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Final Score
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Phone Number
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'right',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {winners.map((winner) => (
                  <tr key={winner.id} style={{
                    borderBottom: `1px solid ${theme.border}`,
                    transition: 'background 0.2s'
                  }}>
                    <td style={{ padding: '16px', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedWinners.has(winner.id)}
                        onChange={() => toggleWinnerSelection(winner.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '16px', color: theme.txt, fontWeight: '600' }}>
                      #{winner.rank}
                    </td>
                    <td style={{ padding: '16px', color: theme.txt }}>
                      {winner.username}
                    </td>
                    <td style={{ padding: '16px', color: theme.sub }}>
                      {winner.final_score}
                    </td>
                    <td style={{ padding: '16px', color: theme.sub }}>
                      {winner.phone_number || 'N/A'}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button
                        onClick={() => sendGift(winner.user_id, winner.username)}
                        disabled={!selectedPackage || sendingGift}
                        style={{
                          padding: '8px 16px',
                          background: theme.accent,
                          color: theme.txt,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: (!selectedPackage || sendingGift) ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          opacity: (!selectedPackage || sendingGift) ? 0.5 : 1
                        }}
                      >
                        {sendingGift ? 'Sending...' : 'Send Gift'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Transactions Table - Show only on transactions tab */}
      {activeTab === 'transactions' && (
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1px solid ${theme.border}`
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.sub }}>
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.sub }}>
              No transactions found
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.bg }}>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Date
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    User
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Phone Number
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Package
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Status
                  </th>
                  <th style={{
                    padding: '16px',
                    textAlign: 'left',
                    color: theme.sub,
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Error Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} style={{
                    borderBottom: `1px solid ${theme.border}`,
                    transition: 'background 0.2s'
                  }}>
                    <td style={{ padding: '16px', color: theme.txt, fontSize: '13px' }}>
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', color: theme.txt }}>
                      {tx.user?.username || 'N/A'}
                    </td>
                    <td style={{ padding: '16px', color: theme.sub }}>
                      {tx.phone_number}
                    </td>
                    <td style={{ padding: '16px', color: theme.txt }}>
                      {tx.package?.name || tx.offering_id}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: tx.status === 'success' ? 'rgba(16, 185, 129, 0.2)' :
                                   tx.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' :
                                   tx.status === 'pending' ? 'rgba(245, 158, 11, 0.2)' :
                                   'rgba(107, 114, 128, 0.2)',
                        color: tx.status === 'success' ? theme.success :
                               tx.status === 'failed' ? theme.error :
                               tx.status === 'pending' ? theme.warning :
                               theme.sub
                      }}>
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: theme.sub, fontSize: '12px', maxWidth: '300px' }}>
                      {tx.response_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: theme.card,
            padding: '32px',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '90%',
            border: `1px solid ${theme.border}`
          }}>
            <h3 style={{ color: theme.txt, marginBottom: '16px', fontSize: '20px', fontWeight: '700' }}>
              Confirm Action
            </h3>
            <p style={{ color: theme.sub, marginBottom: '24px', fontSize: '15px', lineHeight: '1.5' }}>
              {selectedWinners.size > 0 
                ? `Send gift to ${selectedWinners.size} selected winners?`
                : `Send gift to all ${winners.length} winners?`
              }
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setConfirmModalOpen(false);
                  setConfirmAction(null);
                }}
                style={{
                  padding: '12px 24px',
                  background: theme.bg,
                  color: theme.txt,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmModalOpen(false);
                  if (confirmAction) {
                    await confirmAction();
                    setConfirmAction(null);
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: theme.accent,
                  color: theme.txt,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {resultModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: theme.card,
            padding: '32px',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '90%',
            border: `1px solid ${theme.border}`,
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: resultSuccess || resultTitle === 'Skipped' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <span style={{ fontSize: '32px' }}>
                {resultSuccess || resultTitle === 'Skipped' ? '✓' : '✗'}
              </span>
            </div>
            <h3 style={{ color: theme.txt, marginBottom: '12px', fontSize: '20px', fontWeight: '700' }}>
              {resultTitle || (resultSuccess ? 'Success' : 'Failed')}
            </h3>
            <p style={{ color: theme.sub, marginBottom: '24px', fontSize: '15px', lineHeight: '1.5' }}>
              {resultMessage}
            </p>
            <button
              onClick={() => setResultModalOpen(false)}
              style={{
                padding: '12px 32px',
                background: resultSuccess || resultTitle === 'Skipped' ? theme.success : theme.error,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMWinnersPage;
