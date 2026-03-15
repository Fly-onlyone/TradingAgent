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
import { type RegisterInput, registerSchema } from "@/utils/validators";
import { requireGuest } from "../-guards";

export const Route = createFileRoute("/auth/register")({
	beforeLoad: requireGuest,
	component: RegisterPage,
});

function RegisterPage() {
	const { register, isLoading } = useAuth();
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
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
										sx={{ mb: 2 }}
									/>
								)}
							/>

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
								sx={{ mb: 2 }}
							>
								{isLoading ? "Creating account..." : "Create Account"}
							</Button>

							<Typography variant="body2" color="text.secondary" align="center">
								Already have an account?{" "}
								<Box component={Link} to="/auth/login" sx={{ color: "primary.main" }}>
									Sign in
								</Box>
							</Typography>
						</form>
					</CardContent>
				</Card>
			</Box>
		</PageTransition>
	);
}
