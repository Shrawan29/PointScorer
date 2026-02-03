import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from './components/ProtectedRoute.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FriendDetailPage from './pages/FriendDetailPage.jsx';
import FriendsListPage from './pages/FriendsListPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MatchDetails from './pages/MatchDetails.jsx';
import MatchCreatePage from './pages/MatchCreatePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import PlayerSelectionPage from './pages/PlayerSelectionPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import BreakdownPage from './pages/BreakdownPage.jsx';
import ResultPage from './pages/ResultPage.jsx';
import RulesetCreatePage from './pages/RulesetCreatePage.jsx';
import RulesetDetailPage from './pages/RulesetDetailPage.jsx';
import RulesetListPage from './pages/RulesetListPage.jsx';
import SelectFriend from './pages/SelectFriend.jsx';
import SharePage from './pages/SharePage.jsx';

const RootRedirect = () => {
	const token = localStorage.getItem('token');
	return <Navigate to={token ? '/dashboard' : '/login'} replace />;
};

export const App = () => {
	return (
		<Routes>
			<Route path="/" element={<RootRedirect />} />
			<Route path="/login" element={<LoginPage />} />
			<Route path="/register" element={<RegisterPage />} />

			<Route element={<ProtectedRoute />}>
				<Route path="/dashboard" element={<DashboardPage />} />
				<Route path="/matches/:matchId" element={<MatchDetails />} />
				<Route path="/select-friend/:matchId" element={<SelectFriend />} />
				<Route path="/friends" element={<FriendsListPage />} />
				<Route path="/friends/:friendId" element={<FriendDetailPage />} />

				<Route path="/friends/:friendId/rulesets" element={<RulesetListPage />} />
				<Route path="/friends/:friendId/rulesets/new" element={<RulesetCreatePage />} />
				<Route path="/friends/:friendId/rulesets/:rulesetId" element={<RulesetDetailPage />} />

				<Route path="/friends/:friendId/matches/new" element={<MatchCreatePage />} />

				<Route path="/sessions/:sessionId/selection" element={<PlayerSelectionPage />} />
				<Route path="/player-selection/:sessionId" element={<PlayerSelectionPage />} />
				<Route path="/sessions/:sessionId/result" element={<ResultPage />} />
				<Route path="/sessions/:sessionId/breakdown" element={<BreakdownPage />} />
				<Route path="/sessions/:sessionId/share" element={<SharePage />} />
			</Route>

			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
};

export default App;
