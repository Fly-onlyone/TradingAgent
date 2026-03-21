/**
 * UI State Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeId } from "@/theme/presets";
import { sendNativeNotification } from "@/utils/nativeNotifications";

type SidebarState = "expanded" | "collapsed" | "hidden";

interface NotificationConfig {
	id: string;
	type: "success" | "error" | "warning" | "info";
	title: string;
	message?: string;
	duration?: number;
	action?: {
		label: string;
		onClick: () => void;
	};
}

interface ModalConfig {
	id: string;
	open: boolean;
	data?: unknown;
}

interface UIState {
	// Sidebar
	sidebarState: SidebarState;
	sidebarWidth: number;

	// Theme
	themeId: ThemeId;
	reducedMotion: boolean;
	effectsEnabled: boolean;

	// Zoom
	uiScale: number;

	// Notifications
	notifications: NotificationConfig[];

	// Modals
	modals: Record<string, ModalConfig>;

	// Loading
	globalLoading: boolean;
	loadingMessage: string;

	// Actions
	setSidebarState: (state: SidebarState) => void;
	toggleSidebar: () => void;
	setSidebarWidth: (width: number) => void;
	setThemeId: (id: ThemeId) => void;
	setReducedMotion: (reduced: boolean) => void;
	setEffectsEnabled: (enabled: boolean) => void;
	setUIScale: (scale: number) => void;

	addNotification: (notification: Omit<NotificationConfig, "id">) => string;
	removeNotification: (id: string) => void;
	clearNotifications: () => void;

	openModal: (id: string, data?: unknown) => void;
	closeModal: (id: string) => void;

	setGlobalLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			sidebarState: "expanded",
			sidebarWidth: 240,
			themeId: "solar" as ThemeId,
			reducedMotion: false,
			effectsEnabled: true,
		uiScale: 1,
			notifications: [],
			modals: {},
			globalLoading: false,
			loadingMessage: "",

			setSidebarState: (sidebarState) => set({ sidebarState }),

			toggleSidebar: () =>
				set((state) => ({
					sidebarState:
						state.sidebarState === "expanded" ? "collapsed" : "expanded",
				})),

			setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

			setThemeId: (themeId) => set({ themeId }),
			setReducedMotion: (reducedMotion) => set({ reducedMotion }),
			setEffectsEnabled: (effectsEnabled) => set({ effectsEnabled }),
		setUIScale: (uiScale) =>
			set({ uiScale: Math.max(0.75, Math.min(1.5, uiScale)) }),

			addNotification: (notification) => {
				const id = crypto.randomUUID();
				set((state) => ({
					notifications: [...state.notifications, { ...notification, id }],
				}));

				// Send native notification when tab is hidden and type warrants it
				if (
					document.hidden &&
					(notification.type === "error" || notification.type === "success")
				) {
					sendNativeNotification(
						notification.title,
						notification.message ?? "",
					);
				}

				// Auto-remove after duration
				const duration = notification.duration ?? 5000;
				if (duration > 0) {
					setTimeout(() => {
						get().removeNotification(id);
					}, duration);
				}

				return id;
			},

			removeNotification: (id) =>
				set((state) => ({
					notifications: state.notifications.filter((n) => n.id !== id),
				})),

			clearNotifications: () => set({ notifications: [] }),

			openModal: (id, data) =>
				set((state) => ({
					modals: {
						...state.modals,
						[id]: { id, open: true, data },
					},
				})),

			closeModal: (id) =>
				set((state) => ({
					modals: {
						...state.modals,
						[id]: { ...state.modals[id], open: false },
					},
				})),

			setGlobalLoading: (globalLoading, loadingMessage = "") =>
				set({ globalLoading, loadingMessage }),
		}),
		{
			name: "ui-storage",
			partialize: (state) => ({
				sidebarState: state.sidebarState,
				sidebarWidth: state.sidebarWidth,
				themeId: state.themeId,
				reducedMotion: state.reducedMotion,
				effectsEnabled: state.effectsEnabled,
				uiScale: state.uiScale,
			}),
		},
	),
);

// Notification helpers
export const notify = {
	success: (title: string, message?: string) =>
		useUIStore.getState().addNotification({ type: "success", title, message }),
	error: (title: string, message?: string) =>
		useUIStore.getState().addNotification({ type: "error", title, message }),
	warning: (title: string, message?: string) =>
		useUIStore.getState().addNotification({ type: "warning", title, message }),
	info: (title: string, message?: string) =>
		useUIStore.getState().addNotification({ type: "info", title, message }),
};

export default useUIStore;
