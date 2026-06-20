import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

let segmentUidCounter = 0;
const nextSegmentUid = () => {
  segmentUidCounter += 1;
  return `seg-${segmentUidCounter}`;
};

const withUids = (segments) => segments.map((segment) => ({ ...segment, _uid: segment._uid || nextSegmentUid() }));

const defaultWheelSegments = [
  { text: '+10', value: 10, color: '#06b6d4' },
  { text: '+20', value: 20, color: '#22c55e' },
  { text: '+50', value: 50, color: '#f59e0b' },
  { text: '+100', value: 100, color: '#ef4444' },
  { text: 'Better luck next time', value: 0, color: '#8b5cf6' },
];

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessionName, setSessionName] = useState('');
  const [wheelSegments, setWheelSegments] = useState(() => withUids(defaultWheelSegments));

  const fetchData = async () => {
    try {
      const [sessionRes, usersRes, wheelRes] = await Promise.all([
        api.get('/admin/session'),
        api.get('/admin/users'),
        api.get('/admin/wheel-config'),
      ]);
      setSession(sessionRes.data.session);
      setUsers(usersRes.data.users || []);
      setWheelSegments(withUids(wheelRes.data.wheelSegments?.length ? wheelRes.data.wheelSegments : defaultWheelSegments));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    socket.on('connect', () => {
      socket.emit('join', { role: 'admin' });
    });

    socket.on('session:update', (data) => setSession(data));
    socket.on('wheel:update', (data) => setWheelSegments(withUids(data?.length ? data : defaultWheelSegments)));
    socket.on('leaderboard:update', (data) => setUsers(data));

    return () => socket.disconnect();
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
    setUsers((prev) => prev.map((user) => (user._id === userId ? { ...user, canSpin: value } : user)));
    await api.put('/admin/users/toggle-spin', { userId, canSpin: value });
  };

  const toggleAllUsers = async (value) => {
    setUsers((prev) => prev.map((user) => ({ ...user, canSpin: value })));
    await api.put('/admin/users/toggle-spin', { canSpin: value });
  };

  const updateSegment = (index, field, value) => {
    setWheelSegments((prev) =>
      prev.map((segment, segmentIndex) =>
        segmentIndex === index
          ? { ...segment, [field]: value }
          : segment
      )
    );
  };

  const addSegment = () => {
    setWheelSegments((prev) => [
      ...prev,
      {
        _uid: nextSegmentUid(),
        text: `+${prev.length * 10}`,
        value: prev.length * 10,
        color: '#1d4ed8',
      },
    ]);
  };

  const removeSegment = (index) => {
    setWheelSegments((prev) => prev.filter((_, segmentIndex) => segmentIndex !== index));
  };

  const saveWheelConfig = async () => {
    try {
      const payload = wheelSegments.map(({ _uid, ...segment }) => segment);
      await api.put('/admin/wheel-config', { wheelSegments: payload });
    } catch (error) {
      console.error(error);
    }
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

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
              placeholder="Session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
            <button onClick={createSession} className="rounded-2xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950">
              Create Session
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => updateSession('active')} className="rounded-2xl bg-emerald-500 px-5 py-2 font-semibold text-slate-950">Start</button>
            <button onClick={() => updateSession('paused')} className="rounded-2xl bg-amber-500 px-5 py-2 font-semibold text-slate-950">Pause</button>
            <button onClick={() => updateSession('ended')} className="rounded-2xl bg-rose-500 px-5 py-2 font-semibold text-slate-950">End</button>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-950 p-5">
            <p className="text-slate-400">Current session</p>
            <h2 className="text-2xl font-semibold">{session?.sessionName || 'No session yet'}</h2>
            <p className="text-sm text-cyan-300">Status: {session?.status || '—'}</p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Wheel segment config</h2>
            <div className="flex gap-2">
              <button onClick={addSegment} className="rounded-2xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Add segment</button>
              <button onClick={saveWheelConfig} className="rounded-2xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Save wheel</button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {wheelSegments.map((segment, index) => (
              <div key={segment._uid} className="grid gap-2 rounded-2xl bg-slate-950 p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                <input
                  className="rounded-xl bg-slate-900 px-3 py-2 text-white outline-none ring-1 ring-slate-700"
                  value={segment.text}
                  onChange={(e) => updateSegment(index, 'text', e.target.value)}
                />
                <input
                  type="number"
                  className="rounded-xl bg-slate-900 px-3 py-2 text-white outline-none ring-1 ring-slate-700"
                  value={segment.value}
                  onChange={(e) => updateSegment(index, 'value', Number(e.target.value) || 0)}
                />
                <input
                  type="color"
                  className="h-10 rounded-xl bg-slate-900 px-2 py-1"
                  value={segment.color}
                  onChange={(e) => updateSegment(index, 'color', e.target.value)}
                />
                <button onClick={() => removeSegment(index)} className="rounded-xl bg-rose-500 px-3 py-2 font-semibold text-white">Delete</button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Student roster</h2>
            <div className="flex gap-2">
              <button onClick={() => toggleAllUsers(true)} className="rounded-2xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Grant All</button>
              <button onClick={() => toggleAllUsers(false)} className="rounded-2xl bg-slate-700 px-4 py-2 font-semibold text-white">Revoke All</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Spins</th>
                  <th className="px-4 py-3 text-right">Allow Spin</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-t border-slate-800 bg-slate-900/50">
                    <td className="px-4 py-3 font-medium">{user.username}</td>
                    <td className="px-4 py-3">{user.totalScore}</td>
                    <td className="px-4 py-3">{user.spinCount || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <span className={`text-xs ${user.canSpin ? 'text-emerald-300' : 'text-slate-400'}`}>{user.canSpin ? 'Enabled' : 'Disabled'}</span>
                        <input
                          type="checkbox"
                          checked={!!user.canSpin}
                          onChange={(e) => toggleUserSpin(user._id, e.target.checked)}
                          className="h-4 w-4 accent-cyan-500"
                        />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
