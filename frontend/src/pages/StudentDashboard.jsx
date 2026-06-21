import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';

const defaultWheelSegments = [
  { text: '+10', value: 10, color: '#06b6d4' },
  { text: '+20', value: 20, color: '#22c55e' },
  { text: '+50', value: 50, color: '#f59e0b' },
  { text: '+100', value: 100, color: '#ef4444' },
  { text: 'Better luck next time', value: 0, color: '#8b5cf6' },
];

const normalizeDegrees = (value) => ((value % 360) + 360) % 360;

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [session, setSession] = useState(null);
  const [stats, setStats] = useState({
    totalScore: user?.totalScore || 0,
    spinsRemaining: user?.spinsRemaining || 0,
    spinsExecuted: user?.spinsExecuted || 0,
  });
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [wheelSegments, setWheelSegments] = useState(defaultWheelSegments);
  const canvasRef = useRef(null);
  const rotationRef = useRef(0);
  const animationRef = useRef(null);
  const pendingLeaderboardRef = useRef(null);
  const pendingStatsRef = useRef(null);
  const socketRef = useRef(null);
  // Mirror `spinning` into a ref so the socket effect can read the latest value
  // without listing `spinning` in its deps (which would reconnect on every spin).
  const spinningRef = useRef(false);
  spinningRef.current = spinning;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [meRes, leaderboardRes, sessionRes] = await Promise.all([
          api.get('/student/me'),
          api.get('/student/leaderboard'),
          api.get('/student/session'),
        ]);

        const currentUser = meRes.data.user || {};
        setStats({
          totalScore: currentUser.totalScore || 0,
          spinsRemaining: currentUser.spinsRemaining || 0,
          spinsExecuted: currentUser.spinsExecuted || 0,
        });
        setLeaderboard(leaderboardRes.data.users || []);
        const currentSession = sessionRes.data.session;
        setSession(currentSession);
        setWheelSegments(currentSession?.wheelSegments?.length ? currentSession.wheelSegments : defaultWheelSegments);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();

    // Authenticate the socket via the JWT in the handshake — the server derives
    // our identity and joins us to our private room. This is stable across tabs
    // and page reloads (no reliance on a client-supplied user id).
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      // Belt-and-suspenders: re-assert the room (handshake auth already joined it).
      socket.emit('join', { userId: user?.id, role: user?.role });
    });

    socket.on('leaderboardUpdated', (data) => {
      // Delay leaderboard refresh until our own wheel has stopped (read via ref).
      if (spinningRef.current) {
        pendingLeaderboardRef.current = data;
      } else {
        setLeaderboard(data);
      }
    });
    socket.on('session:update', (data) => {
      setSession(data);
      setWheelSegments(data?.wheelSegments?.length ? data.wheelSegments : defaultWheelSegments);
    });
    socket.on('wheel:update', (data) => {
      setWheelSegments(data?.length ? data : defaultWheelSegments);
    });

    // Real-time quota sync: admin allocations and the student's own spins both
    // push the updated balance here. While THIS tab's wheel is mid-spin we buffer
    // the update so the visible score/quota only changes once the wheel stops.
    socket.on('spinsUpdated', (data) => {
      if (spinningRef.current) {
        pendingStatsRef.current = data;
        return;
      }
      setStats((prev) => ({
        totalScore: data.totalScore ?? prev.totalScore,
        spinsRemaining: data.spinsRemaining ?? prev.spinsRemaining,
        spinsExecuted: data.spinsExecuted ?? prev.spinsExecuted,
      }));
    });

    // Admin deleted this account: clear auth + state and bounce to login.
    socket.on('forcedLogout', (data) => {
      const message = data?.message || 'Your account has been removed by the Admin.';
      logout();
      navigate('/login', { replace: true, state: { message } });
    });

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (spinning) return;
    if (pendingLeaderboardRef.current) {
      setLeaderboard(pendingLeaderboardRef.current);
      pendingLeaderboardRef.current = null;
    }
    if (pendingStatsRef.current) {
      const data = pendingStatsRef.current;
      pendingStatsRef.current = null;
      setStats((prev) => ({
        totalScore: data.totalScore ?? prev.totalScore,
        spinsRemaining: data.spinsRemaining ?? prev.spinsRemaining,
        spinsExecuted: data.spinsExecuted ?? prev.spinsExecuted,
      }));
    }
  }, [spinning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 18;
    const sector = (Math.PI * 2) / Math.max(wheelSegments.length, 1);

    ctx.clearRect(0, 0, size, size);

    wheelSegments.forEach((segment, index) => {
      const startAngle = -Math.PI / 2 + index * sector + (rotation * Math.PI) / 180;
      const endAngle = startAngle + sector;

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
      ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText(segment.text, radius * 0.62, 6);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(center + radius + 10, center);
    ctx.lineTo(center + radius - 18, center - 22);
    ctx.lineTo(center + radius - 18, center + 22);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }, [rotation, wheelSegments]);

  // Quota-gated: the SPIN button is enabled only while the student has spins
  // left and the session is active (and no spin/popup is currently in flight).
  const canSpin = useMemo(() => {
    return stats.spinsRemaining > 0 && session?.status === 'active' && !spinning && !showResultModal;
  }, [stats.spinsRemaining, session, spinning, showResultModal]);

  const animateSpin = (targetRotation, onComplete) => {
    const duration = 3200;
    const startTime = performance.now();
    const startRotation = rotationRef.current;

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startRotation + (targetRotation - startRotation) * eased;
      rotationRef.current = normalizeDegrees(current);
      setRotation(rotationRef.current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        rotationRef.current = normalizeDegrees(targetRotation);
        setRotation(rotationRef.current);
        setSpinning(false);
        if (onComplete) onComplete();
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(step);
  };

  const handleSpin = async () => {
    if (!canSpin) return;

    try {
      setSpinning(true);
      setShowResultModal(false);
      setResult(null);
      const res = await api.post('/student/spin');
      const spinResult = res.data.result;
      const index = wheelSegments.findIndex((segment) => segment.text === spinResult.text && segment.value === spinResult.value);
      const sectorAngle = 360 / Math.max(wheelSegments.length, 1);
      const desiredFinalRotation = 90 - (index + 0.5) * sectorAngle;
      const currentNormalized = normalizeDegrees(rotationRef.current);
      const deltaToTarget = (desiredFinalRotation - currentNormalized + 360) % 360;
      const targetDegrees = rotationRef.current + 360 * 5 + deltaToTarget;

      // Delayed sync: only commit score/quota once the wheel has fully stopped.
      animateSpin(targetDegrees, () => {
        setResult(spinResult);
        setStats({
          totalScore: res.data.user.totalScore,
          spinsRemaining: res.data.user.spinsRemaining,
          spinsExecuted: res.data.user.spinsExecuted,
        });
        setShowResultModal(true);
        // Ack the server now that our animation has stopped — this is the signal
        // that it is safe to reveal our new score on everyone else's leaderboard.
        socketRef.current?.emit('spin:settled');
      });
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

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Current score</p>
                <h2 className="text-4xl font-bold">{stats.totalScore}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
                  {session?.status || 'idle'}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                  Spins Remaining: {stats.spinsRemaining}
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                  Spins Completed: {stats.spinsExecuted}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="relative">
                <canvas ref={canvasRef} width={420} height={420} className="rounded-full border border-slate-700" />
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleSpin}
                disabled={!canSpin}
                className={`rounded-2xl px-8 py-3 text-base font-semibold transition ${
                  canSpin
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:scale-[1.02]'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
              >
                {spinning
                  ? 'Spinning...'
                  : stats.spinsRemaining > 0
                    ? 'SPIN'
                    : 'No spins left'}
              </button>
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Leaderboard</h3>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                {canSpin ? 'Ready to spin' : 'Locked'}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {leaderboard.map((entry, index) => (
                <div key={entry._id} className="flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">#{index + 1}</span>
                    <span>{entry.username}</span>
                  </div>
                  <span className="font-semibold text-cyan-300">{entry.totalScore}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {showResultModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
            <p className="text-sm text-slate-400">Your reward</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">{result.text}</h3>
            <p className="mt-2 text-sm text-slate-400">
              You now have <span className="font-semibold text-cyan-300">{stats.totalScore}</span> points
            </p>
            <button
              onClick={() => setShowResultModal(false)}
              className="mt-6 rounded-2xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
