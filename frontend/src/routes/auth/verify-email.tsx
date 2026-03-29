/**
 * Email Verification Page
 *
 * Auto-verifies a token from URL search params on mount.
 * Shows loading -> success -> or error with link to login/dashboard.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {
	Box,
	Button,
	Card,
	CardContent,
	CircularProgress,
	Typography,
} from "@mui/material";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { authApi } from "@/api/endpoints/auth";
import { PageTransition } from "@/components/common/PageTransition";
import { AnimatedGradientBorder } from "@/components/effects/AnimatedGradientBorder";
import { getErrorMessage } from "@/utils/errors";
import { requireGuest } from "../-guards";

const searchSchema = z.object({
	token: z.string().catch(""),
});

export const Route = createFileRoute("/auth/verify-email")({
	validateSearch: searchSchema,
	beforeLoad: requireGuest,
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	const { token } = Route.useSearch();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		token ? "loading" : "error",
	);
	const [error, setError] = useState<string | null>(
		token ? null : "No verification token provided.",
	);

	useEffect(() => {
		if (!token) return;

		let cancelled = false;

		async function verify() {
			try {
				await authApi.verifyEmail(token);
				if (!cancelled) setStatus("success");
			} catch (err) {
				if (!cancelled) {
					setError(getErrorMessage(err, "Failed to verify email"));
					setStatus("error");
				}
			}
		}

		void verify();
		return () => {
			cancelled = true;
		};
	}, [token]);

	return (
		<PageTransition pageKey="verify-email">
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
							Email Verification
						</Typography>
						<Typography
							variant="body1"
							color="text.secondary"
							sx={{ lineHeight: 1.7 }}
						>
							Confirming your email address to secure your trading account.
						</Typography>
					</Box>
					<Box
						sx={{
							position: "absolute",
							inset: 0,
							background: (theme) => theme.trading.gradients.meshBg,
							opacity: 0.5,
						}}
					/>
				</Box>

				{/* Right panel - verification status */}
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
										Verify Email
									</Typography>
								</Box>

								{status === "loading" && (
									<Box sx={{ textAlign: "center", py: 4 }}>
										<CircularProgress size={48} sx={{ mb: 3 }} />
										<Typography variant="body1" color="text.secondary">
											Verifying your email address...
										</Typography>
									</Box>
								)}

								{status === "success" && (
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
											Email verified! You can now use all features.
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
								)}

								{status === "error" && (
									<Box sx={{ textAlign: "center" }}>
										<ErrorOutlineIcon
											color="error"
											sx={{ fontSize: 48, mb: 2 }}
										/>
										<Typography
											variant="body1"
											color="text.secondary"
											sx={{ mb: 3 }}
										>
											{error}
										</Typography>
										<Button
											component={Link}
											to="/auth/login"
											variant="contained"
											fullWidth
											size="large"
											sx={{ mb: 2 }}
										>
											Go to Login
										</Button>
										<Typography
											variant="body2"
											color="text.secondary"
											align="center"
										>
											Need a new link?{" "}
											<Box
												component={Link}
												to="/auth/login"
												sx={{ color: "primary.main" }}
											>
												Sign in and request a new verification email
											</Box>
										</Typography>
									</Box>
								)}
							</CardContent>
						</Card>
					</AnimatedGradientBorder>
				</Box>
			</Box>
		</PageTransition>
	);
}
