import React from 'react';
import { Link } from 'react-router-dom';

import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-slate-900">404</h1>
          <p className="text-lg text-slate-600 mt-2">Page not found</p>
        </div>
        <Card title="">
          <div className="text-xs sm:text-sm text-slate-600 mb-4">That page does not exist.</div>
          <Link to="/dashboard" className="w-full block">
            <Button fullWidth>Go to dashboard</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
};

export default NotFoundPage;
