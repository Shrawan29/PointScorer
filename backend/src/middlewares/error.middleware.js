export const errorMiddleware = (err, req, res, next) => {
	const statusCode = Number(err?.statusCode || err?.status || 500);
	const message = err?.message || 'Internal server error';

	// Keep logs server-side only
	// eslint-disable-next-line no-console
	console.error('[Error]', { statusCode, message });

	if (res.headersSent) return next(err);
	return res.status(statusCode).json({ message });
};

export default errorMiddleware;
