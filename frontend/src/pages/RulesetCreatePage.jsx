import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

const EVENT_OPTIONS = [
  'run',
  'four',
  'six',
  'wicket',
  'catch',
  'runout',
  'fifty',
  'hundred',
  'threeWicket',
  'fiveWicket',
  'captainMultiplier',
];

export const RulesetCreatePage = () => {
  const { friendId } = useParams();
  const navigate = useNavigate();

  const [rulesetName, setRulesetName] = useState('');
  const [rules, setRules] = useState([{ event: 'run', points: 1, multiplier: 1, enabled: true }]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => rulesetName.trim().length > 0 && rules.length > 0, [rulesetName, rules]);

  const updateRule = (idx, patch) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    setRules((prev) => [...prev, { event: 'run', points: 0, multiplier: 1, enabled: true }]);
  };

  const removeRule = (idx) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      const res = await axiosInstance.post('/api/rulesets', {
        friendId,
        rulesetName,
        rules,
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
        subtitle="Edits apply to future matches. History uses stored session rulesetId and calculated points." 
        actions={
          <Link to={`/friends/${friendId}/rulesets`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4">
        <Card title="Basic">
          <FormField label="Ruleset name" value={rulesetName} onChange={setRulesetName} />
        </Card>

        <Card
          title="Rules"
          actions={
            <Button variant="secondary" onClick={addRule}>
              Add rule
            </Button>
          }
        >
          <div className="grid gap-3">
            {rules.map((rule, idx) => (
              <div key={idx} className="border rounded-md p-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Event</div>
                    <select
                      value={rule.event}
                      onChange={(e) => updateRule(idx, { event: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md bg-white"
                    >
                      {EVENT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>

                  <FormField
                    label="Points"
                    type="number"
                    value={String(rule.points ?? 0)}
                    onChange={(v) => updateRule(idx, { points: Number(v) })}
                  />

                  <FormField
                    label="Multiplier"
                    type="number"
                    value={String(rule.multiplier ?? 1)}
                    onChange={(v) => updateRule(idx, { multiplier: Number(v) })}
                  />

                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Enabled</div>
                    <div className="flex items-center gap-2 h-10">
                      <input
                        type="checkbox"
                        checked={rule.enabled !== false}
                        onChange={(e) => updateRule(idx, { enabled: e.target.checked })}
                      />
                      <Button variant="danger" onClick={() => removeRule(idx)}>
                        Remove
                      </Button>
                    </div>
                  </label>
                </div>
              </div>
            ))}
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
