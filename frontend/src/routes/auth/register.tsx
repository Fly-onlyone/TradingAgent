/**
 * Register Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
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
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { useAuth } from "@/hooks/useAuth";
import { type RegisterInput, registerSchema } from "@/utils/validators";
import { requireGuest } from "../-guards";

export const Route = createFileRoute("/auth/register")({
	beforeLoad: requireGuest,
	component: RegisterPage,
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

function RegisterPage() {
	const { register, isLoading } = useAuth();
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<RegisterInput>({
		resolver: zodResolver(registerSchema),
		defaultValues: {
			email: "",
			password: "",
			confirmPassword: "",
			username: "",
		},
	});

	const watchedPassword = watch("password");
	const strength = getPasswordStrength(watchedPassword);

	const onSubmit = async (data: RegisterInput) => {
		try {
			setError(null);
			await register({
				email: data.email,
				password: data.password,
				username: data.username,
			});
		} catch (err) {
			setError((err as Error).message || "Registration failed");
		}
	};

	return (
		<PageTransition pageKey="register">
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
							Join the Automated Trading Revolution
						</Typography>
						<Typography
							variant="body1"
							color="text.secondary"
							sx={{ lineHeight: 1.7 }}
						>
							Let the agent analyze markets, execute strategies, and manage your
							portfolio automatically.
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

				{/* Right panel - register form */}
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
										Create Account
									</Typography>
									<Typography variant="body2" color="text.secondary">
										Sign up to start trading
									</Typography>
								</Box>

								{error && (
									<Alert severity="error" sx={{ mb: 3 }}>
										{error}
									</Alert>
								)}

								<form onSubmit={handleSubmit(onSubmit)}>
									<Controller
										name="username"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Username (optional)"
												fullWidth
												error={!!errors.username}
												helperText={errors.username?.message}
												slotProps={{
													input: {
														startAdornment: (
															<InputAdornment position="start">
																<PersonIcon color="action" />
															</InputAdornment>
														),
													},
												}}
												sx={{ mb: 2 }}
											/>
										)}
									/>

									<Controller
										name="email"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Email"
												type="email"
												fullWidth
												error={!!errors.email}
												helperText={errors.email?.message}
												slotProps={{
													input: {
														startAdornment: (
															<InputAdornment position="start">
																<EmailIcon color="action" />
															</InputAdornment>
														),
													},
												}}
												sx={{ mb: 2 }}
											/>
										)}
									/>

									<Controller
										name="password"
										control={control}
										render={({ field }) => (
											<TextField
												{...field}
												label="Password"
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
																	onClick={() => setShowPassword(!showPassword)}
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
										{isLoading ? "Creating account..." : "Create Account"}
									</Button>

									<Typography
										variant="body2"
										color="text.secondary"
										align="center"
									>
										Already have an account?{" "}
										<Box
											component={Link}
											to="/auth/login"
											sx={{ color: "primary.main" }}
										>
											Sign in
										</Box>
									</Typography>
								</form>
							</CardContent>
						</Card>
					</AnimatedGradientBorder>
				</Box>
			</Box>
		</PageTransition>
	);
}
