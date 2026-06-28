import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../services/config';
import { defaultWheelSegments } from '../services/wheel';

let segmentUidCounter = 0;
const nextSegmentUid = () => {
  segmentUidCounter += 1;
  return `seg-${segmentUidCounter}`;
};

const withUids = (segments) => segments.map((segment) => ({ ...segment, _uid: segment._uid || nextSegmentUid() }));

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessionName, setSessionName] = useState('');
  const [wheelSegments, setWheelSegments] = useState(() => withUids(defaultWheelSegments));
  const [spinInputs, setSpinInputs] = useState({}); // per-user amount being typed
  const [bulkAmount, setBulkAmount] = useState('');
  const [scoreEditUser, setScoreEditUser] = useState(null); // student whose score is being edited
  const [scoreInput, setScoreInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const emptyCreateForm = { username: '', password: '', totalScore: '0', spinsRemaining: '0' };
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState('');

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

    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('token') },
    });

    // Named handlers so cleanup removes exactly these (no duplicate listeners).
    const handleConnect = () => socket.emit('join', { role: 'admin' });
    const handleSession = (data) => setSession(data);
    const handleWheel = (data) => setWheelSegments(withUids(data?.length ? data : defaultWheelSegments));
    // Roster live-refresh (includes each student's spinsRemaining/spinsExecuted).
    const handleLeaderboard = (data) => setUsers(data);

    socket.on('connect', handleConnect);
    socket.on('session:update', handleSession);
    socket.on('wheel:update', handleWheel);
    socket.on('leaderboardUpdated', handleLeaderboard);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('session:update', handleSession);
      socket.off('wheel:update', handleWheel);
      socket.off('leaderboardUpdated', handleLeaderboard);
      socket.disconnect();
    };
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

  // Allocate spins to one student. mode: 'add' (increment) or 'set' (overwrite).
  const allocateSpins = async (userId, mode) => {
    const amount = Number(spinInputs[userId]);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      const res = await api.put('/admin/users/spins', { userId, amount, mode });
      const updated = res.data.user;
      setUsers((prev) => prev.map((user) => (user._id === userId ? { ...user, ...updated } : user)));
      setSpinInputs((prev) => ({ ...prev, [userId]: '' }));
    } catch (error) {
      console.error(error);
    }
  };

  const openCreateModal = () => {
    setCreateForm(emptyCreateForm);
    setCreateError('');
    setShowCreateModal(true);
  };

  // Admin creates a new student account. Backend hashes the password,
  // forces role='student', and broadcasts the updated roster.
  const createStudent = async () => {
    const { username, password, totalScore, spinsRemaining } = createForm;
    if (!username.trim() || !password) {
      setCreateError('Username and password are required');
      return;
    }
    try {
      const res = await api.post('/admin/users/create', {
        username: username.trim(),
        password,
        totalScore: Number(totalScore) || 0,
        spinsRemaining: Number(spinsRemaining) || 0,
      });
      // Socket broadcast will also refresh the roster; merge in case this tab is first.
      setUsers((prev) =>
        prev.some((u) => u._id === res.data.user._id) ? prev : [...prev, res.data.user]
      );
      setShowCreateModal(false);
    } catch (error) {
      setCreateError(error.response?.data?.message || 'Failed to create student');
    }
  };

  // Open the score editor modal pre-filled with the student's current score.
  const openScoreEditor = (user) => {
    setScoreEditUser(user);
    setScoreInput(String(user.totalScore ?? 0));
  };

  const closeScoreEditor = () => {
    setScoreEditUser(null);
    setScoreInput('');
  };

  // Save the manually edited score. Backend validates a non-negative integer.
  const saveScore = async () => {
    if (!scoreEditUser) return;
    const score = Number(scoreInput);
    if (!Number.isInteger(score) || score < 0) return;
    try {
      const res = await api.put(`/admin/users/${scoreEditUser._id}/update-score`, { totalScore: score });
      const updated = res.data.user;
      setUsers((prev) => prev.map((u) => (u._id === updated._id ? { ...u, ...updated } : u)));
      closeScoreEditor();
    } catch (error) {
      console.error(error);
    }
  };

  // Permanently delete a student (with confirmation). The backend force-logs-out
  // any live sessions of that user via Socket.io.
  const deleteUser = async (user) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${user.username}? All their scores and spin history will be permanently lost.`
    );
    if (!confirmed) return;
    try {
      await api.delete(`/admin/users/${user._id}`);
      setUsers((prev) => prev.filter((u) => u._id !== user._id));
    } catch (error) {
      console.error(error);
    }
  };

  // Bulk allocate to every student.
  const bulkAllocate = async (mode) => {
    const amount = Number(bulkAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      await api.put('/admin/users/spins', { amount, mode });
      await fetchData();
      setBulkAmount('');
    } catch (error) {
      console.error(error);
    }
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">Student roster</h2>
              <button onClick={openCreateModal} className="rounded-2xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400">+ Create New Student</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                placeholder="Spins"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                className="w-24 rounded-xl bg-slate-950 px-3 py-2 text-white outline-none ring-1 ring-slate-700"
              />
              <button onClick={() => bulkAllocate('add')} className="rounded-2xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Bulk Add</button>
              <button onClick={() => bulkAllocate('set')} className="rounded-2xl bg-slate-700 px-4 py-2 font-semibold text-white">Bulk Set</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Remaining</th>
                  <th className="px-4 py-3 text-left">Completed</th>
                  <th className="px-4 py-3 text-right">Allocate Spins</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-t border-slate-800 bg-slate-900/50">
                    <td className="px-4 py-3 font-medium">{user.username}</td>
                    <td
                      className="px-4 py-3 cursor-pointer hover:text-cyan-300"
                      title="Double-click to edit score"
                      onDoubleClick={() => openScoreEditor(user)}
                    >
                      {user.totalScore}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${user.spinsRemaining > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {user.spinsRemaining || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">{user.spinsExecuted || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={spinInputs[user._id] ?? ''}
                          onChange={(e) => setSpinInputs((prev) => ({ ...prev, [user._id]: e.target.value }))}
                          className="w-20 rounded-lg bg-slate-950 px-2 py-1 text-white outline-none ring-1 ring-slate-700"
                        />
                        <button onClick={() => allocateSpins(user._id, 'add')} className="rounded-lg bg-cyan-500 px-3 py-1 font-semibold text-slate-950">Add</button>
                        <button onClick={() => allocateSpins(user._id, 'set')} className="rounded-lg bg-slate-700 px-3 py-1 font-semibold text-white">Set</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openScoreEditor(user)}
                          title="Edit score"
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 font-semibold text-slate-950 hover:bg-amber-400"
                        >
                          ✎ Edit Score
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          title="Delete user"
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-2xl font-semibold text-white">Create New Student</h3>
            <div className="mt-5 space-y-3">
              <div>
                <label className="block text-sm text-slate-400">Username</label>
                <input
                  autoFocus
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-white outline-none ring-1 ring-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-white outline-none ring-1 ring-slate-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400">Initial Score</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.totalScore}
                    onChange={(e) => setCreateForm((f) => ({ ...f, totalScore: e.target.value }))}
                    className="mt-1 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-white outline-none ring-1 ring-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400">Spins Remaining</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.spinsRemaining}
                    onChange={(e) => setCreateForm((f) => ({ ...f, spinsRemaining: e.target.value }))}
                    className="mt-1 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-white outline-none ring-1 ring-slate-700"
                  />
                </div>
              </div>
              {createError && <p className="text-sm text-rose-400">{createError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="rounded-2xl bg-slate-700 px-5 py-2 font-semibold text-white">Cancel</button>
              <button onClick={createStudent} className="rounded-2xl bg-emerald-500 px-5 py-2 font-semibold text-slate-950">Submit</button>
            </div>
          </div>
        </div>
      )}

      {scoreEditUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <p className="text-sm text-slate-400">Edit score</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{scoreEditUser.username}</h3>
            <label className="mt-5 block text-sm text-slate-400">New total score</label>
            <input
              type="number"
              min="0"
              autoFocus
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveScore()}
              className="mt-2 w-full rounded-xl bg-slate-950 px-4 py-3 text-white outline-none ring-1 ring-slate-700"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={closeScoreEditor} className="rounded-2xl bg-slate-700 px-5 py-2 font-semibold text-white">Cancel</button>
              <button onClick={saveScore} className="rounded-2xl bg-emerald-500 px-5 py-2 font-semibold text-slate-950">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
