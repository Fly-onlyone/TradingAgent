import type { AgentConfigUpdate } from "@/api/endpoints/settings";
import { useZoomAwareMenu } from "./useZoomAwareMenu";

type ConfigMenu = ReturnType<typeof useZoomAwareMenu> & {
	onSelect: (value: string) => void;
};

export function useAgentConfigMenus(
	onUpdate: (update: AgentConfigUpdate) => void,
): { model: ConfigMenu; thinking: ConfigMenu; effort: ConfigMenu } {
	const model = useZoomAwareMenu();
	const thinking = useZoomAwareMenu();
	const effort = useZoomAwareMenu();

	return {
		model: {
			...model,
			onSelect: (value: string) => {
				onUpdate({ model: value });
				model.handleClose();
			},
		},
		thinking: {
			...thinking,
			onSelect: (value: string) => {
				onUpdate({ thinkingMode: value });
				thinking.handleClose();
			},
		},
		effort: {
			...effort,
			onSelect: (value: string) => {
				onUpdate({ effort: value });
				effort.handleClose();
			},
		},
	};
}
