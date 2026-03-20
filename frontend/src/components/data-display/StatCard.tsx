/**
 * Stat Card Component for displaying metrics
 */

import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {Box, Card, CardContent, Typography, useTheme} from "@mui/material";
import {motion, useReducedMotion} from "framer-motion";
import type {ReactNode} from "react";
import {useEffect, useRef, useState} from "react";
import {ShimmerSkeleton} from "@/components/common/ShimmerSkeleton";
import {RollingDigits} from "@/components/effects/RollingDigits";
import {Sparkline} from "@/components/effects/Sparkline";
import {useTilt} from "@/hooks/useTilt";
import {staggerCascade} from "@/utils/animations/variants";

interface StatCardProps {
    title: string;
    value: string | number;
    change?: number;
    changeLabel?: string;
    icon?: ReactNode;
    loading?: boolean;
    trend?: "up" | "down" | "neutral";
    prefix?: string;
    suffix?: string;
    sparklineData?: number[];
    useRolling?: boolean;
}

export function StatCard({
                             title,
                             value,
                             change,
                             changeLabel,
                             icon,
                             loading = false,
                             trend,
                             prefix,
                             suffix,
                             sparklineData,
                             useRolling = false,
                         }: StatCardProps) {
    const theme = useTheme();
    const primaryRgb = theme.trading.primaryRgb;

    // Determine trend from change if not provided
    const effectiveTrend =
        trend ||
        (change !== undefined
            ? change > 0
                ? "up"
                : change < 0
                    ? "down"
                    : "neutral"
            : undefined);

    // Track value changes for flash animation
    const prevValueRef = useRef(value);
    const [flashKey, setFlashKey] = useState(0);
    const [flashTrend, setFlashTrend] = useState<"up" | "down" | null>(null);

    useEffect(() => {
        if (prevValueRef.current !== value && !loading) {
            const prev =
                typeof prevValueRef.current === "number"
                    ? prevValueRef.current
                    : 0;
            const curr = typeof value === "number" ? value : 0;
            setFlashTrend(curr >= prev ? "up" : "down");
            setFlashKey((k) => k + 1);
            prevValueRef.current = value;
        }
    }, [value, loading]);

    const bullishRgb = theme.trading.colors.bullishRgb;
    const bearishRgb = theme.trading.colors.bearishRgb;
    const flashColors =
        flashTrend === "up"
            ? {
                backgroundColor: [
                    `rgba(${bullishRgb},0)`,
                    `rgba(${bullishRgb},0.2)`,
                    `rgba(${bullishRgb},0)`,
                ],
                transition: {duration: 0.7},
            }
            : {
                backgroundColor: [
                    `rgba(${bearishRgb},0)`,
                    `rgba(${bearishRgb},0.2)`,
                    `rgba(${bearishRgb},0)`,
                ],
                transition: {duration: 0.7},
            };

    const trendColors = {
        up: "success.main",
        down: "error.main",
        neutral: "text.secondary",
    };

    const TrendIcon =
        effectiveTrend === "up"
            ? TrendingUpIcon
            : effectiveTrend === "down"
                ? TrendingDownIcon
                : TrendingFlatIcon;

    const accent = {
        borderColor: `rgba(${primaryRgb},0.2)`,
        leftColor: theme.palette.primary.main,
        hoverBorder: `rgba(${primaryRgb},0.7)`,
        hoverGlow: `0 0 0 2px rgba(${primaryRgb},0.3), 0 0 20px rgba(${primaryRgb},0.2)`,
    };
    const tiltRef = useRef<HTMLDivElement>(null);
    const prefersReduced = useReducedMotion();
    const {
        style: tiltStyle,
        onMouseMove: onTiltMove,
        onMouseLeave: onTiltLeave,
    } = useTilt(tiltRef);

    return (
        <motion.div
            ref={tiltRef}
            style={{
                height: "100%",
                ...(prefersReduced ? undefined : tiltStyle),
            }}
            onMouseMove={prefersReduced ? undefined : onTiltMove}
            onMouseLeave={prefersReduced ? undefined : onTiltLeave}
        >
            <Card
                component={motion.div}
                variants={staggerCascade.item}
                key={flashKey || undefined}
                animate={flashKey > 0 ? flashColors : undefined}
                sx={{
                    height: "100%",
                    backdropFilter: "blur(12px)",
                    borderLeft: `2px solid ${accent.leftColor}`,
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    "&:hover": {
                        borderColor: accent.hoverBorder,
                        borderLeftColor: accent.leftColor,
                        boxShadow: accent.hoverGlow,
                    },
                }}
            >
                <CardContent>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            mb: 2,
                        }}
                    >
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            fontWeight={500}
                        >
                            {title}
                        </Typography>
                        {icon && (
                            <motion.div
                                animate={
                                    effectiveTrend === "up" ||
                                    effectiveTrend === "down"
                                        ? {
                                            scale: [1, 1.1, 1],
                                            transition: {
                                                duration: 2.5,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            },
                                        }
                                        : undefined
                                }
                            >
                                <Box
                                    sx={{
                                        color: "primary.contrastText",
                                        width: 40,
                                        height: 40,
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background:
                                            effectiveTrend === "up"
                                                ? (t) =>
                                                    `linear-gradient(135deg, ${t.palette.success.main}, ${t.palette.success.light})`
                                                : effectiveTrend === "down"
                                                    ? (t) =>
                                                        `linear-gradient(135deg, ${t.palette.error.main}, ${t.palette.error.light})`
                                                    : (t) =>
                                                        `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.light})`,
                                        "& svg": {fontSize: 20},
                                    }}
                                >
                                    {icon}
                                </Box>
                            </motion.div>
                        )}
                    </Box>

                    {loading ? (
                        <>
                            <ShimmerSkeleton
                                variant="text"
                                width="60%"
                                height={40}
                            />
                            <ShimmerSkeleton
                                variant="text"
                                width="40%"
                                height={24}
                            />
                        </>
                    ) : (
                        <>
                            <Typography
                                variant="h4"
                                fontWeight={700}
                                component="div"
                                sx={{
                                    fontFamily: (t) => t.trading.mono,
                                    mb: 1,
                                }}
                            >
                                {useRolling && typeof value === "string" ? (
                                    <>
                                        {prefix}
                                        <RollingDigits value={value}/>
                                        {suffix}
                                    </>
                                ) : (
                                    <>
                                        {prefix}
                                        {value}
                                        {suffix}
                                    </>
                                )}
                            </Typography>

                            {sparklineData && sparklineData.length >= 2 && (
                                <Box sx={{mb: 1}}>
                                    <Sparkline
                                        data={sparklineData}
                                        strokeColor={
                                            effectiveTrend === "up"
                                                ? theme.palette.success.main
                                                : effectiveTrend === "down"
                                                    ? theme.palette.error.main
                                                    : theme.palette.primary
                                                        .main
                                        }
                                    />
                                </Box>
                            )}

                            {(change !== undefined || changeLabel) && (
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                    }}
                                >
                                    {effectiveTrend && (
                                        <TrendIcon
                                            sx={{
                                                fontSize: 18,
                                                color: trendColors[
                                                    effectiveTrend
                                                    ],
                                            }}
                                        />
                                    )}
                                    {change !== undefined && (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: trendColors[
                                                effectiveTrend || "neutral"
                                                    ],
                                                fontWeight: 500,
                                            }}
                                        >
                                            {change > 0 ? "+" : ""}
                                            {change.toFixed(2)}%
                                        </Typography>
                                    )}
                                    {changeLabel && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                        >
                                            {changeLabel}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}

export default StatCard;
