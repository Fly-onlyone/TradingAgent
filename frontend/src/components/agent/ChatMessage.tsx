/**
 * Chat Message Component
 */

import { Box, Typography, Avatar, Paper, Chip } from '@mui/material';
import { motion } from 'framer-motion';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import InfoIcon from '@mui/icons-material/Info';
import { formatRelativeTime } from '@/utils/formatters';
import type { AgentMessage } from '@/api/websocket/useAgentSocket';
import { DecisionCard } from './DecisionCard';

interface ChatMessageProps {
  message: AgentMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const getAvatar = () => {
    if (isUser) return <PersonIcon />;
    if (isSystem) return <InfoIcon />;
    return <SmartToyIcon />;
  };

  const getAvatarBg = () => {
    if (isUser) return 'primary.main';
    if (isSystem) return 'warning.main';
    return 'secondary.main';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
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

        <Box sx={{ maxWidth: '80%', minWidth: 0 }}>
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
                  ? 'rgba(251, 191, 36, 0.1)'
                  : 'background.paper',
              color: isUser ? 'white' : 'text.primary',
              borderRadius: 2,
              borderTopLeftRadius: isUser ? 16 : 4,
              borderTopRightRadius: isUser ? 4 : 16,
            }}
          >
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
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Tools Used:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {message.toolCalls.map((tool) => (
                    <Chip
                      key={tool.id}
                      label={tool.name}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Paper>

          {/* Decision Card */}
          {message.decision && (
            <Box sx={{ mt: 1 }}>
              <DecisionCard decision={message.decision} />
            </Box>
          )}
        </Box>
      </Box>
    </motion.div>
  );
}

export default ChatMessage;
