import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import axiosInstance from '../api/axiosInstance.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { copyToClipboard } from '../utils/copyToClipboard.js';

export const SharePage = () => {
  const { sessionId } = useParams();

  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setError('');
      setInfo('');
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/api/share/whatsapp/${sessionId}`);
        setText(res.data?.text || '');
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load share text');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [sessionId]);

  const onCopy = async () => {
    setError('');
    setInfo('');
    try {
      await copyToClipboard(text);
      setInfo('Copied');
    } catch {
      setError('Copy failed');
    }
  };

  return (
    <Layout>
      <PageHeader
        title="WhatsApp Share"
        subtitle="Copy and paste into WhatsApp."
        actions={
          <div className="flex gap-2">
            <Link to={`/sessions/${sessionId}/breakdown`}>
              <Button variant="secondary">Breakdown</Button>
            </Link>
            <Link to={`/sessions/${sessionId}/result`}>
              <Button variant="secondary">Result</Button>
            </Link>
            <Link to={`/sessions/${sessionId}/selection`}>
              <Button variant="secondary">Selection</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {info && <Alert type="success">{info}</Alert>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading...</div>
      ) : (
        <Card title="Text">
          <textarea
            value={text}
            readOnly
            className="w-full h-80 px-3 py-2 border rounded-md font-mono text-sm"
          />
          <div className="mt-3">
            <Button onClick={onCopy} disabled={!text}>
              Copy
            </Button>
          </div>
        </Card>
      )}
    </Layout>
  );
};

export default SharePage;
