import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const CAPTAIN_MULTIPLIER = 2;

const EVENT_META = [
  { key: 'run', label: 'Runs', hint: 'Per run', defaults: { points: 1, multiplier: 1 } },
  { key: 'four', label: 'Fours', hint: 'Per four', defaults: { points: 0, multiplier: 1 } },
  { key: 'six', label: 'Sixes', hint: 'Per six', defaults: { points: 0, multiplier: 1 } },
  { key: 'wicket', label: 'Wickets', hint: 'Per wicket', defaults: { points: 0, multiplier: 1 } },
  { key: 'catch', label: 'Catches', hint: 'Per catch', defaults: { points: 0, multiplier: 1 } },
  { key: 'runout', label: 'Run outs', hint: 'Per run out', defaults: { points: 0, multiplier: 1 } },
  { key: 'fifty', label: '50 milestone', hint: 'Bonus if runs ≥ 50', defaults: { points: 0, multiplier: 1 } },
  { key: 'hundred', label: '100 milestone', hint: 'Bonus if runs ≥ 100', defaults: { points: 0, multiplier: 1 } },
  { key: 'threeWicket', label: '3-wicket haul', hint: 'Bonus if wickets ≥ 3', defaults: { points: 0, multiplier: 1 } },
  { key: 'fiveWicket', label: '5-wicket haul', hint: 'Bonus if wickets ≥ 5', defaults: { points: 0, multiplier: 1 } },
];

const DEFAULT_RULES = EVENT_META.map((m) => ({
  event: m.key,
  points: m.defaults.points,
  multiplier: m.defaults.multiplier,
  enabled: m.key === 'run',
}));

export const RulesetCreatePage = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();

  const [rulesetName, setRulesetName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [captainMultiplierEnabled, setCaptainMultiplierEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => rulesetName.trim().length > 0, [rulesetName]);

  const updateRule = (idx, patch) => {
    setRules((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    });
  };

  const setAllEnabled = (enabled) => {
    setRules((prev) => (Array.isArray(prev) ? prev : []).map((r) => ({ ...r, enabled })));
  };

  const resetDefaults = () => {
    setRules(DEFAULT_RULES);
    setCaptainMultiplierEnabled(true);
    setShowAdvanced(false);
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      const safeRules = Array.isArray(rules) ? rules : [];
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
        friendId: isTemplate ? null : friendId,
        rulesetName,
        description,
        rules: rulesWithCaptain,
        isTemplate,
      });
      
      if (isTemplate) {
        navigate('/rulesets', { replace: true });
      } else {
        navigate(`/friends/${friendId}/rulesets/${res.data._id}`, { replace: true });
      }
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
        subtitle="All scoring events are listed. Just toggle and set points." 
        actions={
          <Link to={isTemplate ? '/rulesets' : `/friends/${friendId}/rulesets`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4">
        <Card title="Basics" className="p-3">
          <div className="grid gap-3">
            <FormField
              label="Ruleset name"
              value={rulesetName}
              onChange={setRulesetName}
              placeholder="e.g., Weekend League"
            />
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isTemplate}
                onChange={(e) => setIsTemplate(e.target.checked)}
              />
              <div className="text-sm text-slate-700">Create as reusable template</div>
            </label>
            
            {isTemplate && (
              <FormField
                label="Description"
                value={description}
                onChange={setDescription}
                placeholder="Describe when to use this template..."
              />
            )}
            
            <div className="text-xs text-slate-600">
              Tip: you can tweak rules later; it affects only future sessions.
            </div>
          </div>
        </Card>

        <Card
          title="Scoring rules"
          className="p-3"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAllEnabled(true)}>
                Enable all
              </Button>
              <Button variant="secondary" onClick={() => setAllEnabled(false)}>
                Disable all
              </Button>
              <Button variant="secondary" onClick={resetDefaults}>
                Reset
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
          }
        >
          <div className="border rounded-md p-2.5 mb-2 bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-700">Captain multiplier</div>
                <div className="text-xs text-slate-600">Enable to apply a fixed {CAPTAIN_MULTIPLIER}x multiplier to captains.</div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={captainMultiplierEnabled}
                  onChange={(e) => setCaptainMultiplierEnabled(e.target.checked)}
                />
                <div className="text-sm text-slate-700">Enabled</div>
              </label>
            </div>
          </div>

          <div className="grid gap-2">
            {rules.map((rule, idx) => {
              const ev = String(rule?.event || '');
              const meta = EVENT_META.find((m) => m.key === ev);
              const enabled = rule.enabled !== false;
              const isMilestone = ev === 'fifty' || ev === 'hundred' || ev === 'threeWicket' || ev === 'fiveWicket';

              return (
                <div key={ev} className={`border border-slate-200 rounded-md p-2.5 ${enabled ? 'bg-white' : 'bg-slate-50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{meta?.label || ev}</div>
                      <div className="text-xs text-slate-600">{meta?.hint || ''}</div>
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-2">
                      <label className="block">
                        <div className="text-xs font-medium text-slate-700 mb-1">{isMilestone ? 'Bonus points' : 'Points'}</div>
                        <input
                          type="number"
                          value={String(rule.points ?? 0)}
                          disabled={!enabled}
                          onChange={(e) => updateRule(idx, { points: Number(e.target.value) })}
                          className="w-full sm:w-24 px-3 py-2 border rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                      </label>

                      {showAdvanced ? (
                        <label className="block">
                          <div className="text-xs font-medium text-slate-700 mb-1">Multiplier</div>
                          <input
                            type="number"
                            value={String(rule.multiplier ?? 1)}
                            disabled={!enabled}
                            onChange={(e) => updateRule(idx, { multiplier: Number(e.target.value) })}
                            className="w-full sm:w-24 px-3 py-2 border rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </label>
                      ) : null}

                      <label className="flex items-center gap-2 h-10 mt-5 sm:mt-0">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => updateRule(idx, { enabled: e.target.checked })}
                        />
                        <div className="text-sm text-slate-700">Enabled</div>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
