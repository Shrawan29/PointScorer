import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const EVENT_META = {
  run: { label: 'Runs', hint: 'Per run', defaults: { points: 1, multiplier: 1 } },
  four: { label: 'Fours', hint: 'Per 4 hit', defaults: { points: 0, multiplier: 1 } },
  six: { label: 'Sixes', hint: 'Per 6 hit', defaults: { points: 0, multiplier: 1 } },
  wicket: { label: 'Wickets', hint: 'Per wicket', defaults: { points: 0, multiplier: 1 } },
  catch: { label: 'Catches', hint: 'Per catch', defaults: { points: 0, multiplier: 1 } },
  runout: { label: 'Run outs', hint: 'Per run out', defaults: { points: 0, multiplier: 1 } },
  fifty: { label: '50 (milestone)', hint: 'If runs ≥ 50', defaults: { points: 0, multiplier: 1 } },
  hundred: { label: '100 (milestone)', hint: 'If runs ≥ 100', defaults: { points: 0, multiplier: 1 } },
  threeWicket: { label: '3W (milestone)', hint: 'If wickets ≥ 3', defaults: { points: 0, multiplier: 1 } },
  fiveWicket: { label: '5W (milestone)', hint: 'If wickets ≥ 5', defaults: { points: 0, multiplier: 1 } },
};

const EVENT_OPTIONS = Object.keys(EVENT_META);

const CAPTAIN_MULTIPLIER = 2;

export const RulesetCreatePage = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();

  const [rulesetName, setRulesetName] = useState('');
  const [rules, setRules] = useState([{ event: 'run', points: 1, multiplier: 1, enabled: true }]);
  const [captainMultiplierEnabled, setCaptainMultiplierEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newEvent, setNewEvent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => rulesetName.trim().length > 0 && rules.length > 0, [rulesetName, rules]);

  const selectedEvents = useMemo(
    () => new Set((Array.isArray(rules) ? rules : []).map((r) => String(r?.event || ''))),
    [rules]
  );

  const availableEvents = useMemo(() => {
    const used = selectedEvents;
    return EVENT_OPTIONS.filter((ev) => !used.has(ev));
  }, [selectedEvents]);

  const updateRule = (idx, patch) => {
    setRules((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };

        // Prevent duplicates when changing event.
        if (patch && typeof patch.event === 'string') {
          const event = patch.event;
          const alreadyUsedElsewhere = list.some((x, j) => j !== idx && String(x?.event || '') === event);
          if (alreadyUsedElsewhere) return r;

          const meta = EVENT_META[event];
          if (meta) {
            // If user just switched event, adopt defaults when fields are missing.
            if (typeof next.points !== 'number' || Number.isNaN(next.points)) next.points = meta.defaults.points;
            if (typeof next.multiplier !== 'number' || Number.isNaN(next.multiplier)) next.multiplier = meta.defaults.multiplier;
          }
        }

        return next;
      });
    });
  };

  const addRule = (event) => {
    const ev = String(event || '').trim();
    if (!ev) return;
    if (!EVENT_META[ev]) return;
    if (selectedEvents.has(ev)) return;

    const defaults = EVENT_META[ev].defaults;
    setRules((prev) => [...(Array.isArray(prev) ? prev : []), { event: ev, points: defaults.points, multiplier: defaults.multiplier, enabled: true }]);
  };

  const removeRule = (idx) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      const safeRules = (Array.isArray(rules) ? rules : []).filter((r) => r?.event !== 'captainMultiplier');
      const rulesWithCaptain = [
        ...safeRules,
        {
          event: 'captainMultiplier',
          points: 0,
          multiplier: CAPTAIN_MULTIPLIER,
          enabled: captainMultiplierEnabled,
        },
      ];
      const res = await axiosInstance.post('/api/rulesets', {
        friendId,
        rulesetName,
        rules: rulesWithCaptain,
      });
      navigate(`/friends/${friendId}/rulesets/${res.data._id}`, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create ruleset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Create Ruleset"
        subtitle="Keep it simple: add events, set points, optionally enable captain multiplier." 
        actions={
          <Link to={`/friends/${friendId}/rulesets`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4">
        <Card title="Basics">
          <div className="grid gap-3">
            <FormField
              label="Ruleset name"
              value={rulesetName}
              onChange={setRulesetName}
              placeholder="e.g., Weekend League"
            />
            <div className="text-xs text-slate-600">
              Tip: you can tweak rules later; it affects only future sessions.
            </div>
          </div>
        </Card>

        <Card title="Scoring rules">
          <div className="border rounded-md p-3 mb-3 bg-slate-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-slate-700">Captain multiplier</div>
                <div className="text-xs text-slate-600">When enabled, captain points are multiplied by {CAPTAIN_MULTIPLIER}x.</div>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={captainMultiplierEnabled}
                  onChange={(e) => setCaptainMultiplierEnabled(e.target.checked)}
                />
                <div className="text-sm text-slate-700">Enabled</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-3">
            <label className="block flex-1">
              <div className="text-sm font-medium text-slate-700 mb-1">Add scoring event</div>
              <select
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                className="w-full px-3 py-2.5 border rounded-md bg-white"
              >
                <option value="">Select event…</option>
                {availableEvents.map((ev) => (
                  <option key={ev} value={ev}>
                    {EVENT_META[ev]?.label || ev}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-600 mt-1">
                {newEvent ? EVENT_META[newEvent]?.hint : availableEvents.length === 0 ? 'All events already added.' : 'Pick an event to add a rule.'}
              </div>
            </label>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!newEvent}
                onClick={() => {
                  addRule(newEvent);
                  setNewEvent('');
                }}
              >
                Add
              </Button>
              <label className="flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-md bg-white">
                <input
                  type="checkbox"
                  checked={showAdvanced}
                  onChange={(e) => setShowAdvanced(e.target.checked)}
                />
                <div className="text-sm text-slate-700">Advanced</div>
              </label>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="text-sm text-slate-600">No scoring events yet. Add an event above.</div>
          ) : (
            <div className="grid gap-2">
              {rules.map((rule, idx) => {
                const ev = String(rule?.event || '');
                const meta = EVENT_META[ev];

                return (
                  <div key={`${ev}-${idx}`} className="border border-slate-200 rounded-md p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{meta?.label || ev || 'Event'}</div>
                        <div className="text-xs text-slate-600">{meta?.hint || 'Custom rule'}</div>
                      </div>

                      <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
                        <label className="block">
                          <div className="text-xs font-medium text-slate-700 mb-1">Points</div>
                          <input
                            type="number"
                            value={String(rule.points ?? 0)}
                            onChange={(e) => updateRule(idx, { points: Number(e.target.value) })}
                            className="w-full sm:w-28 px-3 py-2.5 border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </label>

                        {showAdvanced ? (
                          <label className="block">
                            <div className="text-xs font-medium text-slate-700 mb-1">Multiplier</div>
                            <input
                              type="number"
                              value={String(rule.multiplier ?? 1)}
                              onChange={(e) => updateRule(idx, { multiplier: Number(e.target.value) })}
                              className="w-full sm:w-28 px-3 py-2.5 border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                            />
                          </label>
                        ) : null}

                        <label className="flex items-center gap-2 h-10 mt-5 sm:mt-0">
                          <input
                            type="checkbox"
                            checked={rule.enabled !== false}
                            onChange={(e) => updateRule(idx, { enabled: e.target.checked })}
                          />
                          <div className="text-sm text-slate-700">Enabled</div>
                        </label>

                        <div className="flex items-center justify-end">
                          <Button variant="danger" onClick={() => removeRule(idx)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={loading || !canSubmit}>
            {loading ? 'Creating...' : 'Create ruleset'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default RulesetCreatePage;
