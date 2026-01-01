import * as React from "react";
import { App, TFile, moment } from "obsidian";
import { BaseKanbanItem, BoardConfig } from "../types/kanban-config";
import {
	buildBoardsData,
	KanbanBoardData,
} from "../kanban/buildBoardsData";
import { matchesItemFilter } from "../kanban/itemFilter";
import { resolveKanbanConstructor } from "../kanban/resolveKanbanConstructor";

const momentFn = moment as any;

interface UseKanbanBoardOptions<T extends BaseKanbanItem> {
	app: App;
	boardId: string;
	config: BoardConfig<T>;
	renderItem: (item: T) => string;
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
	refreshDelayMs?: number;
	clickBlockMs?: number;
	internalUpdateDelayMs?: number;
	logPrefix?: string;
	onDropItem?: (itemId: string, targetColumnId: string) => Promise<void> | void;
	onCardClick?: (
		event: MouseEvent,
		itemId: string,
		itemEl: HTMLElement
	) => void;
}

interface UseKanbanBoardResult {
	containerRef: React.RefObject<HTMLDivElement>;
	rebuild: () => void;
}

export const useKanbanBoard = <T extends BaseKanbanItem>(
	options: UseKanbanBoardOptions<T>
): UseKanbanBoardResult => {
	const {
		app,
		boardId,
		config,
		renderItem,
		itemClassName,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
		onDropItem,
		onCardClick,
		refreshDelayMs = 50,
		clickBlockMs = 250,
		internalUpdateDelayMs = 250,
		logPrefix = "KanbanBoard",
	} = options;

	const containerRef = React.useRef<HTMLDivElement>(null);
	const kanbanInstanceRef = React.useRef<any>(null);
	const lastDragTimeRef = React.useRef(0);
	const lastInternalUpdateRef = React.useRef(0);
	const refreshTimerRef = React.useRef<number | null>(null);

	const buildBoards = React.useCallback((): KanbanBoardData[] => {
		return buildBoardsData(app, config, renderItem, {
			itemClassName,
			runtimeFilter,
			runtimeSort,
			groupBy,
			groupLabel,
			groupOrder,
		});
	}, [
		app,
		config,
		itemClassName,
		renderItem,
		runtimeFilter,
		runtimeSort,
		groupBy,
		groupLabel,
		groupOrder,
	]);

	const initKanban = React.useCallback(
		(initialBoards: KanbanBoardData[] = []) => {
			if (!containerRef.current) return;

			containerRef.current.innerHTML = "";

			try {
				const KanbanCtor = resolveKanbanConstructor();
				const kanban = new KanbanCtor({
					element: `#${boardId}`,
					gutter: "0px",
					widthBoard: "100%",
					dragBoards: false,
					boards: initialBoards,
					dragEl: (el: HTMLElement) => {
						if (el.classList.contains("kanban-group-header")) return;
						el.classList.add("is-dragging");
					},
					dragendEl: (el: HTMLElement) => {
						if (el.classList.contains("kanban-group-header")) return;
						el.classList.remove("is-dragging");
						lastDragTimeRef.current = Date.now();
					},
					dropEl: (
						el: HTMLElement,
						target: HTMLElement,
						_source: HTMLElement,
						_sibling: HTMLElement
					) => {
						if (el.classList.contains("kanban-group-header")) return;
						if (!onDropItem) return;

						const itemId = el.dataset.eid;
						const targetBoardEl = target.closest(
							".kanban-board"
						) as HTMLElement | null;
						const targetBoardId = targetBoardEl?.dataset.id;

						if (itemId && targetBoardId) {
							lastInternalUpdateRef.current = Date.now();
							Promise.resolve(onDropItem(itemId, targetBoardId)).catch(
								(err) => {
									console.error(
										`[${logPrefix}] Failed to update frontmatter`,
										err
									);
								}
							);
						}
					},
				});

				kanbanInstanceRef.current = kanban;

				// Mark today's column
				const today = momentFn().format("YYYY-MM-DD");
				const todayBoard = containerRef.current?.querySelector(
					`.kanban-board[data-id="${today}"]`
				);
				if (todayBoard) {
					todayBoard.classList.add("is-today");
				}
			} catch (err) {
				console.error(
					`[${logPrefix}] Error initializing jKanban`,
					err
				);
			}
		},
		[boardId, logPrefix, onDropItem]
	);

	const refreshBoard = React.useCallback(() => {
		if (!kanbanInstanceRef.current) return;
		if (Date.now() - lastInternalUpdateRef.current < internalUpdateDelayMs) {
			return;
		}

		const boards = buildBoards();
		initKanban(boards);
	}, [buildBoards, initKanban, internalUpdateDelayMs]);

	const scheduleRefresh = React.useCallback(() => {
		if (refreshTimerRef.current !== null) {
			window.clearTimeout(refreshTimerRef.current);
		}
		refreshTimerRef.current = window.setTimeout(() => {
			refreshTimerRef.current = null;
			refreshBoard();
		}, refreshDelayMs);
	}, [refreshBoard, refreshDelayMs]);

	const rebuild = React.useCallback(() => {
		const boards = buildBoards();
		initKanban(boards);
	}, [buildBoards, initKanban]);

	React.useEffect(() => {
		rebuild();

		const onMetadataChange = (file: TFile) => {
			if (!file) return;
			const cache = app.metadataCache.getFileCache(file);
			if (!matchesItemFilter(file, cache, config.itemFilter)) return;
			scheduleRefresh();
		};

		const ref = app.metadataCache.on("changed", onMetadataChange);

		return () => {
			app.metadataCache.offref(ref);
			if (refreshTimerRef.current !== null) {
				window.clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
			kanbanInstanceRef.current = null;
		};
	}, [app, config.itemFilter, rebuild, scheduleRefresh]);

	React.useEffect(() => {
		if (!onCardClick) return;
		const container = containerRef.current;
		if (!container) return;

		const handleClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;

			const itemEl = target.closest(".kanban-item") as HTMLElement | null;
			if (!itemEl) return;
			if (itemEl.classList.contains("kanban-group-header")) return;

			const timeSinceDrag = Date.now() - lastDragTimeRef.current;
			if (
				timeSinceDrag < clickBlockMs ||
				itemEl.classList.contains("is-dragging") ||
				itemEl.classList.contains("is-moving")
			) {
				return;
			}

			const itemId = itemEl.dataset.eid;
			if (!itemId) return;
			onCardClick(event, itemId, itemEl);
		};

		container.addEventListener("click", handleClick);
		return () => {
			container.removeEventListener("click", handleClick);
		};
	}, [clickBlockMs, onCardClick]);

	return { containerRef, rebuild };
};
