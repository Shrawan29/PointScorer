import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const RulesetListPage = () => {
  const { friendId } = useParams();

  const [rulesets, setRulesets] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setError('');
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/rulesets/friend/${friendId}`);
        setRulesets(res.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load rulesets');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [friendId]);

  return (
    <Layout>
      <PageHeader
        title="Rulesets"
        subtitle="Rulesets are attached to a friend and used by sessions." 
        actions={
          <div className="flex gap-2">
            <Link to={`/friends/${friendId}`}>
              <Button variant="secondary">Back</Button>
            </Link>
            <Link to={`/friends/${friendId}/rulesets/new`}>
              <Button>Create</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card title="List">
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : rulesets.length === 0 ? (
          <div className="text-sm text-slate-600">No rulesets yet.</div>
        ) : (
          <div className="grid gap-2">
            {rulesets.map((r) => (
              <div key={r._id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{r.rulesetName}</div>
                  <div className="text-xs text-slate-500">{r._id}</div>
                </div>
                <Link to={`/friends/${friendId}/rulesets/${r._id}`}>
                  <Button variant="secondary">Open</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
};

export default RulesetListPage;
