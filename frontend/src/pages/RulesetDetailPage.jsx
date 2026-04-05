import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import FormField from '../components/FormField.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const RulesetDetailPage = () => {
  const { friendId, rulesetId } = useParams();

  const [ruleset, setRuleset] = useState(null);
  const [history, setHistory] = useState([]);
  const [rulesetName, setRulesetName] = useState('');
  const [rulesText, setRulesText] = useState('[]');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const title = useMemo(() => ruleset?.rulesetName || 'Ruleset', [ruleset]);

  useEffect(() => {
    const run = async () => {
      setError('');
      try {
        const [rulesetRes, historyRes] = await Promise.all([
          axiosInstance.get(`/api/rulesets/${rulesetId}`),
          axiosInstance.get(`/api/history/ruleset/${friendId}/${rulesetId}`),
        ]);

        setRuleset(rulesetRes.data);
        setRulesetName(rulesetRes.data?.rulesetName || '');
        setRulesText(JSON.stringify(rulesetRes.data?.rules || [], null, 2));
        setHistory(historyRes.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load ruleset');
      }
    };

    run();
  }, [friendId, rulesetId]);

  const onSave = async () => {
    setError('');
    setSaving(true);
    try {
      const parsedRules = JSON.parse(rulesText);
      const res = await axiosInstance.put(`/api/rulesets/${rulesetId}`, {
        rulesetName,
        rules: parsedRules,
      });
      setRuleset(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save ruleset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title={title}
        subtitle="Editing affects future sessions only. Completed match points are stored and not recalculated." 
        actions={
          <Link to={`/friends/${friendId}/rulesets`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <div className="grid gap-4">
        <Card title="Edit">
          <div className="grid gap-3">
            <FormField label="Ruleset name" value={rulesetName} onChange={setRulesetName} />

            <label className="block">
              <div className="text-sm font-medium text-slate-700 mb-1">Rules (JSON array)</div>
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                className="w-full h-56 px-3 py-2 border rounded-md font-mono text-xs"
              />
            </label>

            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Card>

        <Card title="History (Completed Matches)">
          {history.length === 0 ? (
            <div className="text-sm text-slate-600">No completed matches for this ruleset.</div>
          ) : (
            <div className="grid gap-2">
              {history.map((s) => (
                <div key={s._id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{s.realMatchName}</div>
                    <div className="text-xs text-slate-500">
                      Played: {s.playedAt ? new Date(s.playedAt).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                  <Link to={`/sessions/${s._id}/result`}>
                    <Button variant="secondary">View result</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default RulesetDetailPage;
