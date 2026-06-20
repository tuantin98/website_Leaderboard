import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';

const wheelSegments = [
  { label: '+10', value: 10, color: '#06b6d4' },
  { label: '+20', value: 20, color: '#22c55e' },
  { label: '+50', value: 50, color: '#f59e0b' },
  { label: '+100', value: 100, color: '#ef4444' },
  { label: 'Try Again', value: 0, color: '#8b5cf6' },
];

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leaderboardRes, sessionRes] = await Promise.all([
          api.get('/student/leaderboard'),
          api.get('/student/session'),
        ]);
        setLeaderboard(leaderboardRes.data.users || []);
        setSession(sessionRes.data.session);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    socketRef.current = socket;
    socket.emit('join', { userId: user?.id, role: user?.role });

    socket.on('leaderboard:update', (data) => setLeaderboard(data));
    socket.on('session:update', (data) => setSession(data));
    socket.on('user:permission', ({ userId, canSpin }) => {
      if (userId === user?.id) {
        setResult((prev) => ({ ...prev, canSpin }));
      }
    });
    socket.on('spin:result', (data) => {
      if (data.userId === user?.id) {
        setResult(data);
      }
    });

    return () => socket.disconnect();
  }, [user]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;

    ctx.clearRect(0, 0, size, size);
    wheelSegments.forEach((segment, index) => {
      const startAngle = (Math.PI * 2 * index) / wheelSegments.length - Math.PI / 2 + rotation;
      const endAngle = startAngle + Math.PI * 2 / wheelSegments.length;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate((startAngle + endAngle) / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(segment.label, radius * 0.6, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  }, [rotation]);

  const canSpin = useMemo(() => {
    return user?.canSpin === true && session?.status === 'active' && !spinning;
  }, [user, session, spinning]);

  const handleSpin = async () => {
    if (!canSpin) return;

    try {
      setSpinning(true);
      const res = await api.post('/student/spin');
      const points = res.data.result.points;
      const extraTurns = 5 + Math.random() * 3;
      const target = 360 * extraTurns + (wheelSegments.findIndex((s) => s.value === points) * 360) / wheelSegments.length;
      setRotation((prev) => prev + target);
      setTimeout(() => {
        setSpinning(false);
      }, 4000);
    } catch (error) {
      setSpinning(false);
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Student dashboard</p>
            <h1 className="text-3xl font-semibold">{user?.username}</h1>
          </div>
          <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2">Logout</button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Current score</p>
                <h2 className="text-4xl font-bold">{user?.totalScore || 0}</h2>
              </div>
              <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
                {session?.status || 'idle'}
              </span>
            </div>
            <div className="mt-6 flex justify-center">
              <div className="relative">
                <canvas ref={canvasRef} width={420} height={420} className="rounded-full" />
                <div className="absolute right-0 top-1/2 h-0 w-0 border-y-[14px] border-y-transparent border-r-[24px] border-r-yellow-400" />
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleSpin}
                disabled={!canSpin}
                className={`rounded-xl px-8 py-3 font-semibold ${
                  canSpin
                    ? 'bg-cyan-500 text-slate-950'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
              >
                {spinning ? 'Spinning...' : 'SPIN'}
              </button>
            </div>
            {result && (
              <p className="mt-4 text-center text-sm text-emerald-300">
                Last result: {result.result?.label || '—'}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">Leaderboard</h3>
            <div className="mt-4 space-y-3">
              {leaderboard.map((entry, index) => (
                <div key={entry._id} className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">#{index + 1}</span>
                    <span>{entry.username}</span>
                  </div>
                  <span className="font-semibold text-cyan-300">{entry.totalScore}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
