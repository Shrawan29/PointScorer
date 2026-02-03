import React from 'react';

export const FriendCard = ({ friend, selected, onSelect }) => {
	return (
		<div
			className={`bg-white border rounded-lg p-4 flex items-center justify-between gap-3 ${
				selected ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-200'
			}`}
		>
			<div className="min-w-0">
				<div className="font-medium text-slate-900 truncate">{friend?.friendName || 'Friend'}</div>
				<div className="text-xs text-slate-500 truncate">{friend?._id || ''}</div>
			</div>
			<button
				type="button"
				onClick={onSelect}
				className={`px-3 py-2 rounded-md text-sm border ${
					selected
						? 'bg-slate-900 text-white border-slate-900'
						: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
				}`}
			>
				{selected ? 'Selected' : 'Select'}
			</button>
		</div>
	);
};

export default FriendCard;
