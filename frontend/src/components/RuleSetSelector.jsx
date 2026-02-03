import React from 'react';

export const RuleSetSelector = ({ rulesets, value, onChange, disabled }) => {
	const list = Array.isArray(rulesets) ? rulesets : [];

	return (
		<label className="block">
			<div className="text-sm font-medium text-slate-700 mb-1">Ruleset</div>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				className="w-full px-3 py-2.5 border border-slate-200 rounded-md bg-white disabled:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300 text-sm"
			>
				<option value="">Select ruleset</option>
				{list.map((r) => (
					<option key={r._id} value={r._id}>
						{r.rulesetName}
					</option>
				))}
			</select>
		</label>
	);
};

export default RuleSetSelector;
