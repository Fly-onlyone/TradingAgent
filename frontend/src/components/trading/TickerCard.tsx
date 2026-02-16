/**
 * Ticker Card Component
 */

import {Box, Card, CardContent, IconButton, Skeleton, Typography} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {AnimatePresence, motion} from 'framer-motion';
import type {MouseEvent} from 'react';

import {useMarketStore} from '@/store/marketStore';
import type {Ticker} from '@/types';
import {formatPercent, formatPrice, formatVolume} from '@/utils/formatters';

interface TickerCardProps {
    symbol?: string;
    ticker?: Ticker;
    loading?: boolean;
    compact?: boolean;
    onClick?: () => void;
}

export function TickerCard({symbol, ticker, loading = false, compact = false, onClick}: TickerCardProps) {
    const watchlist = useMarketStore((state) => state.watchlist);
    const addToWatchlist = useMarketStore((state) => state.addToWatchlist);
    const removeFromWatchlist = useMarketStore((state) => state.removeFromWatchlist);
    const liveTicker = useMarketStore((state) => (symbol ? state.tickers[symbol] : undefined));

    const resolvedTicker = ticker ?? liveTicker;
    const isLoading = loading || (!!symbol && !resolvedTicker);

    if (isLoading) {
        return (
            <Card sx={{height: compact ? 80 : 120}}>
                <CardContent>
                    <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                        <Skeleton variant="text" width={80}/>
                        <Skeleton variant="text" width={60}/>
                    </Box>
                    <Skeleton variant="text" width={120} height={32}/>
                    {!compact && <Skeleton variant="text" width={100}/>}
                </CardContent>
            </Card>
        );
    }

    if (!resolvedTicker) return null;

    const isInWatchlist = watchlist.includes(resolvedTicker.symbol);
    const isPositive = resolvedTicker.priceChangePercent >= 0;
    const priceColor = isPositive ? 'success.main' : 'error.main';

    const handleWatchlistToggle = (e: MouseEvent) => {
        e.stopPropagation();

        if (isInWatchlist) {
            removeFromWatchlist(resolvedTicker.symbol);
        } else {
            addToWatchlist(resolvedTicker.symbol);
        }
    };

    return (
        <Card
            component={motion.div}
            whileHover={{y: -2}}
            onClick={onClick}
            sx={{
                cursor: onClick ? 'pointer' : 'default',
                height: compact ? 'auto' : 120,
                background: (theme) => theme.trading.glass.card.background,
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s ease',
                '&:hover': {
                    borderColor: 'primary.main',
                },
            }}
        >
            <CardContent sx={{p: compact ? 1.5 : 2}}>
                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1}}>
                    <Box>
                        <Typography variant={compact ? 'body2' : 'subtitle1'} fontWeight={600}>
                            {resolvedTicker.symbol.replace('-', '/')}
                        </Typography>
                    </Box>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={resolvedTicker.priceChangePercent}
                                initial={{opacity: 0, y: -5}}
                                animate={{opacity: 1, y: 0}}
                                exit={{opacity: 0, y: 5}}
                            >
                                <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    sx={{color: priceColor}}
                                >
                                    {formatPercent(resolvedTicker.priceChangePercent)}
                                </Typography>
                            </motion.div>
                        </AnimatePresence>
                        <IconButton
                            size="small"
                            onClick={handleWatchlistToggle}
                            sx={{ml: 0.5, p: 0.25}}
                        >
                            {isInWatchlist ? (
                                <StarIcon sx={{fontSize: 18, color: 'warning.main'}}/>
                            ) : (
                                <StarBorderIcon sx={{fontSize: 18, color: 'text.secondary'}}/>
                            )}
                        </IconButton>
                    </Box>
                </Box>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={resolvedTicker.lastPrice}
                        initial={{
                            backgroundColor: isPositive
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(239, 68, 68, 0.2)',
                        }}
                        animate={{backgroundColor: 'transparent'}}
                        transition={{duration: 0.5}}
                    >
                        <Typography
                            variant={compact ? 'h6' : 'h5'}
                            fontWeight={700}
                            sx={{
                                fontFamily: (theme) => theme.trading.mono,
                                color: priceColor,
                            }}
                        >
                            ${formatPrice(resolvedTicker.lastPrice)}
                        </Typography>
                    </motion.div>
                </AnimatePresence>

                {!compact && (
                    <Box sx={{display: 'flex', gap: 2, mt: 1}}>
                        <Typography variant="caption" color="text.secondary">
                            Vol: {formatVolume(resolvedTicker.volume24h)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            H: ${formatPrice(resolvedTicker.high24h)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            L: ${formatPrice(resolvedTicker.low24h)}
                        </Typography>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
}

export default TickerCard;
