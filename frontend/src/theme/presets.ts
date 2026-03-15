/**
 * Theme presets — each defines a full design system:
 * colors, glass/shape parameters, animation characteristics.
 */

export type ThemeId = "solar" | "glacier" | "jade" | "eclipse";

export interface ThemePreset {
	id: ThemeId;
	label: string;
	primary: { main: string; light: string; dark: string; contrastText: string };
	secondary: {
		main: string;
		light: string;
		dark: string;
		contrastText: string;
	};
	background: { default: string; paper: string };
	text: { primary: string; secondary: string; disabled: string };
	primaryRgb: string;
	secondaryRgb: string;
	surface: {
		glass: string;
		elevated: string;
		sidebar: string;
		header: string;
		tooltip: string;
		muted: string;
		hoverCard: string;
	};
	scrollbar: { thumb: string; thumbHover: string; track: string };
	semantics: {
		success: { main: string; light: string; dark: string };
		error: { main: string; light: string; dark: string };
		warning: { main: string; light: string; dark: string };
		info: { main: string; light: string; dark: string };
	};
	glass: {
		borderRadius: number;
		cardBlur: number;
		sidebarBlur: number;
		cardOpacity: number;
		elevatedOpacity: number;
		sidebarOpacity: number;
		headerOpacity: number;
	};
	animations: {
		fast: number;
		normal: number;
		slow: number;
		spring: {
			snappy: { stiffness: number; damping: number };
			bouncy: { stiffness: number; damping: number };
			gentle: { stiffness: number; damping: number };
		};
		easing: { easeOutExpo: string; easeInOutBack: string };
		meshBlobCount: number;
		meshBlobCycleMin: number;
		meshBlobCycleMax: number;
	};
}

const solar: ThemePreset = {
	id: "solar",
	label: "Solar",
	primary: {
		main: "#F97316",
		light: "#FB923C",
		dark: "#EA580C",
		contrastText: "#FFFFFF",
	},
	secondary: {
		main: "#8B5CF6",
		light: "#A78BFA",
		dark: "#7C3AED",
		contrastText: "#FFFFFF",
	},
	background: { default: "#1a1410", paper: "#2a1f12" },
	text: { primary: "#F8FAFC", secondary: "#B8A894", disabled: "#7B6B5B" },
	primaryRgb: "249, 115, 22",
	secondaryRgb: "139, 92, 246",
	surface: {
		glass: "55, 40, 20",
		elevated: "70, 52, 28",
		sidebar: "30, 22, 12",
		header: "30, 22, 12",
		tooltip: "70, 52, 28",
		muted: "80, 60, 30",
		hoverCard: "65, 48, 25",
	},
	scrollbar: { thumb: "#7A5533", thumbHover: "#9A7044", track: "transparent" },
	semantics: {
		success: { main: "#10B981", light: "#34D399", dark: "#059669" },
		error: { main: "#EF4444", light: "#F87171", dark: "#DC2626" },
		warning: { main: "#FBBF24", light: "#FCD34D", dark: "#F59E0B" },
		info: { main: "#3B82F6", light: "#60A5FA", dark: "#2563EB" },
	},
	glass: {
		borderRadius: 8,
		cardBlur: 16,
		sidebarBlur: 24,
		cardOpacity: 0.65,
		elevatedOpacity: 0.55,
		sidebarOpacity: 0.8,
		headerOpacity: 0.7,
	},
	animations: {
		fast: 150,
		normal: 250,
		slow: 400,
		spring: {
			snappy: { stiffness: 400, damping: 30 },
			bouncy: { stiffness: 300, damping: 20 },
			gentle: { stiffness: 200, damping: 25 },
		},
		easing: {
			easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
			easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
		},
		meshBlobCount: 4,
		meshBlobCycleMin: 18,
		meshBlobCycleMax: 25,
	},
};

const glacier: ThemePreset = {
	id: "glacier",
	label: "Glacier",
	primary: {
		main: "#00BCD4",
		light: "#26C6DA",
		dark: "#0097A7",
		contrastText: "#FFFFFF",
	},
	secondary: {
		main: "#0EA5E9",
		light: "#38BDF8",
		dark: "#0284C7",
		contrastText: "#FFFFFF",
	},
	background: { default: "#0B1120", paper: "#111827" },
	text: { primary: "#F0F6FF", secondary: "#94A8B8", disabled: "#5B6B7B" },
	primaryRgb: "0, 188, 212",
	secondaryRgb: "14, 165, 233",
	surface: {
		glass: "20, 30, 50",
		elevated: "28, 40, 65",
		sidebar: "11, 17, 32",
		header: "11, 17, 32",
		tooltip: "28, 40, 65",
		muted: "30, 50, 80",
		hoverCard: "25, 38, 60",
	},
	scrollbar: { thumb: "#2D4A6A", thumbHover: "#3D5A7A", track: "transparent" },
	semantics: {
		success: { main: "#10B981", light: "#34D399", dark: "#059669" },
		error: { main: "#F43F5E", light: "#FB7185", dark: "#E11D48" },
		warning: { main: "#F59E0B", light: "#FBBF24", dark: "#D97706" },
		info: { main: "#06B6D4", light: "#22D3EE", dark: "#0891B2" },
	},
	glass: {
		borderRadius: 6,
		cardBlur: 20,
		sidebarBlur: 28,
		cardOpacity: 0.55,
		elevatedOpacity: 0.45,
		sidebarOpacity: 0.75,
		headerOpacity: 0.65,
	},
	animations: {
		fast: 180,
		normal: 300,
		slow: 500,
		spring: {
			snappy: { stiffness: 300, damping: 35 },
			bouncy: { stiffness: 220, damping: 25 },
			gentle: { stiffness: 160, damping: 30 },
		},
		easing: {
			easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
			easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
		},
		meshBlobCount: 3,
		meshBlobCycleMin: 25,
		meshBlobCycleMax: 35,
	},
};

const jade: ThemePreset = {
	id: "jade",
	label: "Jade",
	primary: {
		main: "#10B981",
		light: "#34D399",
		dark: "#059669",
		contrastText: "#FFFFFF",
	},
	secondary: {
		main: "#14B8A6",
		light: "#2DD4BF",
		dark: "#0D9488",
		contrastText: "#FFFFFF",
	},
	background: { default: "#0A1210", paper: "#111C18" },
	text: { primary: "#F0FFF8", secondary: "#94B8A8", disabled: "#5B7B6B" },
	primaryRgb: "16, 185, 129",
	secondaryRgb: "20, 184, 166",
	surface: {
		glass: "18, 40, 32",
		elevated: "25, 55, 44",
		sidebar: "10, 18, 16",
		header: "10, 18, 16",
		tooltip: "25, 55, 44",
		muted: "30, 60, 50",
		hoverCard: "22, 48, 38",
	},
	scrollbar: { thumb: "#2D6A4A", thumbHover: "#3D7A5A", track: "transparent" },
	semantics: {
		success: { main: "#22C55E", light: "#4ADE80", dark: "#16A34A" },
		error: { main: "#EF4444", light: "#F87171", dark: "#DC2626" },
		warning: { main: "#EAB308", light: "#FACC15", dark: "#CA8A04" },
		info: { main: "#06B6D4", light: "#22D3EE", dark: "#0891B2" },
	},
	glass: {
		borderRadius: 10,
		cardBlur: 14,
		sidebarBlur: 22,
		cardOpacity: 0.6,
		elevatedOpacity: 0.5,
		sidebarOpacity: 0.78,
		headerOpacity: 0.68,
	},
	animations: {
		fast: 140,
		normal: 230,
		slow: 380,
		spring: {
			snappy: { stiffness: 350, damping: 28 },
			bouncy: { stiffness: 280, damping: 18 },
			gentle: { stiffness: 190, damping: 23 },
		},
		easing: {
			easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
			easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
		},
		meshBlobCount: 5,
		meshBlobCycleMin: 20,
		meshBlobCycleMax: 28,
	},
};

const eclipse: ThemePreset = {
	id: "eclipse",
	label: "Eclipse",
	primary: {
		main: "#8B5CF6",
		light: "#A78BFA",
		dark: "#7C3AED",
		contrastText: "#FFFFFF",
	},
	secondary: {
		main: "#EC4899",
		light: "#F472B6",
		dark: "#DB2777",
		contrastText: "#FFFFFF",
	},
	background: { default: "#0F0B1A", paper: "#1A1525" },
	text: { primary: "#F5F0FF", secondary: "#A894B8", disabled: "#6B5B7B" },
	primaryRgb: "139, 92, 246",
	secondaryRgb: "236, 72, 153",
	surface: {
		glass: "30, 22, 50",
		elevated: "42, 30, 68",
		sidebar: "15, 11, 26",
		header: "15, 11, 26",
		tooltip: "42, 30, 68",
		muted: "50, 40, 70",
		hoverCard: "38, 28, 58",
	},
	scrollbar: { thumb: "#5A3D7A", thumbHover: "#6A4D8A", track: "transparent" },
	semantics: {
		success: { main: "#10B981", light: "#34D399", dark: "#059669" },
		error: { main: "#F43F5E", light: "#FB7185", dark: "#E11D48" },
		warning: { main: "#F59E0B", light: "#FBBF24", dark: "#D97706" },
		info: { main: "#6366F1", light: "#818CF8", dark: "#4F46E5" },
	},
	glass: {
		borderRadius: 14,
		cardBlur: 20,
		sidebarBlur: 30,
		cardOpacity: 0.5,
		elevatedOpacity: 0.4,
		sidebarOpacity: 0.7,
		headerOpacity: 0.6,
	},
	animations: {
		fast: 160,
		normal: 280,
		slow: 450,
		spring: {
			snappy: { stiffness: 250, damping: 25 },
			bouncy: { stiffness: 200, damping: 15 },
			gentle: { stiffness: 150, damping: 20 },
		},
		easing: {
			easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
			easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
		},
		meshBlobCount: 4,
		meshBlobCycleMin: 22,
		meshBlobCycleMax: 30,
	},
};

export const themePresets: Record<ThemeId, ThemePreset> = {
	solar,
	glacier,
	jade,
	eclipse,
};

export function getPreset(id: ThemeId): ThemePreset {
	return themePresets[id];
}

export const themeList: ThemePreset[] = [solar, glacier, jade, eclipse];
