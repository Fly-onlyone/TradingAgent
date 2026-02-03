/**
 * Chat Input Component
 */

import { useState, useCallback, type KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onRequestAnalysis?: (symbol?: string) => void;
  onRequestRecommendation?: () => void;
  isThinking?: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSendMessage,
  onRequestAnalysis,
  onRequestRecommendation,
  isThinking = false,
  disabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSend = useCallback(() => {
    if (message.trim() && !isThinking && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  }, [message, isThinking, disabled, onSendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box>
      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {onRequestAnalysis && (
          <Tooltip title="Request market analysis">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ShowChartIcon />}
              onClick={() => onRequestAnalysis()}
              disabled={isThinking || disabled}
            >
              Analyze
            </Button>
          </Tooltip>
        )}
        {onRequestRecommendation && (
          <Tooltip title="Get trading recommendation">
            <Button
              size="small"
              variant="outlined"
              startIcon={<LightbulbIcon />}
              onClick={onRequestRecommendation}
              disabled={isThinking || disabled}
            >
              Recommend
            </Button>
          </Tooltip>
        )}
      </Box>

      {/* Input Field */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder={isThinking ? 'Agent is thinking...' : 'Type your message...'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking || disabled}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!message.trim() || isThinking || disabled}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.dark',
            },
            '&.Mui-disabled': {
              bgcolor: 'action.disabledBackground',
            },
          }}
        >
          {isThinking ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            <SendIcon />
          )}
        </IconButton>
      </Box>
    </Box>
  );
}

export default ChatInput;
