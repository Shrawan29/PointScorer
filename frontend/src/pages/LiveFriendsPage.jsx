import React from 'react';

import ActiveFriendsPanel from '../components/ActiveFriendsPanel.jsx';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';

export const LiveFriendsPage = () => {
  return (
    <Layout>
      <PageHeader
        title="Active Friends"
        subtitle="Only linked users appear here."
      />
      <ActiveFriendsPanel />
    </Layout>
  );
};

export default LiveFriendsPage;
