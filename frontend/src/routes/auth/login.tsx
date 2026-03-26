/**
 * Login Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/utils/errors";
import { type LoginInput, loginSchema } from "@/utils/validators";
import { requireGuest } from "../-guards";

export const Route = createFileRoute("/auth/login")({
	beforeLoad: requireGuest,
	component: LoginPage,
});

function LoginPage() {
	const { login, isLoading } = useAuth();
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginInput>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	const onSubmit = async (data: LoginInput) => {
		try {
			setError(null);
			await login(data);
		} catch (err) {
			setError(getErrorMessage(err, "Login failed"));
		}
	};

	return (
		<PageTransition pageKey="login">
			<div className="flex min-h-screen">
				{/* Left panel - hidden on mobile */}
				<div className="hidden md:flex flex-col justify-center items-center w-[60%] relative overflow-hidden p-12">
					{/* Brand content */}
					<div className="relative z-[1] text-center max-w-[480px]">
						<img
							src="/coin.png"
							alt="TradingBot"
							width={64}
							height={64}
							className="mb-6"
						/>
						<h3 className="text-3xl font-bold text-[var(--text-primary)] mb-4">
							AI-Powered Trading
						</h3>
						<p className="text-base text-[var(--text-secondary)] leading-[1.7]">
							Let the agent analyze markets, execute strategies, and manage your
							portfolio automatically.
						</p>
					</div>
					{/* Subtle background mesh effect */}
					<div className="absolute inset-0 bg-[var(--gradient-accent)] opacity-50" />
				</div>

				{/* Right panel - login form */}
				<div className="flex flex-col justify-center items-center w-full md:w-[40%] p-6 sm:p-8">
					<AnimatedGradientBorder>
						<div className="glass-card max-w-[400px] w-full p-8">
							<div className="text-center mb-8">
								<h4 className="text-2xl font-bold text-[var(--primary)] mb-1">
									TradingBot
								</h4>
								<p className="text-sm text-[var(--text-secondary)]">
									Sign in to your account
								</p>
							</div>

							{error && (
								<Alert variant="destructive" className="mb-6">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<form onSubmit={handleSubmit(onSubmit)}>
								<Controller
									name="email"
									control={control}
									render={({ field, fieldState }) => (
										<div className="mb-4 space-y-1.5">
											<Label htmlFor="email">Email</Label>
											<div className="relative">
												<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
												<Input
													id="email"
													type="email"
													className={cn(
														"pl-10",
														fieldState.error &&
															"border-[var(--error)]",
													)}
													{...field}
												/>
											</div>
											{fieldState.error && (
												<p className="text-sm text-[var(--error)]">
													{fieldState.error.message}
												</p>
											)}
										</div>
									)}
								/>

								<Controller
									name="password"
									control={control}
									render={({ field, fieldState }) => (
										<div className="mb-6 space-y-1.5">
											<Label htmlFor="password">Password</Label>
											<div className="relative">
												<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
												<Input
													id="password"
													type={
														showPassword ? "text" : "password"
													}
													className={cn(
														"pl-10 pr-10",
														fieldState.error &&
															"border-[var(--error)]",
													)}
													{...field}
												/>
												<button
													type="button"
													aria-label="Toggle password visibility"
													onClick={() =>
														setShowPassword(!showPassword)
													}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
												>
													{showPassword ? (
														<EyeOff className="h-4 w-4" />
													) : (
														<Eye className="h-4 w-4" />
													)}
												</button>
											</div>
											{fieldState.error && (
												<p className="text-sm text-[var(--error)]">
													{fieldState.error.message}
												</p>
											)}
										</div>
									)}
								/>

								<Button
									type="submit"
									className="w-full mb-4"
									size="lg"
									disabled={isLoading}
								>
									{isLoading && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{isLoading ? "Signing in..." : "Sign In"}
								</Button>

								<p className="text-sm text-[var(--text-secondary)] text-center">
									Don't have an account?{" "}
									<Link
										to="/auth/register"
										className="text-[var(--primary)] hover:underline"
									>
										Sign up
									</Link>
								</p>
							</form>
						</div>
					</AnimatedGradientBorder>
				</div>
			</div>
		</PageTransition>
	);
}
