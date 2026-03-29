/**
 * Reset Password Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LockIcon from "@mui/icons-material/Lock";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	CircularProgress,
	IconButton,
	InputAdornment,
	TextField,
	Typography,
} from "@mui/material";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { authApi } from "@/api/endpoints/auth";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { getErrorMessage } from "@/utils/errors";
import {
	type ResetPasswordInput,
	resetPasswordSchema,
} from "@/utils/validators";
import { requireGuest } from "../-guards";

const searchSchema = z.object({
	token: z.string().catch(""),
});

export const Route = createFileRoute("/auth/reset-password")({
	validateSearch: searchSchema,
	beforeLoad: requireGuest,
	component: ResetPasswordPage,
});

function getPasswordStrength(password: string): {
	level: number;
	label: string;
	color: string;
} {
	if (!password) return { level: 0, label: "", color: "transparent" };
	let score = 0;
	if (password.length >= 8) score++;
	if (password.length >= 12) score++;
	if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
	if (/\d/.test(password)) score++;
	if (/[^A-Za-z0-9]/.test(password)) score++;

	if (score <= 2) return { level: 1, label: "Weak", color: "#EF4444" };
	if (score <= 3) return { level: 2, label: "Medium", color: "#F59E0B" };
	return { level: 3, label: "Strong", color: "#10B981" };
}

function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const {
		control,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<ResetPasswordInput>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
	});

	const watchedPassword = watch("password");
	const strength = getPasswordStrength(watchedPassword);

	// Redirect to forgot-password if no token is present
	useEffect(() => {
		if (!token) {
			void navigate({ to: "/auth/forgot-password" });
		}
	}, [token, navigate]);

	const onSubmit = async (data: ResetPasswordInput) => {
		try {
			setError(null);
			setIsLoading(true);
			await authApi.resetPassword(token, data.password);
			setSuccess(true);
		} catch (err) {
			setError(getErrorMessage(err, "Failed to reset password"));
		} finally {
			setIsLoading(false);
		}
	};

	if (!token) return null;

	return (
		<PageTransition pageKey="reset-password">
			<Box sx={{ display: "flex", minHeight: "100vh" }}>
				{/* Left panel - hidden on mobile */}
				<Box
					sx={{
						display: { xs: "none", md: "flex" },
						flexDirection: "column",
						justifyContent: "center",
						alignItems: "center",
						width: "60%",
						position: "relative",
						overflow: "hidden",
						p: 6,
					}}
				>
					{/* Brand content */}
					<Box
						sx={{
							position: "relative",
							zIndex: 1,
							textAlign: "center",
							maxWidth: 480,
						}}
					>
						<img
							src="/coin.png"
							alt="TradingBot"
							width={64}
							height={64}
							style={{ marginBottom: 24 }}
						/>
						<Typography variant="h3" fontWeight={700} sx={{ mb: 2 }}>
							Set a New Password
						</Typography>
						<Typography
							variant="body1"
							color="text.secondary"
							sx={{ lineHeight: 1.7 }}
						>
							Choose a strong password to secure your trading account.
						</Typography>
					</Box>
					{/* Subtle background mesh effect */}
					<Box
						sx={{
							position: "absolute",
							inset: 0,
							background: (theme) => theme.trading.gradients.meshBg,
							opacity: 0.5,
						}}
					/>
				</Box>

				{/* Right panel - reset form */}
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						alignItems: "center",
						width: { xs: "100%", md: "40%" },
						p: { xs: 3, sm: 4 },
					}}
				>
					<AnimatedGradientBorder>
						<Card sx={{ maxWidth: 400, width: "100%" }}>
							<CardContent sx={{ p: 4 }}>
								<Box sx={{ textAlign: "center", mb: 4 }}>
									<Typography
										variant="h4"
										fontWeight={700}
										color="primary"
										gutterBottom
									>
										Reset Password
									</Typography>
									<Typography variant="body2" color="text.secondary">
										Enter your new password below
									</Typography>
								</Box>

								{error && (
									<Alert severity="error" sx={{ mb: 3 }}>
										{error}
									</Alert>
								)}

								{success ? (
									<Box sx={{ textAlign: "center" }}>
										<CheckCircleOutlineIcon
											color="success"
											sx={{ fontSize: 48, mb: 2 }}
										/>
										<Typography
											variant="body1"
											color="text.secondary"
											sx={{ mb: 3 }}
										>
											Your password has been reset successfully.
										</Typography>
										<Button
											component={Link}
											to="/auth/login"
											variant="contained"
											fullWidth
											size="large"
										>
											Sign In
										</Button>
									</Box>
								) : (
									<form onSubmit={handleSubmit(onSubmit)}>
										<Controller
											name="password"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="New Password"
													type={showPassword ? "text" : "password"}
													fullWidth
													error={!!errors.password}
													helperText={errors.password?.message}
													slotProps={{
														input: {
															startAdornment: (
																<InputAdornment position="start">
																	<LockIcon color="action" />
																</InputAdornment>
															),
															endAdornment: (
																<InputAdornment position="end">
																	<IconButton
																		aria-label="Toggle password visibility"
																		onClick={() =>
																			setShowPassword(!showPassword)
																		}
																		edge="end"
																	>
																		{showPassword ? (
																			<VisibilityOffIcon />
																		) : (
																			<VisibilityIcon />
																		)}
																	</IconButton>
																</InputAdornment>
															),
														},
													}}
													sx={{ mb: 0 }}
												/>
											)}
										/>

										{/* Password strength indicator */}
										{watchedPassword && (
											<Box sx={{ mt: 1, mb: 2 }}>
												<Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
													{[1, 2, 3].map((i) => (
														<Box
															key={i}
															sx={{
																height: 3,
																flex: 1,
																borderRadius: 1,
																backgroundColor:
																	i <= strength.level
																		? strength.color
																		: "rgba(255,255,255,0.1)",
																transition: "background-color 0.2s",
															}}
														/>
													))}
												</Box>
												<Typography
													variant="caption"
													sx={{ color: strength.color }}
												>
													{strength.label}
												</Typography>
											</Box>
										)}

										{!watchedPassword && <Box sx={{ mb: 2 }} />}

										<Controller
											name="confirmPassword"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="Confirm Password"
													type={showPassword ? "text" : "password"}
													fullWidth
													error={!!errors.confirmPassword}
													helperText={errors.confirmPassword?.message}
													slotProps={{
														input: {
															startAdornment: (
																<InputAdornment position="start">
																	<LockIcon color="action" />
																</InputAdornment>
															),
														},
													}}
													sx={{ mb: 3 }}
												/>
											)}
										/>

										<Button
											type="submit"
											variant="contained"
											fullWidth
											size="large"
											disabled={isLoading}
											startIcon={
												isLoading ? (
													<CircularProgress size={18} color="inherit" />
												) : undefined
											}
											sx={{ mb: 2 }}
										>
											{isLoading ? "Resetting..." : "Reset Password"}
										</Button>

										<Typography
											variant="body2"
											color="text.secondary"
											align="center"
										>
											Remember your password?{" "}
											<Box
												component={Link}
												to="/auth/login"
												sx={{ color: "primary.main" }}
											>
												Sign in
											</Box>
										</Typography>
									</form>
								)}
							</CardContent>
						</Card>
					</AnimatedGradientBorder>
				</Box>
			</Box>
		</PageTransition>
	);
}
