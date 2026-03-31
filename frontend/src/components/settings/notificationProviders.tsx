/**
 * Notification provider definitions for the Apprise configuration UI.
 *
 * Each provider defines its form fields, an icon, and a buildUrl function
 * that constructs the Apprise URL from the user's input.
 */

import CampaignIcon from "@mui/icons-material/Campaign";
import CodeIcon from "@mui/icons-material/Code";
import EmailIcon from "@mui/icons-material/Email";
import GridViewIcon from "@mui/icons-material/GridView";
import GroupsIcon from "@mui/icons-material/Groups";
import HttpIcon from "@mui/icons-material/Http";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import TelegramIcon from "@mui/icons-material/Telegram";
import { SvgIcon, type SvgIconProps } from "@mui/material";
import type { ReactNode } from "react";

// ── Brand SVG Icons (not in MUI) ─────────────────────────────

function DiscordIcon(props: SvgIconProps) {
	return (
		<SvgIcon {...props} viewBox="0 0 24 24">
			<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.373-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
		</SvgIcon>
	);
}

function SlackIcon(props: SvgIconProps) {
	return (
		<SvgIcon {...props} viewBox="0 0 24 24">
			<path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
		</SvgIcon>
	);
}

// ── Types ─────────────────────────────────────────────────────

export interface ProviderFieldDef {
	key: string;
	label: string;
	placeholder: string;
	helperText?: string;
	type: "text" | "password" | "checkbox" | "number";
	required: boolean;
	defaultValue?: string | boolean | number;
}

export interface ProviderDef {
	id: string;
	label: string;
	icon: ReactNode;
	chipColor:
		| "primary"
		| "secondary"
		| "success"
		| "warning"
		| "error"
		| "info"
		| "default";
	fields: ProviderFieldDef[];
	buildUrl: (values: Record<string, string | boolean | number>) => string;
	helpUrl?: string;
}

export type FieldValues = Record<string, string | boolean | number>;

// ── Helpers ───────────────────────────────────────────────────

/** Strip protocol prefix from a URL for embedding in an Apprise scheme. */
function stripProtocol(url: string): string {
	return url.replace(/^https?:\/\//, "");
}

// ── Provider Definitions ──────────────────────────────────────

export const NOTIFICATION_PROVIDERS: ProviderDef[] = [
	{
		id: "telegram",
		label: "Telegram",
		icon: <TelegramIcon fontSize="small" sx={{ color: "#26A5E4" }} />,
		chipColor: "info",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_telegram",
		fields: [
			{
				key: "botToken",
				label: "Bot Token",
				placeholder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
				helperText: "Get this from @BotFather on Telegram",
				type: "password",
				required: true,
			},
			{
				key: "chatId",
				label: "Chat ID",
				placeholder: "-1001234567890",
				helperText: "User, group, or channel ID",
				type: "text",
				required: true,
			},
		],
		buildUrl: (v) => `tgram://${v.botToken}/${v.chatId}`,
	},
	{
		id: "discord",
		label: "Discord",
		icon: <DiscordIcon fontSize="small" sx={{ color: "#5865F2" }} />,
		chipColor: "secondary",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_discord",
		fields: [
			{
				key: "webhookUrl",
				label: "Webhook URL",
				placeholder: "https://discord.com/api/webhooks/123456789/ABCdefGHI...",
				helperText:
					"Full webhook URL from Server Settings → Integrations → Webhooks",
				type: "password",
				required: true,
			},
		],
		buildUrl: (v) => {
			const url = String(v.webhookUrl);
			const match = url.match(
				/(?:https?:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/)?(\d+)\/([A-Za-z0-9_-]+)/,
			);
			if (match) return `discord://${match[1]}/${match[2]}`;
			return `discord://${stripProtocol(url)}`;
		},
	},
	{
		id: "slack",
		label: "Slack",
		icon: <SlackIcon fontSize="small" sx={{ color: "#E01E5A" }} />,
		chipColor: "warning",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_slack",
		fields: [
			{
				key: "webhookUrl",
				label: "Webhook URL",
				placeholder: "https://hooks.slack.com/services/T.../B.../xxx...",
				helperText: "Incoming Webhook URL from your Slack app",
				type: "password",
				required: true,
			},
			{
				key: "channel",
				label: "Channel (optional)",
				placeholder: "#general",
				helperText: "Override the default channel (include #)",
				type: "text",
				required: false,
			},
		],
		buildUrl: (v) => {
			const url = String(v.webhookUrl);
			const match = url.match(
				/(?:https?:\/\/hooks\.slack\.com\/services\/)?([A-Z0-9]+)\/([A-Z0-9]+)\/([A-Za-z0-9]+)/,
			);
			const channel = String(v.channel || "").replace(/^#/, "");
			if (match) {
				const base = `slack://${match[1]}/${match[2]}/${match[3]}`;
				return channel ? `${base}/%23${channel}` : base;
			}
			return `slack://${stripProtocol(url)}`;
		},
	},
	{
		id: "email",
		label: "Email (SMTP)",
		icon: <EmailIcon fontSize="small" sx={{ color: "#EA4335" }} />,
		chipColor: "success",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_email",
		fields: [
			{
				key: "user",
				label: "Username / Email",
				placeholder: "user@gmail.com",
				type: "text",
				required: true,
			},
			{
				key: "pass",
				label: "Password",
				placeholder: "App password or SMTP password",
				type: "password",
				required: true,
			},
			{
				key: "host",
				label: "SMTP Host",
				placeholder: "smtp.gmail.com",
				helperText: "Leave empty for common providers (Gmail, Outlook, etc.)",
				type: "text",
				required: false,
			},
			{
				key: "port",
				label: "Port",
				placeholder: "587",
				type: "number",
				required: false,
				defaultValue: 587,
			},
			{
				key: "to",
				label: "Recipient Email",
				placeholder: "recipient@example.com",
				helperText: "Defaults to your username if omitted",
				type: "text",
				required: false,
			},
		],
		buildUrl: (v) => {
			const user = encodeURIComponent(String(v.user));
			const pass = encodeURIComponent(String(v.pass));
			const host = String(v.host || "");
			const port = v.port ? `:${v.port}` : "";
			const to = String(v.to || "");

			if (host) {
				const base = `mailto://${user}:${pass}@${host}${port}`;
				return to ? `${base}?to=${encodeURIComponent(to)}` : base;
			}
			const base = `mailto://${user}:${pass}`;
			return to ? `${base}?to=${encodeURIComponent(to)}` : base;
		},
	},
	{
		id: "gotify",
		label: "Gotify",
		icon: <CampaignIcon fontSize="small" sx={{ color: "#3F94E5" }} />,
		chipColor: "default",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_gotify",
		fields: [
			{
				key: "host",
				label: "Host",
				placeholder: "gotify.example.com",
				type: "text",
				required: true,
			},
			{
				key: "token",
				label: "Application Token",
				placeholder: "AbCdEfGhIjKlMn",
				type: "password",
				required: true,
			},
			{
				key: "https",
				label: "Use HTTPS",
				placeholder: "",
				type: "checkbox",
				required: false,
				defaultValue: true,
			},
		],
		buildUrl: (v) => {
			const scheme = v.https ? "gotifys" : "gotify";
			return `${scheme}://${stripProtocol(String(v.host))}/${v.token}`;
		},
	},
	{
		id: "ntfy",
		label: "ntfy",
		icon: <NotificationsIcon fontSize="small" sx={{ color: "#57B65C" }} />,
		chipColor: "default",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_ntfy",
		fields: [
			{
				key: "topic",
				label: "Topic",
				placeholder: "my-trading-alerts",
				type: "text",
				required: true,
			},
			{
				key: "host",
				label: "Host (optional)",
				placeholder: "ntfy.sh",
				helperText: "Defaults to ntfy.sh if omitted",
				type: "text",
				required: false,
			},
			{
				key: "https",
				label: "Use HTTPS",
				placeholder: "",
				type: "checkbox",
				required: false,
				defaultValue: true,
			},
		],
		buildUrl: (v) => {
			const host = String(v.host || "");
			const scheme = v.https ? "ntfys" : "ntfy";
			if (host) {
				return `${scheme}://${stripProtocol(host)}/${v.topic}`;
			}
			return `ntfy://${v.topic}`;
		},
	},
	{
		id: "pushover",
		label: "Pushover",
		icon: <PhoneAndroidIcon fontSize="small" sx={{ color: "#2F9FBF" }} />,
		chipColor: "default",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_pushover",
		fields: [
			{
				key: "userKey",
				label: "User Key",
				placeholder: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
				type: "password",
				required: true,
			},
			{
				key: "apiToken",
				label: "API Token",
				placeholder: "azGDORePK8gMaC0QOYAMyEEuzJnyUi",
				type: "password",
				required: true,
			},
		],
		buildUrl: (v) => `pover://${v.userKey}/${v.apiToken}`,
	},
	{
		id: "teams",
		label: "Microsoft Teams",
		icon: <GroupsIcon fontSize="small" sx={{ color: "#6264A7" }} />,
		chipColor: "primary",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_msteams",
		fields: [
			{
				key: "webhookUrl",
				label: "Webhook URL",
				placeholder: "https://outlook.office.com/webhook/...",
				helperText: "Teams incoming webhook URL",
				type: "password",
				required: true,
			},
		],
		buildUrl: (v) => {
			const url = String(v.webhookUrl);
			const match = url.match(
				/(?:https?:\/\/[^/]+\/webhookb2\/)?([A-Za-z0-9-]+@[A-Za-z0-9-]+)\/IncomingWebhook\/([A-Za-z0-9]+)\/([A-Za-z0-9-]+)/,
			);
			if (match) return `msteams://${match[1]}/${match[2]}/${match[3]}`;
			return `msteams://${stripProtocol(url)}`;
		},
	},
	{
		id: "matrix",
		label: "Matrix",
		icon: <GridViewIcon fontSize="small" sx={{ color: "#0DBD8B" }} />,
		chipColor: "default",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_matrix",
		fields: [
			{
				key: "user",
				label: "User",
				placeholder: "myuser",
				type: "text",
				required: true,
			},
			{
				key: "password",
				label: "Password",
				placeholder: "my-password",
				type: "password",
				required: true,
			},
			{
				key: "host",
				label: "Homeserver",
				placeholder: "matrix.org",
				type: "text",
				required: true,
			},
			{
				key: "room",
				label: "Room (optional)",
				placeholder: "my-room",
				helperText: "Target room name (without #)",
				type: "text",
				required: false,
			},
		],
		buildUrl: (v) => {
			const room = String(v.room || "");
			const base = `matrix://${v.user}:${v.password}@${stripProtocol(String(v.host))}`;
			return room ? `${base}/%23${room}` : base;
		},
	},
	{
		id: "webhook",
		label: "Webhook (JSON)",
		icon: <HttpIcon fontSize="small" sx={{ color: "#FF9800" }} />,
		chipColor: "default",
		helpUrl: "https://github.com/caronc/apprise/wiki/Notify_Custom_JSON",
		fields: [
			{
				key: "url",
				label: "Webhook URL",
				placeholder: "example.com/webhook",
				helperText: "The URL will receive a JSON POST payload",
				type: "text",
				required: true,
			},
			{
				key: "https",
				label: "Use HTTPS",
				placeholder: "",
				type: "checkbox",
				required: false,
				defaultValue: true,
			},
		],
		buildUrl: (v) => {
			const scheme = v.https ? "jsons" : "json";
			return `${scheme}://${stripProtocol(String(v.url))}`;
		},
	},
	{
		id: "custom",
		label: "Custom URL",
		icon: <CodeIcon fontSize="small" sx={{ color: "#9E9E9E" }} />,
		chipColor: "default",
		fields: [
			{
				key: "url",
				label: "Apprise URL",
				placeholder: "scheme://...",
				helperText: "Raw Apprise URL for any of the 80+ supported services",
				type: "text",
				required: true,
			},
		],
		buildUrl: (v) => String(v.url),
	},
];

export const PROVIDER_MAP = new Map(
	NOTIFICATION_PROVIDERS.map((p) => [p.id, p]),
);

// ── Service Detection ─────────────────────────────────────────

/** Icon lookup keyed by detectServiceType label. */
const SERVICE_ICONS: Record<string, ReactNode> = {
	Telegram: <TelegramIcon fontSize="small" sx={{ color: "#26A5E4" }} />,
	Discord: <DiscordIcon fontSize="small" sx={{ color: "#5865F2" }} />,
	Slack: <SlackIcon fontSize="small" sx={{ color: "#E01E5A" }} />,
	Email: <EmailIcon fontSize="small" sx={{ color: "#EA4335" }} />,
	Webhook: <HttpIcon fontSize="small" sx={{ color: "#FF9800" }} />,
	Gotify: <CampaignIcon fontSize="small" sx={{ color: "#3F94E5" }} />,
	ntfy: <NotificationsIcon fontSize="small" sx={{ color: "#57B65C" }} />,
	Pushover: <PhoneAndroidIcon fontSize="small" sx={{ color: "#2F9FBF" }} />,
	Teams: <GroupsIcon fontSize="small" sx={{ color: "#6264A7" }} />,
	Matrix: <GridViewIcon fontSize="small" sx={{ color: "#0DBD8B" }} />,
};

/** Detect Apprise service type from a masked or full URL prefix. */
export function detectServiceType(url: string): {
	label: string;
	icon: ReactNode;
	color:
		| "primary"
		| "secondary"
		| "success"
		| "warning"
		| "error"
		| "info"
		| "default";
} {
	const lower = url.toLowerCase();

	const match = (
		_prefix: string,
		label: string,
		color:
			| "primary"
			| "secondary"
			| "success"
			| "warning"
			| "error"
			| "info"
			| "default",
	) => ({
		label,
		icon: SERVICE_ICONS[label] ?? null,
		color,
	});

	if (lower.startsWith("tgram://")) return match("tgram", "Telegram", "info");
	if (lower.startsWith("discord://"))
		return match("discord", "Discord", "secondary");
	if (lower.startsWith("slack://")) return match("slack", "Slack", "warning");
	if (lower.startsWith("mailto://")) return match("mailto", "Email", "success");
	if (lower.startsWith("json://") || lower.startsWith("jsons://"))
		return match("json", "Webhook", "default");
	if (lower.startsWith("gotify://") || lower.startsWith("gotifys://"))
		return match("gotify", "Gotify", "default");
	if (lower.startsWith("ntfy://") || lower.startsWith("ntfys://"))
		return match("ntfy", "ntfy", "default");
	if (lower.startsWith("pushover://") || lower.startsWith("pover://"))
		return match("pover", "Pushover", "default");
	if (lower.startsWith("msteams://"))
		return match("msteams", "Teams", "primary");
	if (lower.startsWith("matrix://"))
		return match("matrix", "Matrix", "default");

	const scheme = lower.split("://")[0] ?? "unknown";
	return { label: scheme, icon: null, color: "default" };
}
