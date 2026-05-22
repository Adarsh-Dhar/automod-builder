import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import type { LevelUpEvent, RankLevel } from '../../shared/rank-types';
import { LEVEL_BADGES } from '../../shared/rank-types';

interface LeaderboardEntry {
  username: string;
  level: number;
}

interface ProfilePageProps {
  onNavigate: (page: string) => void;
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<LevelUpEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'history'>('leaderboard');
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [leaderboardRes, historyRes] = await Promise.all([
          fetch('/api/rank/leaderboard?limit=20'),
          fetch('/api/rank/history?limit=20'),
        ]);

        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          if (data.status === 'success') {
            setLeaderboard(data.leaderboard);
          }
        }

        if (historyRes.ok) {
          const data = await historyRes.json();
          if (data.status === 'success') {
            setHistory(data.history);
          }
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        toast({
          description: 'Failed to load profile data',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F2F7] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('hub')}
        >
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">Community Profile</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#EBEBEB] rounded-full p-1 mb-6">
        <Button
          variant={activeTab === 'leaderboard' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('leaderboard')}
          className={`flex-1 py-2 rounded-full text-sm text-center ${
            activeTab === 'leaderboard'
              ? 'bg-[#F5C842] text-[#1A1020] font-semibold'
              : 'text-[#888888] hover:text-[#1A1020]'
          }`}
        >
          Leaderboard
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-full text-sm text-center ${
            activeTab === 'history'
              ? 'bg-[#F5C842] text-[#1A1020] font-semibold'
              : 'text-[#888888] hover:text-[#1A1020]'
          }`}
        >
          Level-Ups
        </Button>
      </div>

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-2">
          <div className="mb-6 text-sm text-slate-600">
            Top ranked members in the community
          </div>

          {leaderboard.length === 0 ? (
            <Card className="p-8 text-center bg-white">
              <p>No rankings available yet</p>
            </Card>
          ) : (
            leaderboard.map((entry, idx) => (
              <Card
                key={entry.username}
                className="p-4 bg-white rounded-2xl flex items-center justify-between border-0 mb-2 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-[#EBEBEB] w-8 text-right">
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold">{entry.username}</p>
                    <p className="text-sm text-[#888888]">
                      Level {entry.level}
                    </p>
                  </div>
                </div>
                <div className="text-3xl">
                  {LEVEL_BADGES[(entry.level as unknown as RankLevel)]}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          <div className="mb-6 text-sm text-slate-600">
            Recent level-ups in the community
          </div>

          {history.length === 0 ? (
            <Card className="p-8 text-center bg-white">
              <p>No level-ups yet</p>
            </Card>
          ) : (
            history.map((event, idx) => (
              <Card key={idx} className="p-4 bg-white rounded-2xl border-0 mb-2 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{event.badge}</div>
                  <div className="flex-1">
                    <p className="font-semibold">u/{event.username}</p>
                    <p className="text-sm text-[#888888]">
                      Level {event.oldLevel} → {event.newLevel}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(event.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
