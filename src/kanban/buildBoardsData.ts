import { App } from "obsidian";
import { BaseKanbanItem, BoardConfig } from "../types/kanban-config";
import { getItemColumn } from "../utils/field-manager";
import { matchesItemFilter } from "./itemFilter";

export interface KanbanBoardData {
	id: string;
	title: string;
	item: { id: string; title: string; class: string }[];
}

interface BuildBoardsOptions<T extends BaseKanbanItem> {
	itemClassName?: string;
	runtimeFilter?: (
		item: T,
		frontmatter: Record<string, unknown>
	) => boolean;
	runtimeSort?: (a: T, b: T) => number;
	groupBy?: (
		item: T,
		frontmatter: Record<string, unknown>
	) => string | undefined;
	groupLabel?: (groupId: string) => string;
	groupOrder?: (a: string, b: string) => number;
}

export const buildBoardsData = <T extends BaseKanbanItem>(
	app: App,
	config: BoardConfig<T>,
	renderItem: (item: T) => string,
	options: BuildBoardsOptions<T> = {}
): KanbanBoardData[] => {
	const {
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
	} = options;
	const files = app.vault.getMarkdownFiles();
	const boardsData = config.columns.map((col) => ({
		id: col.id,
		title: col.title,
		item: [] as { id: string; title: string; class: string }[],
	}));
	const boardEntries = new Map<
		string,
		{ item: T; frontmatter: Record<string, unknown> }[]
	>();
	const resolvedClassName = itemClassName ?? "";

	for (const board of boardsData) {
		boardEntries.set(board.id, []);
	}

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		const frontmatter = cache.frontmatter || {};
		if (!matchesItemFilter(file, cache, config.itemFilter)) continue;

		let item: T;
		try {
			item = config.itemTransformer
				? config.itemTransformer(file, frontmatter)
				: (({
						id: file.path,
						title: (frontmatter.title as string) || file.basename,
						path: file.path,
					} as T));
		} catch {
			continue;
		}

		const columnId = getItemColumn(
			frontmatter,
			config.columns,
			config.fieldMapping
		);

		if (columnId) {
			const entries = boardEntries.get(columnId);
			if (entries) {
				entries.push({ item, frontmatter });
			}
		}
	}

	const resolveGroupId = (value: string | undefined): string =>
		value && value.trim().length > 0 ? value : "Ungrouped";

	for (const board of boardsData) {
		const entries = boardEntries.get(board.id) ?? [];
		const filteredEntries = runtimeFilter
			? entries.filter(({ item, frontmatter }) =>
					runtimeFilter(item, frontmatter)
				)
			: entries;
		const sortedEntries = runtimeSort
			? [...filteredEntries].sort((a, b) =>
					runtimeSort(a.item, b.item)
				)
			: filteredEntries;

		if (!groupBy) {
			for (const entry of sortedEntries) {
				board.item.push({
					id: entry.item.id,
					title: renderItem(entry.item),
					class: resolvedClassName,
				});
			}
			continue;
		}

		const grouped = new Map<
			string,
			{ item: T; frontmatter: Record<string, unknown> }[]
		>();
		for (const entry of sortedEntries) {
			const rawGroup = groupBy(entry.item, entry.frontmatter);
			const groupId = resolveGroupId(
				rawGroup ? String(rawGroup) : undefined
			);
			const bucket = grouped.get(groupId);
			if (bucket) {
				bucket.push(entry);
			} else {
				grouped.set(groupId, [entry]);
			}
		}

		const groupIds = Array.from(grouped.keys());
		if (groupOrder) {
			groupIds.sort(groupOrder);
		} else {
			groupIds.sort((a, b) => a.localeCompare(b));
		}

		for (const groupId of groupIds) {
			const label = groupLabel ? groupLabel(groupId) : groupId;
			board.item.push({
				id: `__group:${board.id}:${groupId}`,
				title: `<div class="kanban-group-label">${label}</div>`,
				class: "kanban-group-header",
			});
			const groupEntries = grouped.get(groupId) ?? [];
			for (const entry of groupEntries) {
				board.item.push({
					id: entry.item.id,
					title: renderItem(entry.item),
					class: resolvedClassName,
				});
			}
		}
	}

	return boardsData;
};
