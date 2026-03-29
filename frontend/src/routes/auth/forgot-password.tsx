/**
 * Forgot Password Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EmailIcon from "@mui/icons-material/Email";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	CircularProgress,
	InputAdornment,
	TextField,
	Typography,
} from "@mui/material";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { authApi } from "@/api/endpoints/auth";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { getErrorMessage } from "@/utils/errors";
import {
	type ForgotPasswordInput,
	forgotPasswordSchema,
} from "@/utils/validators";
import { requireGuest } from "../-guards";

export const Route = createFileRoute("/auth/forgot-password")({
	beforeLoad: requireGuest,
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const {
		control,
		handleSubmit,
		formState: { errors },
	} = useForm<ForgotPasswordInput>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: {
			email: "",
		},
	});

	const onSubmit = async (data: ForgotPasswordInput) => {
		try {
			setError(null);
			setIsLoading(true);
			await authApi.forgotPassword(data.email);
			setSubmitted(true);
		} catch (err) {
			setError(getErrorMessage(err, "Failed to send reset email"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<PageTransition pageKey="forgot-password">
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
							Reset Your Password
						</Typography>
						<Typography
							variant="body1"
							color="text.secondary"
							sx={{ lineHeight: 1.7 }}
						>
							Enter your email address and we'll send you a link to reset your
							password.
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

				{/* Right panel - forgot password form */}
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
										Forgot Password
									</Typography>
									<Typography variant="body2" color="text.secondary">
										We'll email you a reset link
									</Typography>
								</Box>

								{error && (
									<Alert severity="error" sx={{ mb: 3 }}>
										{error}
									</Alert>
								)}

								{submitted ? (
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
											If an account exists with this email, you'll receive a
											reset link.
										</Typography>
										<Box
											component={Link}
											to="/auth/login"
											sx={{ color: "primary.main" }}
										>
											<Typography variant="body2">Back to Sign In</Typography>
										</Box>
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
											{isLoading ? "Sending..." : "Send Reset Link"}
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
