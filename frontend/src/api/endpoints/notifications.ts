/**
 * Notifications API Endpoints
 */

import apiClient from "../client";

export interface NotificationSettings {
	webPushEnabled: boolean;
	hasSubscription: boolean;
	tradeConfirmations: boolean;
	tradeExecutions: boolean;
	riskAlerts: boolean;
	taskCompletions: boolean;
	priceAlerts: boolean;
	analysisReady: boolean;
	quietHoursEnabled: boolean;
	quietHoursStart: string | null;
	quietHoursEnd: string | null;
	quietHoursTimezone: string;
}

export interface NotificationSettingsUpdate {
	tradeConfirmations?: boolean;
	tradeExecutions?: boolean;
	riskAlerts?: boolean;
	taskCompletions?: boolean;
	priceAlerts?: boolean;
	analysisReady?: boolean;
	quietHoursEnabled?: boolean;
	quietHoursStart?: string | null;
	quietHoursEnd?: string | null;
	quietHoursTimezone?: string;
}

function transformSettings(
	data: Record<string, unknown>,
): NotificationSettings {
	return {
		webPushEnabled: data.web_push_enabled as boolean,
		hasSubscription: data.has_subscription as boolean,
		tradeConfirmations: data.trade_confirmations as boolean,
		tradeExecutions: data.trade_executions as boolean,
		riskAlerts: data.risk_alerts as boolean,
		taskCompletions: data.task_completions as boolean,
		priceAlerts: data.price_alerts as boolean,
		analysisReady: data.analysis_ready as boolean,
		quietHoursEnabled: data.quiet_hours_enabled as boolean,
		quietHoursStart: (data.quiet_hours_start as string) ?? null,
		quietHoursEnd: (data.quiet_hours_end as string) ?? null,
		quietHoursTimezone: (data.quiet_hours_timezone as string) ?? "UTC",
	};
}

export const notificationsApi = {
	async getSettings(): Promise<NotificationSettings> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/notifications/settings",
		);
		return transformSettings(response.data);
	},

	async updateSettings(
		update: NotificationSettingsUpdate,
	): Promise<NotificationSettings> {
		const payload: Record<string, unknown> = {};
		if (update.tradeConfirmations !== undefined)
			payload.trade_confirmations = update.tradeConfirmations;
		if (update.tradeExecutions !== undefined)
			payload.trade_executions = update.tradeExecutions;
		if (update.riskAlerts !== undefined)
			payload.risk_alerts = update.riskAlerts;
		if (update.taskCompletions !== undefined)
			payload.task_completions = update.taskCompletions;
		if (update.priceAlerts !== undefined)
			payload.price_alerts = update.priceAlerts;
		if (update.analysisReady !== undefined)
			payload.analysis_ready = update.analysisReady;
		if (update.quietHoursEnabled !== undefined)
			payload.quiet_hours_enabled = update.quietHoursEnabled;
		if (update.quietHoursStart !== undefined)
			payload.quiet_hours_start = update.quietHoursStart;
		if (update.quietHoursEnd !== undefined)
			payload.quiet_hours_end = update.quietHoursEnd;
		if (update.quietHoursTimezone !== undefined)
			payload.quiet_hours_timezone = update.quietHoursTimezone;

		const response = await apiClient.put<Record<string, unknown>>(
			"/notifications/settings",
			payload,
		);
		return transformSettings(response.data);
	},

	async subscribeWebPush(subscription: PushSubscriptionJSON): Promise<void> {
		await apiClient.post("/notifications/subscribe", {
			endpoint: subscription.endpoint,
			keys: subscription.keys,
		});
	},

	async unsubscribeWebPush(): Promise<void> {
		await apiClient.post("/notifications/unsubscribe");
	},
};

export default notificationsApi;
