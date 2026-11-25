import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, User } from 'lucide-react';
import { apiClient, extractApiError } from '../lib/api.ts';
import { formatINR, formatTimestampIST } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

export function ProfilePage() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { notify } = useToast();

  const [details, setDetails] = useState<any>(null);
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    apiClient
      .get('/auth/me')
      .then(({ data }) => setDetails(data))
      .catch(() => {});
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiClient.put('/auth/profile', { name });
      await refreshUser();
      notify('Profile updated.', 'success');
    } catch (err) {
      notify(extractApiError(err), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await apiClient.put('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      notify('Password updated successfully.', 'success');
    } catch (err) {
      notify(extractApiError(err), 'error');
    } finally {
      setSavingPw(false);
    }
  };

  if (authLoading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-10 text-center max-w-lg mx-auto my-8">
        <h2 className="text-xl font-bold text-slate-50 mb-2">Sign in to view your profile</h2>
        <p className="text-sm text-slate-400 mb-6">
          Manage your account details, security settings, and saved research history.
        </p>
        <Link to="/login" className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-50">User Profile &amp; Activity</h2>
        <p className="text-xs text-slate-400 mt-1">
          {user.email} · Role: {user.role} · Provider: {user.authProvider}
        </p>
      </div>

      {/* Activity Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Portfolio Holdings', details?.stats?.holdingsCount ?? 0, '/portfolio'],
          ['Watchlist Equities', details?.stats?.watchlistCount ?? 0, '/watchlist'],
          ['Saved AI Analyses', details?.stats?.analysesCount ?? 0, '/ai-analysis'],
          ['ML Forecast Runs', details?.stats?.predictionsCount ?? 0, '/predictions'],
        ].map(([label, val, to]: any) => (
          <Link
            key={label}
            to={to}
            className="bg-[#111827] border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 transition-colors"
          >
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-2xl font-bold text-slate-50 num mt-1">{val}</div>
          </Link>
        ))}
      </div>

      {/* Profile & Password Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleProfileSave}
          className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <User className="w-4 h-4 text-blue-400" />
            Account Information
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Display Name</label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-400 opacity-70"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        <form
          onSubmit={handlePasswordChange}
          className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Lock className="w-4 h-4 text-blue-400" />
            Change Password
          </div>
          {user.authProvider === 'google' ? (
            <p className="text-xs text-slate-400 leading-relaxed">
              Your account is authenticated via Google Sign-In. Password changes and 2-Step
              Verification are managed directly in your Google Account security settings.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">New Password (min. 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={savingPw}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
              >
                {savingPw ? 'Updating...' : 'Update Password'}
              </button>
            </>
          )}
        </form>
      </div>

      {/* Recent AI Analysis History */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800/80">
          <h3 className="text-sm font-semibold text-slate-100">Recent AI Research History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs text-slate-400 text-left">
                <th className="py-3 px-5 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Stock</th>
                <th className="py-3 px-4 font-medium">Stance</th>
                <th className="py-3 px-4 font-medium text-right">Price at Run</th>
                <th className="py-3 px-4 font-medium text-right">Confidence</th>
                <th className="py-3 px-5 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(details?.recentAnalyses || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No saved AI research briefs yet. Run an analysis in the AI Research module.
                  </td>
                </tr>
              ) : (
                details.recentAnalyses.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-5 text-xs text-slate-400 num">
                      {formatTimestampIST(item.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-100">
                      <Link to={`/ai-analysis?symbol=${encodeURIComponent(item.symbol)}`} className="hover:text-blue-400">
                        {item.symbol}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-200">{item.decision}</td>
                    <td className="py-3 px-4 text-right num text-slate-300">{formatINR(item.currentPrice)}</td>
                    <td className="py-3 px-4 text-right num text-slate-300">{item.confidenceScore}%</td>
                    <td className="py-3 px-5 text-xs text-slate-400 max-w-md truncate">{item.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
