/**
 * Chat Message Component
 */

import {useState} from 'react';
import {Box, Typography, Avatar, Paper, Chip, Link} from '@mui/material';
import {AnimatePresence, motion} from 'framer-motion';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import InfoIcon from '@mui/icons-material/Info';
import {formatRelativeTime} from '@/utils/formatters';
import type {AgentMessage} from '@/api/websocket/useAgentSocket';
import {DecisionCard} from './DecisionCard';

interface ChatMessageProps {
    message: AgentMessage;
    showThinkingContent?: boolean;
}

export function ChatMessage({message, showThinkingContent = true}: ChatMessageProps) {
    const [showReasoning, setShowReasoning] = useState(false);
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const hasThinking = !isUser && !isSystem && !!message.thinkingContent && showThinkingContent;

    const getAvatar = () => {
        if (isUser) return <PersonIcon/>;
        if (isSystem) return <InfoIcon/>;
        return <SmartToyIcon/>;
    };

    const getAvatarBg = () => {
        if (isUser) return 'primary.main';
        if (isSystem) return 'warning.main';
        return 'secondary.main';
    };

    return (
        <motion.div
            initial={{opacity: 0, y: 10}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.2}}
        >
            <Box
                sx={{
                    display: 'flex',
                    gap: 1.5,
                    mb: 2,
                    flexDirection: isUser ? 'row-reverse' : 'row',
                }}
            >
                <Avatar
                    sx={{
                        width: 36,
                        height: 36,
                        bgcolor: getAvatarBg(),
                        flexShrink: 0,
                    }}
                >
                    {getAvatar()}
                </Avatar>

                <Box sx={{maxWidth: '80%', minWidth: 0}}>
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1,
                            mb: 0.5,
                            flexDirection: isUser ? 'row-reverse' : 'row',
                            alignItems: 'center',
                        }}
                    >
                        <Typography variant="caption" fontWeight={600}>
                            {isUser ? 'You' : isSystem ? 'System' : 'Agent'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatRelativeTime(new Date(message.timestamp))}
                        </Typography>
                    </Box>

                    <Paper
                        sx={{
                            p: 2,
                            bgcolor: isUser
                                ? 'primary.main'
                                : isSystem
                                    ? (theme) => `rgba(${theme.trading.semanticRgb.warning}, 0.1)`
                                    : 'background.paper',
                            color: isUser ? 'white' : 'text.primary',
                            borderRadius: 2,
                            borderLeft: isUser ? 'none' : isSystem ? 'none' : '2px solid',
                            borderLeftColor: isUser ? undefined : isSystem ? undefined : 'secondary.main',
                            borderTopLeftRadius: isUser ? 16 : 4,
                            borderTopRightRadius: isUser ? 4 : 16,
                        }}
                    >
                        {/* Persistent thinking / reasoning block */}
                        {hasThinking && (
                            <Box sx={{mb: 1.5}}>
                                <Link
                                    component="button"
                                    variant="caption"
                                    underline="hover"
                                    onClick={() => setShowReasoning((v) => !v)}
                                    sx={{color: 'text.secondary', cursor: 'pointer'}}
                                >
                                    {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
                                </Link>

                                <AnimatePresence>
                                    {showReasoning && (
                                        <motion.div
                                            initial={{height: 0, opacity: 0}}
                                            animate={{height: 'auto', opacity: 1}}
                                            exit={{height: 0, opacity: 0}}
                                            transition={{duration: 0.2}}
                                            style={{overflow: 'hidden'}}
                                        >
                                            <Box
                                                sx={{
                                                    mt: 1,
                                                    p: 1.5,
                                                    maxHeight: 200,
                                                    overflow: 'auto',
                                                    bgcolor: 'action.hover',
                                                    borderRadius: 1,
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        whiteSpace: 'pre-wrap',
                                                        color: 'text.secondary',
                                                        fontSize: '0.8rem',
                                                        lineHeight: 1.6,
                                                    }}
                                                >
                                                    {message.thinkingContent}
                                                </Typography>
                                            </Box>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Box>
                        )}

                        <Typography
                            variant="body2"
                            sx={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {message.content}
                        </Typography>

                        {/* Tool Calls */}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                            <Box sx={{mt: 2}}>
                                <Typography variant="caption" color="text.secondary" gutterBottom>
                                    Tools Used:
                                </Typography>
                                <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5}}>
                                    {message.toolCalls.map((tool) => (
                                        <Chip
                                            key={tool.id}
                                            label={tool.name}
                                            size="small"
                                            variant="outlined"
                                            sx={{fontSize: '0.7rem'}}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        )}
                    </Paper>

                    {/* Decision Card */}
                    {message.decision && (
                        <Box sx={{mt: 1}}>
                            <DecisionCard decision={message.decision}/>
                        </Box>
                    )}
                </Box>
            </Box>
        </motion.div>
    );
}

export default ChatMessage;
