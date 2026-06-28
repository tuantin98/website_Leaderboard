import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SOCKET_URL } from '../services/config';
import { io } from 'socket.io-client';
import { defaultWheelSegments } from '../services/wheel';

const normalizeDegrees = (value) => ((value % 360) + 360) % 360;

// Pick black or white text depending on how light the slice colour is (WCAG-ish
// relative luminance) so labels always stay high-contrast.
const getContrastColor = (hexColor) => {
  const hex = String(hexColor || '').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if ([r, g, b].some(Number.isNaN)) return '#ffffff';
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
};

// Shrink the font until the label fits the space available along the slice's
// radial axis — guarantees long labels like "Not lucky" never bleed past borders.
const fitFontSize = (ctx, text, maxFontPx, minFontPx, maxWidthPx) => {
  let fontPx = maxFontPx;
  // eslint-disable-next-line no-constant-condition
  while (fontPx > minFontPx) {
    ctx.font = `700 ${fontPx}px Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidthPx) break;
    fontPx -= 1;
  }
  return fontPx;
};

// Standalone wheel renderer. Draws N equal slices and centers each label
// radially within its own sector using translate + rotate transforms.
function drawWheel(ctx, segments, rotationDeg, size) {
  const center = size / 2;
  const outerRadius = center - 18;
  const count = Math.max(segments.length, 1);
  const sector = (Math.PI * 2) / count;
  // Place text in the widest part of the slice (~65% of the outer radius).
  const textRadius = outerRadius * 0.65;
  // Tangential room at that radius caps the font height; radial room caps width.
  const arcWidth = sector * textRadius;
  const maxFontPx = Math.min(16, Math.round(arcWidth * 0.62));
  const maxTextWidth = outerRadius * 0.5;

  ctx.clearRect(0, 0, size, size);

  segments.forEach((segment, index) => {
    const startAngle = -Math.PI / 2 + index * sector + (rotationDeg * Math.PI) / 180;
    const endAngle = startAngle + sector;
    const midAngle = (startAngle + endAngle) / 2;

    // Slice wedge.
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, outerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.stroke();

    // Centered radial label.
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(midAngle);
    // Flip labels on the left hemisphere so they stay upright/readable.
    const normalized = normalizeDegrees((midAngle * 180) / Math.PI);
    const flipped = normalized > 90 && normalized < 270;
    if (flipped) ctx.rotate(Math.PI);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getContrastColor(segment.color);
    fitFontSize(ctx, segment.text, maxFontPx, 9, maxTextWidth);
    ctx.fillText(segment.text, flipped ? -textRadius : textRadius, 0);
    ctx.restore();
  });

  // Hub.
  ctx.beginPath();
  ctx.arc(center, center, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  // Single right-side pointer (3 o'clock).
  ctx.beginPath();
  ctx.moveTo(center + outerRadius + 10, center);
  ctx.lineTo(center + outerRadius - 18, center - 22);
  ctx.lineTo(center + outerRadius - 18, center + 22);
  ctx.closePath();
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
}

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
    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;

    // Named handlers so the cleanup can remove exactly these — guarantees we
    // never stack duplicate listeners across re-renders or mobile refreshes.
    const handleConnect = () => {
      // Belt-and-suspenders: re-assert the room (handshake auth already joined it).
      socket.emit('join', { userId: user?.id, role: user?.role });
    };
    const handleLeaderboard = (data) => {
      // Delay leaderboard refresh until our own wheel has stopped (read via ref).
      if (spinningRef.current) {
        pendingLeaderboardRef.current = data;
      } else {
        setLeaderboard(data);
      }
    };
    const handleSession = (data) => {
      setSession(data);
      setWheelSegments(data?.wheelSegments?.length ? data.wheelSegments : defaultWheelSegments);
    };
    const handleWheel = (data) => {
      setWheelSegments(data?.length ? data : defaultWheelSegments);
    };
    // Real-time quota/score sync. While THIS tab's wheel is mid-spin we buffer the
    // update so the visible score/quota only changes once the wheel stops.
    const handleSpins = (data) => {
      if (spinningRef.current) {
        pendingStatsRef.current = data;
        return;
      }
      setStats((prev) => ({
        totalScore: data.totalScore ?? prev.totalScore,
        spinsRemaining: data.spinsRemaining ?? prev.spinsRemaining,
        spinsExecuted: data.spinsExecuted ?? prev.spinsExecuted,
      }));
    };
    // Admin deleted this account: clear auth + state and bounce to login.
    const handleForcedLogout = (data) => {
      const message = data?.message || 'Your account has been removed by the Admin.';
      logout();
      navigate('/login', { replace: true, state: { message } });
    };

    socket.on('connect', handleConnect);
    socket.on('leaderboardUpdated', handleLeaderboard);
    socket.on('session:update', handleSession);
    socket.on('wheel:update', handleWheel);
    socket.on('spinsUpdated', handleSpins);
    socket.on('forcedLogout', handleForcedLogout);

    return () => {
      // Remove every listener, then tear down the connection.
      socket.off('connect', handleConnect);
      socket.off('leaderboardUpdated', handleLeaderboard);
      socket.off('session:update', handleSession);
      socket.off('wheel:update', handleWheel);
      socket.off('spinsUpdated', handleSpins);
      socket.off('forcedLogout', handleForcedLogout);
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
    drawWheel(ctx, wheelSegments, rotation, canvas.width);
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

      // Prefer the backend-chosen sector index (exact, even with duplicate labels);
      // fall back to a label match only if an older server omits it.
      const index = Number.isInteger(spinResult.index)
        ? spinResult.index
        : wheelSegments.findIndex((s) => s.text === spinResult.text && s.value === spinResult.value);

      // --- Right-pointer alignment math (pointer fixed at 3 o'clock = canvas 0°) ---
      // Each sector spans `sectorAngle`. Sectors are drawn starting at -90° (top),
      // so sector i's center sits at: -90 + (i + 0.5)*sectorAngle + rotation.
      // To land that center on the right pointer (0°): rotation = 90 - (i+0.5)*sectorAngle.
      const sectorAngle = 360 / Math.max(wheelSegments.length, 1);
      const desiredFinalRotation = 90 - (index + 0.5) * sectorAngle;
      const currentNormalized = normalizeDegrees(rotationRef.current);
      const deltaToTarget = (desiredFinalRotation - currentNormalized + 360) % 360;
      // Add 5 full turns for the spin effect, then settle exactly on the target.
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
