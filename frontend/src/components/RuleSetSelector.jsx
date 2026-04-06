import React from 'react';

export const RuleSetSelector = ({ rulesets, value, onChange, disabled }) => {
	const list = Array.isArray(rulesets) ? rulesets : [];

	return (
		<label className="block">
			<div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Ruleset</div>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 disabled:bg-slate-100"
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
