/**
 * Login Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
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
	IconButton,
	InputAdornment,
	TextField,
	Typography,
} from "@mui/material";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PageTransition } from "@/components/common/PageTransition";
import { useAuth } from "@/hooks/useAuth";
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
			setError((err as Error).message || "Login failed");
		}
	};

	return (
		<PageTransition pageKey="login">
			<Box
				sx={{
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					p: 2,
				}}
			>
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
								Sign in to your account
							</Typography>
						</Box>

						{error && (
							<Alert severity="error" sx={{ mb: 3 }}>
								{error}
							</Alert>
						)}

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
								sx={{ mb: 2 }}
							>
								{isLoading ? "Signing in..." : "Sign In"}
							</Button>

							<Typography variant="body2" color="text.secondary" align="center">
								Don't have an account?{" "}
								<Link to="/auth/register" style={{ color: "#F97316" }}>
									Sign up
								</Link>
							</Typography>
						</form>
					</CardContent>
				</Card>
			</Box>
		</PageTransition>
	);
}
