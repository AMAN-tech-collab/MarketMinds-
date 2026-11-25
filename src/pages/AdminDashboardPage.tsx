import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Database, Loader2, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { apiClient, extractApiError } from '../lib/api.ts';
import { formatTimestampIST } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

export function AdminDashboardPage() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { notify } = useToast();

  const [overview, setOverview] = useState<any>(null);
  const [claimStatus, setClaimStatus] = useState<any>(null);
  const [passcode, setPasscode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (user.role === 'admin') {
        const { data } = await apiClient.get('/admin/overview');
        setOverview(data);
      } else {
        const { data } = await apiClient.get('/auth/admin-claim-status');
        setClaimStatus(data);
      }
    } catch (err) {
      setError(extractApiError(err, 'Unable to load admin console.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaiming(true);
    try {
      await apiClient.post('/auth/claim-admin', { passcode });
      await refreshUser();
      notify('Administrator role granted.', 'success');
    } catch (err) {
      notify(extractApiError(err, 'Unable to claim admin role.'), 'error');
    } finally {
      setClaiming(false);
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
        <h2 className="text-xl font-bold text-slate-50 mb-2">Administrator Authentication Required</h2>
        <p className="text-sm text-slate-400 mb-6">
          Sign in with an authorized administrator account to inspect service health, database telemetry, and error logs.
        </p>
        <Link to="/login" className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white">
          Sign In
        </Link>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-8 max-w-lg mx-auto my-8 space-y-4">
        <div className="flex items-center gap-2.5 text-amber-400">
          <ShieldCheck className="w-5 h-5" />
          <h2 className="text-lg font-bold text-slate-50">Restricted Admin Console</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          Your current account ({user.email}) has standard investor permissions. Only authorized administrators can view platform monitoring telemetry.
        </p>

        {claimStatus?.canBootstrapClaim && (
          <form onSubmit={handleClaimAdmin} className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-xs font-medium text-slate-300">
              {claimStatus.requiresPasscode
                ? 'Enter administrator setup passcode'
                : 'First-Run Bootstrap: Claim initial administrator role'}
            </div>
            {claimStatus.requiresPasscode && (
              <input
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="ADMIN_SETUP_PASSCODE"
                className="w-full bg-[#090D16] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
              />
            )}
            <button
              type="submit"
              disabled={claiming}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
            >
              {claiming ? 'Verifying...' : 'Claim Administrator Access'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Admin Service Monitoring</h2>
          <p className="text-xs text-slate-400 mt-1">
            Live PostgreSQL health, AI/ML engine status, user metrics, and API error logs
            {overview?.timestamp ? ` · ${formatTimestampIST(overview.timestamp)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={loadAdmin}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 whitespace-nowrap self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Telemetry
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {overview && (
        <>
          {/* Infrastructure Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>PostgreSQL (Cloud SQL)</span>
                <Database className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400 mt-1 capitalize">
                {overview.database.status}
              </div>
              <div className="text-xs text-slate-500 num mt-0.5">
                Query latency {overview.database.latencyMs} ms
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Node Express API</span>
                <Server className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400 mt-1">Healthy</div>
              <div className="text-xs text-slate-500 num mt-0.5">
                Uptime {Math.floor(overview.uptimeSeconds / 60)}m · RSS {overview.memoryUsageMb} MB
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs text-slate-400">AI &amp; ML Services</div>
              <div className="text-xl font-bold text-slate-100 mt-1">
                {overview.services.mlEngine}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Gemini AI: {overview.services.geminiAi} · Python External:{' '}
                {overview.services.externalPythonReachable
                  ? 'Connected'
                  : overview.services.externalPythonConfigured
                    ? 'Unreachable'
                    : 'Not Configured'}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4">
              <div className="text-xs text-slate-400">API Request Stats</div>
              <div className="text-xl font-bold text-slate-100 num mt-1">
                {overview.requests.totalLogged} calls
              </div>
              <div className="text-xs text-slate-400 num mt-0.5">
                Avg {overview.requests.avgDurationMs} ms · {overview.requests.errorCount} errors
              </div>
            </div>
          </div>

          {/* Platform Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              ['Registered Users', overview.counts.users],
              ['Portfolio Holdings', overview.counts.portfolioHoldings],
              ['Watchlist Items', overview.counts.watchlistItems],
              ['AI Analyses', overview.counts.analyses],
              ['ML Predictions', overview.counts.predictions],
            ].map(([label, val]) => (
              <div key={String(label)} className="bg-[#111827] border border-slate-800/80 rounded-xl p-4">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-2xl font-bold text-slate-50 num mt-1">{val}</div>
              </div>
            ))}
          </div>

          {/* Model Registry + Recent Users */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800/80 text-sm font-semibold text-slate-100">
                Registered AI &amp; ML Models
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/70 text-slate-400 text-left">
                    <th className="py-2.5 px-4 font-medium">Model</th>
                    <th className="py-2.5 px-4 font-medium">Version</th>
                    <th className="py-2.5 px-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {overview.models.map((m: any) => (
                    <tr key={m.name}>
                      <td className="py-2.5 px-4 text-slate-200 font-medium">{m.name}</td>
                      <td className="py-2.5 px-4 text-slate-400 num">{m.version}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-400">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800/80 text-sm font-semibold text-slate-100">
                Recent Users
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/70 text-slate-400 text-left">
                    <th className="py-2.5 px-4 font-medium">Name / Email</th>
                    <th className="py-2.5 px-4 font-medium">Role</th>
                    <th className="py-2.5 px-4 font-medium text-right">Provider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {overview.recentUsers.map((u: any) => (
                    <tr key={u.id}>
                      <td className="py-2.5 px-4">
                        <div className="text-slate-200 font-medium">{u.name}</div>
                        <div className="text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300 capitalize">{u.role}</td>
                      <td className="py-2.5 px-4 text-right text-slate-400 capitalize">{u.authProvider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error Logs */}
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800/80 text-sm font-semibold text-slate-100">
              Recent API Error Logs (HTTP 4xx / 5xx)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/70 text-slate-400 text-left">
                    <th className="py-2.5 px-4 font-medium">Timestamp</th>
                    <th className="py-2.5 px-4 font-medium">Method / Path</th>
                    <th className="py-2.5 px-4 font-medium text-right">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                    <th className="py-2.5 px-4 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {overview.recentErrors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No API errors logged.
                      </td>
                    </tr>
                  ) : (
                    overview.recentErrors.map((log: any) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 text-slate-400 num">
                          {formatTimestampIST(log.createdAt)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-200 num">
                          {log.method} {log.path}
                        </td>
                        <td className="py-2.5 px-4 text-right text-rose-400 num font-medium">
                          {log.statusCode}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 num">
                          {log.durationMs} ms
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{log.errorMessage || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
