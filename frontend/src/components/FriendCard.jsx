import React from 'react';

export const FriendCard = ({ friend, selected, onSelect }) => {
	return (
		<div
			className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-3 ${
				selected ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/15 shadow-sm' : 'border-slate-200'
			}`}
		>
			<div className="min-w-0">
				<div className="font-semibold text-slate-900 text-sm sm:text-base truncate">{friend?.friendName || 'Friend'}</div>
			</div>
			<button
				type="button"
				onClick={onSelect}
				className={`min-h-9 px-3 rounded-lg text-xs sm:text-sm font-semibold border whitespace-nowrap ${
					selected
						? 'bg-[var(--brand)] text-white border-[var(--brand)]'
						: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
				}`}
			>
				{selected ? 'Selected' : 'Select'}
			</button>
		</div>
	);
};

export default FriendCard;
