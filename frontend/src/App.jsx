import React, { Suspense, lazy, useCallback } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const FriendDetailPage = lazy(() => import('./pages/FriendDetailPage.jsx'));
const FriendsListPage = lazy(() => import('./pages/FriendsListPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const MatchDetails = lazy(() => import('./pages/MatchDetails.jsx'));
const MatchCreatePage = lazy(() => import('./pages/MatchCreatePage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const PlayerSelectionPage = lazy(() => import('./pages/PlayerSelectionPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const BreakdownPage = lazy(() => import('./pages/BreakdownPage.jsx'));
const ResultPage = lazy(() => import('./pages/ResultPage.jsx'));
const RulesetCreatePage = lazy(() => import('./pages/RulesetCreatePage.jsx'));
const RulesetDetailPage = lazy(() => import('./pages/RulesetDetailPage.jsx'));
const RulesetListPage = lazy(() => import('./pages/RulesetListPage.jsx'));
const SelectFriend = lazy(() => import('./pages/SelectFriend.jsx'));
const SharePage = lazy(() => import('./pages/SharePage.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const FriendPublicHomePage = lazy(() => import('./pages/FriendPublicHomePage.jsx'));
const FriendPublicResultPage = lazy(() => import('./pages/FriendPublicResultPage.jsx'));
const FriendPublicBreakdownPage = lazy(() => import('./pages/FriendPublicBreakdownPage.jsx'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage.jsx'));
const RequestPasswordResetPage = lazy(() => import('./pages/RequestPasswordResetPage.jsx'));
const LiveRoomCreatePage = lazy(() => import('./pages/LiveRoomCreatePage.jsx'));
const LiveRoomPage = lazy(() => import('./pages/LiveRoomPage.jsx'));

const RouteFallback = () => (
	<div className="min-h-[35vh] flex items-center justify-center text-sm text-slate-500">Loading...</div>
);

const withSuspense = (element) => (
	<Suspense fallback={<RouteFallback />}>
		{element}
	</Suspense>
);

const normalizeInsightsRoute = (pathname) => {
	const safePath = String(pathname || '/');
	const withoutObjectIds = safePath.replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/[id]');
	const withoutLongNumbers = withoutObjectIds.replace(/\/\d{4,}(?=\/|$)/g, '/[id]');
	if (withoutLongNumbers.length > 1 && withoutLongNumbers.endsWith('/')) {
		return withoutLongNumbers.slice(0, -1);
	}
	return withoutLongNumbers || '/';
};

const RootRedirect = () => {
	const { isAuthenticated } = useAuth();
	return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

const PublicOnlyRoute = ({ children }) => {
	const { isAuthenticated } = useAuth();
	if (isAuthenticated) return <Navigate to="/dashboard" replace />;
	return children;
};

const InviteOnlyRegisterRoute = ({ children }) => {
	const location = useLocation();
	const qp = new URLSearchParams(location.search || '');
	const inviteToken = String(qp.get('invite') || '').trim();
	if (!inviteToken) return <Navigate to="/login" replace />;
	return children;
};

export const App = () => {
	const location = useLocation();
	const speedInsightsDsn = import.meta.env.VITE_VERCEL_SPEED_INSIGHTS_DSN;
	const currentRoute = normalizeInsightsRoute(location.pathname);
	const speedInsightsBeforeSend = useCallback((event) => ({
		...event,
		route: currentRoute || event?.route || '/',
	}), [currentRoute]);

	return (
		<>
			<Routes>
				<Route path="/" element={<RootRedirect />} />
				<Route path="/login" element={<PublicOnlyRoute>{withSuspense(<LoginPage />)}</PublicOnlyRoute>} />
				<Route
					path="/register"
					element={
						<PublicOnlyRoute>
							<InviteOnlyRegisterRoute>{withSuspense(<RegisterPage />)}</InviteOnlyRegisterRoute>
						</PublicOnlyRoute>
					}
				/>
				<Route path="/request-password-reset" element={<PublicOnlyRoute>{withSuspense(<RequestPasswordResetPage />)}</PublicOnlyRoute>} />
				<Route path="/friend-view/:token" element={withSuspense(<FriendPublicHomePage />)} />
				<Route path="/friend-view/:token/sessions/:sessionId/result" element={withSuspense(<FriendPublicResultPage />)} />
				<Route path="/friend-view/:token/sessions/:sessionId/breakdown" element={withSuspense(<FriendPublicBreakdownPage />)} />

				<Route element={<ProtectedRoute />}>
					<Route path="/dashboard" element={withSuspense(<DashboardPage />)} />
					<Route path="/change-password" element={withSuspense(<ChangePasswordPage />)} />
					<Route path="/admin" element={withSuspense(<AdminDashboard />)} />
					<Route path="/matches/:matchId" element={withSuspense(<MatchDetails />)} />
					<Route path="/select-friend/:matchId" element={withSuspense(<SelectFriend />)} />
					<Route path="/friends" element={withSuspense(<FriendsListPage />)} />
					<Route path="/live-friends" element={<Navigate to="/friends?tab=active" replace />} />
					<Route path="/live-rooms/new/:friendId" element={withSuspense(<LiveRoomCreatePage />)} />
					<Route path="/live-rooms/:roomId" element={withSuspense(<LiveRoomPage />)} />
					<Route path="/friends/:friendId" element={withSuspense(<FriendDetailPage />)} />

					<Route path="/rulesets/new-template" element={withSuspense(<RulesetCreatePage />)} />
					<Route path="/friends/:friendId/rulesets" element={withSuspense(<RulesetListPage />)} />
					<Route path="/friends/:friendId/rulesets/new" element={withSuspense(<RulesetCreatePage />)} />
					<Route path="/friends/:friendId/rulesets/:rulesetId" element={withSuspense(<RulesetDetailPage />)} />

					<Route path="/friends/:friendId/matches/new" element={withSuspense(<MatchCreatePage />)} />

					<Route path="/sessions/:sessionId/selection" element={withSuspense(<PlayerSelectionPage />)} />
					<Route path="/player-selection/:sessionId" element={withSuspense(<PlayerSelectionPage />)} />
					<Route path="/sessions/:sessionId/result" element={withSuspense(<ResultPage />)} />
					<Route path="/sessions/:sessionId/breakdown" element={withSuspense(<BreakdownPage />)} />
					<Route path="/sessions/:sessionId/share" element={withSuspense(<SharePage />)} />
				</Route>

				<Route path="*" element={withSuspense(<NotFoundPage />)} />
			</Routes>
			<Analytics />
			<SpeedInsights
				dsn={speedInsightsDsn || undefined}
				route={currentRoute}
				beforeSend={speedInsightsBeforeSend}
				debug={import.meta.env.DEV}
			/>
		</>
	);
};

export default App;
