/**
 * Error Boundary Component
 */

import * as Sentry from "@sentry/react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		Sentry.captureException(error, {
			contexts: { react: { componentStack: errorInfo.componentStack } },
		});
		console.error("Error boundary caught an error:", error, errorInfo);
	}

	handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex items-center justify-center min-h-[400px] p-6">
					<div className="rounded-xl bg-[var(--bg-paper)] p-8 max-w-[500px] text-center ring-1 ring-foreground/10">
						<AlertCircle className="mx-auto mb-4 size-16 text-[var(--error-main)]" />
						<h5 className="mb-2 text-xl font-semibold">
							Something went wrong
						</h5>
						<p className="mb-6 text-sm text-[var(--text-secondary)]">
							{this.state.error?.message ||
								"An unexpected error occurred"}
						</p>
						<Button onClick={this.handleRetry}>
							<RefreshCw data-icon="inline-start" />
							Try Again
						</Button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
