/**
 * Login Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmailIcon from "@mui/icons-material/Email";
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
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { useAuth } from "@/hooks/useAuth";
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
	const [needs2FA, setNeeds2FA] = useState(false);
	const [totpCode, setTotpCode] = useState("");
	const savedCredentials = useRef<LoginInput | null>(null);

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
			const result = await login(data);
			if (result?.requires2FA) {
				savedCredentials.current = data;
				setNeeds2FA(true);
			}
		} catch (err) {
			setError(getErrorMessage(err, "Login failed"));
		}
	};

	const onSubmit2FA = async () => {
		if (!savedCredentials.current || totpCode.length !== 6) return;
		try {
			setError(null);
			await login(savedCredentials.current, totpCode);
		} catch (err) {
			setError(getErrorMessage(err, "Invalid 2FA code"));
			setTotpCode("");
		}
	};

	const handleBack = () => {
		setNeeds2FA(false);
		setTotpCode("");
		setError(null);
		savedCredentials.current = null;
	};

	return (
		<PageTransition pageKey="login">
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
							AI-Powered Trading
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

				{/* Right panel - login form */}
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
										TradingBot
									</Typography>
									<Typography variant="body2" color="text.secondary">
										{needs2FA
											? "Enter your authenticator code"
											: "Sign in to your account"}
									</Typography>
								</Box>

								{error && (
									<Alert severity="error" sx={{ mb: 3 }}>
										{error}
									</Alert>
								)}

								{needs2FA ? (
									<Box>
										<TextField
											label="6-digit code"
											value={totpCode}
											onChange={(e) => {
												const val = e.target.value
													.replace(/\D/g, "")
													.slice(0, 6);
												setTotpCode(val);
											}}
											fullWidth
											autoFocus
											slotProps={{
												htmlInput: {
													inputMode: "numeric",
													maxLength: 6,
													autoComplete: "one-time-code",
												},
												input: {
													startAdornment: (
														<InputAdornment position="start">
															<LockIcon color="action" />
														</InputAdornment>
													),
												},
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													void onSubmit2FA();
												}
											}}
											sx={{ mb: 3 }}
										/>

										<Button
											variant="contained"
											fullWidth
											size="large"
											disabled={isLoading || totpCode.length !== 6}
											onClick={() => void onSubmit2FA()}
											startIcon={
												isLoading ? (
													<CircularProgress size={18} color="inherit" />
												) : undefined
											}
											sx={{ mb: 2 }}
										>
											{isLoading ? "Verifying..." : "Verify"}
										</Button>

										<Button
											variant="text"
											fullWidth
											startIcon={<ArrowBackIcon />}
											onClick={handleBack}
										>
											Back to login
										</Button>
									</Box>
								) : (
									<form onSubmit={handleSubmit(onSubmit)}>
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
													sx={{ mb: 3 }}
												/>
											)}
										/>

										<Box sx={{ textAlign: "right", mb: 2 }}>
											<Box
												component={Link}
												to="/auth/forgot-password"
												sx={{
													color: "text.secondary",
													fontSize: "0.8125rem",
													"&:hover": { color: "primary.main" },
												}}
											>
												Forgot password?
											</Box>
										</Box>

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
											{isLoading ? "Signing in..." : "Sign In"}
										</Button>

										<Typography
											variant="body2"
											color="text.secondary"
											align="center"
										>
											Don't have an account?{" "}
											<Box
												component={Link}
												to="/auth/register"
												sx={{ color: "primary.main" }}
											>
												Sign up
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
