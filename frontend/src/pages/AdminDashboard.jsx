import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessionName, setSessionName] = useState('');

  const fetchData = async () => {
    try {
      const [sessionRes, usersRes] = await Promise.all([
        api.get('/admin/session'),
        api.get('/admin/users'),
      ]);
      setSession(sessionRes.data.session);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createSession = async () => {
    if (!sessionName.trim()) return;
    const res = await api.post('/admin/session', { sessionName, status: 'paused' });
    setSession(res.data.session);
    setSessionName('');
  };

  const updateSession = async (status) => {
    if (!session?._id) return;
    const res = await api.put(`/admin/session/${session._id}`, { status });
    setSession(res.data.session);
  };

  const toggleUserSpin = async (userId, value) => {
    await api.put('/admin/users/toggle-spin', { userId, canSpin: value });
    await fetchData();
  };

  const toggleAllUsers = async (value) => {
    await api.put('/admin/users/toggle-spin', { canSpin: value });
    await fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Admin dashboard</p>
            <h1 className="text-3xl font-semibold">Session Control</h1>
          </div>
          <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2">Logout</button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              className="flex-1 rounded-lg bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
              placeholder="Session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
            <button onClick={createSession} className="rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
              Create Session
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => updateSession('active')} className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Start</button>
            <button onClick={() => updateSession('paused')} className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950">Pause</button>
            <button onClick={() => updateSession('ended')} className="rounded-lg bg-rose-500 px-4 py-2 font-semibold text-slate-950">End</button>
          </div>

          <div className="mt-6 rounded-xl bg-slate-950 p-4">
            <p className="text-slate-400">Current session</p>
            <h2 className="text-2xl font-semibold">{session?.sessionName || 'No session yet'}</h2>
            <p className="text-sm text-cyan-300">Status: {session?.status || '—'}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Student roster</h2>
            <button onClick={() => toggleAllUsers(true)} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Grant All</button>
          </div>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user._id} className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                <span>{user.username}</span>
                <label className="flex cursor-pointer items-center gap-2">
                  <span className="text-sm text-slate-400">Allow spin</span>
                  <input
                    type="checkbox"
                    checked={!!user.canSpin}
                    onChange={(e) => toggleUserSpin(user._id, e.target.checked)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
