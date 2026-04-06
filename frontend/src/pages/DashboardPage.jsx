import React from 'react';
import Layout from '../components/Layout.jsx';
import DashboardMatches from './Dashboard.jsx';

export const DashboardPage = () => {
  return (
    <Layout>
      <DashboardMatches />
    </Layout>
  );
};

export default DashboardPage;