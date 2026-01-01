import { OrganiserItem } from "../types";

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});

const toSafeString = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : String(value);
};

export const renderWeeklyOrganiserCard = (item: OrganiserItem): string => {
	const iconByType: Record<string, string> = {
		recipe: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
		exercise: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`,
		task: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="m9 12 2 2 4-4"/></svg>`,
	};
	const icon = iconByType[item.type] ?? iconByType.task;

	const title = escapeHtml(toSafeString(item.title));
	const coverImage =
		typeof item.coverImage === "string"
			? escapeHtml(item.coverImage)
			: "";

	const imageHTML = coverImage
		? `<div class="card-cover"><img src="${coverImage}" alt="${title}" draggable="false" /></div>`
		: "";

	return `
		<div class="organiser-card-content">
			${imageHTML}
			<div class="card-header">
				${icon}
				<div class="card-title">${title}</div>
			</div>
		</div>
	`;
};
