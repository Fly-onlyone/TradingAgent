import { Avatar, type SxProps, type Theme } from "@mui/material";
import { useState } from "react";

interface CoinIconProps {
	symbol: string;
	size?: number;
	sx?: SxProps<Theme>;
}

/** Crypto coin icon from CoinCap CDN with letter fallback. */
export function CoinIcon({ symbol, size = 24, sx }: CoinIconProps) {
	const [imgError, setImgError] = useState(false);
	const letter = symbol.charAt(0).toUpperCase();
	const src = imgError
		? undefined
		: `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;

	return (
		<Avatar
			src={src}
			alt={symbol}
			slotProps={{
				img: { onError: () => setImgError(true) },
			}}
			sx={{
				width: size,
				height: size,
				fontSize: size * 0.45,
				bgcolor: imgError ? "primary.dark" : "transparent",
				...sx,
			}}
		>
			{letter}
		</Avatar>
	);
}
