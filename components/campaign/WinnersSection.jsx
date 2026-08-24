import { useState, useEffect } from "react";
import api from "../../api";
import { useTheme } from "../../contexts/ThemeContext";

export function WinnersSection() {
  const { colors: T } = useTheme();
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('daily');
  const [campaignInfo, setCampaignInfo] = useState(null);

  const tabs = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'grand', label: 'Grand' },
  ];

  useEffect(() => {
    fetchWinners();
  }, [activeTab]);

  const fetchWinners = async () => {
    try {
      setLoading(true);
      const data = await api.request(`/admin/crm/campaign-winners/?selection_type=${activeTab}`);
      const winnersList = data.winners || [];

      // If no formal winners, check if campaign has been running long enough to show leaderboard
      if (winnersList.length === 0) {
        // Try to get campaign info to check duration
        let campaignData = campaignInfo;
        if (!campaignData) {
          try {
            const campaigns = await api.request('/campaigns/');
            const activeCampaign = campaigns.find(c => c.status === 'active');
            if (activeCampaign) {
              setCampaignInfo(activeCampaign);
              campaignData = activeCampaign;
            }
          } catch (e) {
            console.error('[WINNERS] Failed to fetch campaign info:', e);
          }
        }

        if (campaignData) {
          const now = new Date();
          const campaignStart = campaignData.start_date ? new Date(campaignData.start_date) : now;
          const daysRunning = Math.floor((now - campaignStart) / (1000 * 60 * 60 * 24));

          const minDaysRequired = {
            'daily': 1,
            'weekly': 7,
            'monthly': 30,
            'grand': 180,
          };

          const requiredDays = minDaysRequired[activeTab] || 1;

          if (daysRunning >= requiredDays) {
            console.log(`[WINNERS] Campaign has been running ${daysRunning} days (required: ${requiredDays}), fetching leaderboard as fallback`);
            try {
              const lbData = await api.request(`/campaigns/leaderboard/?period=${activeTab}`);
              const leaderboardWinners = (lbData.entries || []).slice(0, 10).map((entry, idx) => ({
                id: `lb-${entry.id}`,
                rank: entry.rank || idx + 1,
                user: entry.user,
                final_score: entry.score || entry.final_score,
                selection_method: 'Leaderboard',
                prize_claimed: false,
                is_from_leaderboard: true,
              }));
              setWinners(leaderboardWinners);
            } catch (lbError) {
              console.error('[WINNERS] Failed to load leaderboard fallback:', lbError);
              setWinners([]);
            }
          } else {
            console.log(`[WINNERS] Campaign has only been running ${daysRunning} days (required: ${requiredDays}), showing no winners`);
            setWinners([]);
          }
        } else {
          // No campaign info, try leaderboard anyway
          console.log('[WINNERS] No campaign info, trying leaderboard as fallback');
          try {
            const lbData = await api.request(`/campaigns/leaderboard/?period=${activeTab}`);
            const leaderboardWinners = (lbData.entries || []).slice(0, 10).map((entry, idx) => ({
              id: `lb-${entry.id}`,
              rank: entry.rank || idx + 1,
              user: entry.user,
              final_score: entry.score || entry.final_score,
              selection_method: 'Leaderboard',
              prize_claimed: false,
              is_from_leaderboard: true,
            }));
            setWinners(leaderboardWinners);
          } catch (lbError) {
            console.error('[WINNERS] Failed to load leaderboard fallback:', lbError);
            setWinners([]);
          }
        }
      } else {
        setWinners(winnersList);
      }
    } catch (error) {
      console.error("Failed to fetch winners:", error);
      setWinners([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: T.sub }}>
        Loading winners...
      </div>
    );
  }

  if (winners.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: T.sub }}>
        No {activeTab} winners yet
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ padding: "0 20px", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txt, marginBottom: 8 }}>
          🏆 Campaign Winners
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                background: activeTab === tab.id ? "#8fc441" : T.bg,
                color: activeTab === tab.id ? "#000" : T.txt,
                border: activeTab === tab.id ? "none" : `1px solid ${T.border}`,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px" }}>
        {winners.map((winner, idx) => (
          <div
            key={winner.id}
            style={{
              padding: 12,
              background: idx === 0 
                ? "linear-gradient(135deg, #FFD700, #FFA500)" 
                : T.bg,
              borderRadius: 12,
              border: idx === 0 ? "2px solid #FFD700" : `1px solid ${T.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: idx === 0 ? "#000" : T.pri + "30",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}>
                {idx === 0 ? "👑" : "🏅"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 700, 
                  color: idx === 0 ? "#000" : T.txt,
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap" 
                }}>
                  {winner.user?.username || "Unknown"}
                </div>
                <div style={{ 
                  fontSize: 10, 
                  color: idx === 0 ? "#333" : T.sub,
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap" 
                }}>
                  Rank #{winner.rank} • Score: {winner.final_score?.toFixed(1) || "N/A"}
                </div>
              </div>
            </div>
            <div style={{ 
              fontSize: 11, 
              color: idx === 0 ? "#000" : T.sub,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>Method: {winner.selection_method || "Top scorer"}</span>
              {winner.prize_claimed && <span>✅ Prize claimed</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}




