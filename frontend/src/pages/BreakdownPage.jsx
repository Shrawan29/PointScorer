import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { copyToClipboard } from '../utils/copyToClipboard.js';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const formatLine = (line) => {
  if (!line) return '';
  const label   = line.label || line.event || 'Rule';
  const formula = typeof line.formula === 'string' && line.formula ? line.formula : null;
  const points  = toNumber(line.points);
  return formula ? `${label}: ${formula}` : `${label}: ${points}`;
};

// ── Stat chip ─────────────────────────────────────────────────────────────────
const StatChip = ({ label, value }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 min-w-0">
    <span className="text-xs font-bold text-slate-900 tabular-nums">{value}</span>
    <span className="text-[10px] text-slate-400 mt-0.5 truncate">{label}</span>
  </div>
);

export const BreakdownPage = () => {
  const { sessionId } = useParams();
  const { user }      = useAuth();

  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [copying, setCopying]   = useState(false);
  const [shareText, setShareText] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const matchName = useMemo(
    () => data?.match?.realMatchName || data?.match?.realMatchId || '',
    [data]
  );

  const userPlayers   = useMemo(() => (Array.isArray(data?.teams?.USER)   ? data.teams.USER   : []), [data]);
  const friendPlayers = useMemo(() => (Array.isArray(data?.teams?.FRIEND) ? data.teams.FRIEND : []), [data]);

  const totals = useMemo(() => ({
    user:   toNumber(data?.totals?.userTotalPoints),
    friend: toNumber(data?.totals?.friendTotalPoints),
  }), [data]);

  const userDisplayName   = useMemo(() => user?.name || user?.email || 'My', [user]);
  const friendDisplayName = useMemo(
    () => data?.friend?.friendName || data?.friendName || 'Friend',
    [data]
  );

  const winnerSummary = useMemo(() => {
    const diff        = Math.abs(totals.user - totals.friend);
    const isCompleted = data?.matchState === 'COMPLETED' || data?.match?.status === 'COMPLETED';
    if (totals.user === totals.friend) return isCompleted ? 'Match tied' : 'Scores level';
    const winner = totals.user > totals.friend ? userDisplayName : friendDisplayName;
    return isCompleted
      ? `${winner} won by ${diff} point${diff === 1 ? '' : 's'}`
      : `${winner} leading by ${diff} point${diff === 1 ? '' : 's'}`;
  }, [totals, userDisplayName, friendDisplayName, data?.matchState, data?.match?.status]);

  useEffect(() => {
    const run = async () => {
      setError(''); setInfo(''); setLoading(true);
      try {
        const [breakdownRes, shareRes] = await Promise.all([
          axiosInstance.get(`/api/scoring/session/${sessionId}/breakdown?t=${Date.now()}`),
          axiosInstance.get(`/api/share/whatsapp-breakdown/${sessionId}`).catch(() => ({ data: { text: '' } })),
        ]);
        setData(breakdownRes.data);
        setShareText(shareRes?.data?.text || '');
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load breakdown');
      } finally { setLoading(false); }
    };
    run();
  }, [sessionId]);

  const toggleExpanded = (team, playerId) => {
    const key = `${team}:${String(playerId)}`;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onCopyWhatsAppBreakdown = async () => {
    setError(''); setInfo(''); setCopying(true);
    try {
      let text = shareText;
      if (!text) {
        const res = await axiosInstance.get(`/api/share/whatsapp-breakdown/${sessionId}`);
        text = res.data?.text || '';
        setShareText(text);
      }
      if (!text) { setError('No share text available'); return; }
      const copied = await copyToClipboard(text);
      if (copied) { setInfo('Copied WhatsApp breakdown text'); return; }
      if (navigator?.share) {
        await navigator.share({ text });
        setInfo('Opened share sheet. Choose WhatsApp to share.');
        return;
      }
      setError('Copy failed on this device. Please try long-press copy from share text.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to copy share text');
    } finally { setCopying(false); }
  };

  // ── Player accordion row ───────────────────────────────────────────────────
  const TeamSection = ({ title, teamKey, players }) => (
    <Card
      title={title}
      actions={
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {players.length}p
        </span>
      }
    >
      {players.length === 0 ? (
        <p className="text-sm text-slate-500">No players found.</p>
      ) : (
        <div className="grid gap-1.5">
          {players
            .slice()
            .sort((a, b) => toNumber(b?.totalPoints) - toNumber(a?.totalPoints))
            .map((p, idx) => {
              const key    = `${teamKey}:${String(p?.playerId)}`;
              const isOpen = expanded.has(key);
              const pts    = toNumber(p?.totalPoints);

              return (
                <div key={key} className={`rounded-xl border overflow-hidden transition-colors
                  ${isOpen ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50/60'}`}>

                  {/* Accordion header */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(teamKey, p?.playerId)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    {/* Rank */}
                    <span className="w-5 shrink-0 text-[11px] font-bold text-slate-300 tabular-nums text-right">
                      {idx + 1}
                    </span>

                    {/* Name + captain */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-900 truncate block">
                        {p?.playerId || 'Unknown'}
                      </span>
                      {p?.isCaptain && (
                        <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                          </svg>
                          Captain
                        </span>
                      )}
                    </div>

                    {/* Points + chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-black tabular-nums text-slate-800">{pts}</span>
                      <svg
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24"
                      >
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-slate-100">

                      {/* Stats chips */}
                      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                        <StatChip label="Runs"    value={toNumber(p?.stats?.runs)} />
                        <StatChip label="Fours"   value={toNumber(p?.stats?.fours)} />
                        <StatChip label="Sixes"   value={toNumber(p?.stats?.sixes)} />
                        <StatChip label="Wickets" value={toNumber(p?.stats?.wickets)} />
                        <StatChip label="Catches" value={toNumber(p?.stats?.catches)} />
                        <StatChip label="Runouts" value={toNumber(p?.stats?.runouts)} />
                      </div>

                      {/* Formula lines */}
                      <div className="mt-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                          Scoring rules
                        </div>
                        <div className="grid gap-1">
                          {Array.isArray(p?.lines) && p.lines.length > 0 ? (
                            p.lines.map((l, i) => (
                              <div
                                key={`${key}:line:${i}`}
                                className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 font-mono text-[11px] text-slate-600"
                              >
                                {formatLine(l)}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400">No rule lines found.</p>
                          )}
                        </div>
                      </div>

                      {/* Subtotal / total */}
                      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <span className="text-xs text-slate-500">Subtotal</span>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">{toNumber(p?.subtotal)}</span>
                        <span className="text-slate-200 text-xs">|</span>
                        <span className="text-xs text-slate-500">Total</span>
                        <span className="text-sm font-black text-slate-900 tabular-nums">{pts}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </Card>
  );

  return (
    <Layout>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 leading-tight">Points Breakdown</h1>
        {matchName && (
          <p className="mt-0.5 text-xs text-slate-400 leading-snug">{matchName}</p>
        )}
        <div className="flex gap-2 mt-3">
          <Link to={`/sessions/${sessionId}/result`} className="flex-1">
            <Button variant="secondary" fullWidth>Result</Button>
          </Link>
          <Button fullWidth onClick={onCopyWhatsAppBreakdown} disabled={copying}>
            {copying ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Copying…
              </span>
            ) : 'Share breakdown'}
          </Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {info  && <Alert type="success" floating>{info}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4 text-[var(--brand)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading…
        </div>
      ) : !data ? null : (
        <div className="grid gap-4">

          {/* ── Summary card ───────────────────────────────────────────────── */}
          <Card title="Summary">
            {/* Score blocks */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{userDisplayName}</div>
                <div className="text-3xl font-black tabular-nums text-slate-900">{totals.user}</div>
              </div>
              <div className="flex items-center justify-center px-1">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">vs</span>
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{friendDisplayName}</div>
                <div className="text-3xl font-black tabular-nums text-slate-900">{totals.friend}</div>
              </div>
            </div>

            {/* Result banner */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 text-center mb-3">
              {winnerSummary}
            </div>

            {/* Meta */}
            <div className="grid gap-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Generated</span>
                <span className="font-medium text-slate-700">
                  {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Ruleset</span>
                <span className="font-medium text-slate-700">{data?.ruleset?.rulesetName || '—'}</span>
              </div>
            </div>
          </Card>

          <TeamSection title={`${userDisplayName}'s Team`}   teamKey="USER"   players={userPlayers} />
          <TeamSection title={`${friendDisplayName}'s Team`} teamKey="FRIEND" players={friendPlayers} />

        </div>
      )}
    </Layout>
  );
};

export default BreakdownPage;