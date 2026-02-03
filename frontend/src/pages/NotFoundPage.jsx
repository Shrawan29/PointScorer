import React from 'react';
import { Link } from 'react-router-dom';

import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card title="Not Found">
          <div className="text-sm text-slate-600">That page does not exist.</div>
          <div className="mt-4">
            <Link to="/dashboard">
              <Button>Go to dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default NotFoundPage;
