import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";
import type { SymbolOption } from "@/api/endpoints/market";
import type { SaveStatus } from "@/hooks/useDebouncedSave";
import type { AgentTask, TaskCreate } from "@/types/task";

export type TaskSectionLayout = "accordion" | "panel";

export interface TaskConfigContextValue {
	task: AgentTask | null;
	taskId: string | null;
	formData: TaskCreate;
	setFormData: Dispatch<SetStateAction<TaskCreate>>;
	saveStatus: SaveStatus;
	isTaskRunning: boolean;
	isSuperuser: boolean;
	symbolOptions: SymbolOption[];
	symbolsLoading: boolean;
	sectionLayout: TaskSectionLayout;
}

const TaskConfigContext = createContext<TaskConfigContextValue | null>(null);

export const TaskConfigProvider = TaskConfigContext.Provider;

export function useTaskConfig(): TaskConfigContextValue {
	const ctx = useContext(TaskConfigContext);
	if (!ctx) {
		throw new Error("useTaskConfig must be used within TaskConfigProvider");
	}
	return ctx;
}

export function useTaskSectionLayout(): TaskSectionLayout {
	const ctx = useContext(TaskConfigContext);
	return ctx?.sectionLayout ?? "accordion";
}
