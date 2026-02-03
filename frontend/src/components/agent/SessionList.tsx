/**
 * Session List Component for Chat History Sidebar
 */

import {useState} from 'react';
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Typography,
    IconButton,
    Collapse,
    Chip,
    Skeleton,
    Menu,
    MenuItem,
    ListItemSecondaryAction,
    Tooltip,
    Divider,
} from '@mui/material';
import {motion, AnimatePresence} from 'framer-motion';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type {AgentSession, SessionsByDateGroup} from '@/types/session';

interface SessionListProps {
    groups: SessionsByDateGroup[];
    currentSessionId?: string;
    isLoading?: boolean;
    onSessionSelect: (sessionId: string) => void;
    onNewSession: () => void;
    onDeleteSession?: (sessionId: string) => void;
    onRenameSession?: (sessionId: string, newTitle: string) => void;
}

interface SessionItemProps {
    session: AgentSession;
    isSelected: boolean;
    onSelect: () => void;
    onDelete?: () => void;
    onRename?: (newTitle: string) => void;
}

function SessionItem({session, isSelected, onSelect, onDelete, onRename}: SessionItemProps) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleDelete = () => {
        handleMenuClose();
        onDelete?.();
    };

    const handleRename = () => {
        handleMenuClose();
        const newTitle = prompt('Enter new title:', session.title || '');
        if (newTitle && newTitle !== session.title) {
            onRename?.(newTitle);
        }
    };

    // Format display info
    const displayTitle = session.title || 'New Chat';
    const messageCount = session.totalMessages;
    const hasDecisions = session.decisionsMade > 0;

    return (
        <ListItem
            component={motion.li}
            initial={{opacity: 0, x: -20}}
            animate={{opacity: 1, x: 0}}
            disablePadding
            sx={{mb: 0.5}}
        >
            <ListItemButton
                selected={isSelected}
                onClick={onSelect}
                sx={{
                    borderRadius: 1,
                    py: 1,
                    '&.Mui-selected': {
                        bgcolor: 'action.selected',
                        '&:hover': {
                            bgcolor: 'action.selected',
                        },
                    },
                }}
            >
                <ListItemIcon sx={{minWidth: 36}}>
                    <ChatBubbleOutlineIcon fontSize="small" color={isSelected ? 'primary' : 'action'}/>
                </ListItemIcon>
                <ListItemText
                    primary={
                        <Typography
                            variant="body2"
                            noWrap
                            sx={{
                                fontWeight: isSelected ? 600 : 400,
                                maxWidth: 160,
                            }}
                        >
                            {displayTitle}
                        </Typography>
                    }
                    secondary={
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25}}>
                            <Typography variant="caption" color="text.secondary">
                                {messageCount} messages
                            </Typography>
                            {hasDecisions && (
                                <Chip
                                    label={`${session.decisionsMade} decisions`}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        height: 16,
                                        fontSize: '0.65rem',
                                        '& .MuiChip-label': {px: 0.5},
                                    }}
                                />
                            )}
                        </Box>
                    }
                />
                <ListItemSecondaryAction>
                    <IconButton
                        edge="end"
                        size="small"
                        onClick={handleMenuOpen}
                        sx={{opacity: 0.6, '&:hover': {opacity: 1}}}
                    >
                        <MoreVertIcon fontSize="small"/>
                    </IconButton>
                </ListItemSecondaryAction>
            </ListItemButton>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <MenuItem onClick={handleRename} dense>
                    <ListItemIcon>
                        <EditOutlinedIcon fontSize="small"/>
                    </ListItemIcon>
                    <ListItemText>Rename</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete} dense sx={{color: 'error.main'}}>
                    <ListItemIcon>
                        <DeleteOutlineIcon fontSize="small" color="error"/>
                    </ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
            </Menu>
        </ListItem>
    );
}

interface DateGroupProps {
    group: SessionsByDateGroup;
    currentSessionId?: string;
    onSessionSelect: (sessionId: string) => void;
    onDeleteSession?: (sessionId: string) => void;
    onRenameSession?: (sessionId: string, newTitle: string) => void;
}

function DateGroup({
                       group,
                       currentSessionId,
                       onSessionSelect,
                       onDeleteSession,
                       onRenameSession,
                   }: DateGroupProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <Box sx={{mb: 1}}>
            <ListItemButton
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{
                    py: 0.5,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': {bgcolor: 'action.hover'},
                }}
            >
                <Typography
                    variant="caption"
                    fontWeight={600}
                    color="text.secondary"
                    sx={{flexGrow: 1, textTransform: 'uppercase', letterSpacing: 0.5}}
                >
                    {group.label}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{mr: 0.5}}>
                    {group.sessions.length}
                </Typography>
                {isExpanded ? (
                    <ExpandLessIcon fontSize="small" color="action"/>
                ) : (
                    <ExpandMoreIcon fontSize="small" color="action"/>
                )}
            </ListItemButton>

            <Collapse in={isExpanded}>
                <List dense disablePadding sx={{pl: 1}}>
                    <AnimatePresence>
                        {group.sessions.map((session) => (
                            <SessionItem
                                key={session.id}
                                session={session}
                                isSelected={session.id === currentSessionId}
                                onSelect={() => onSessionSelect(session.id)}
                                onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                                onRename={
                                    onRenameSession
                                        ? (newTitle) => onRenameSession(session.id, newTitle)
                                        : undefined
                                }
                            />
                        ))}
                    </AnimatePresence>
                </List>
            </Collapse>
        </Box>
    );
}

function SessionListSkeleton() {
    return (
        <Box sx={{px: 1}}>
            {[1, 2, 3].map((i) => (
                <Box key={i} sx={{mb: 2}}>
                    <Skeleton variant="text" width={80} height={20} sx={{mb: 1}}/>
                    {[1, 2].map((j) => (
                        <Box key={j} sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1, pl: 1}}>
                            <Skeleton variant="circular" width={20} height={20}/>
                            <Box sx={{flexGrow: 1}}>
                                <Skeleton variant="text" width="80%" height={18}/>
                                <Skeleton variant="text" width="50%" height={14}/>
                            </Box>
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
}

export function SessionList({
                                groups,
                                currentSessionId,
                                isLoading = false,
                                onSessionSelect,
                                onNewSession,
                                onDeleteSession,
                                onRenameSession,
                            }: SessionListProps) {
    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.paper',
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Typography variant="subtitle1" fontWeight={600}>
                    Chat History
                </Typography>
                <Tooltip title="New Chat">
                    <IconButton size="small" onClick={onNewSession} color="primary">
                        <AddIcon/>
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Session List */}
            <Box sx={{flexGrow: 1, overflow: 'auto', p: 1}}>
                {isLoading ? (
                    <SessionListSkeleton/>
                ) : groups.length === 0 ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'text.secondary',
                            p: 2,
                        }}
                    >
                        <ChatBubbleOutlineIcon sx={{fontSize: 48, mb: 1, opacity: 0.5}}/>
                        <Typography variant="body2" textAlign="center">
                            No chat history yet
                        </Typography>
                        <Typography variant="caption" textAlign="center" color="text.disabled">
                            Start a new conversation to begin
                        </Typography>
                    </Box>
                ) : (
                    <AnimatePresence>
                        {groups.map((group) => (
                            <DateGroup
                                key={group.date}
                                group={group}
                                currentSessionId={currentSessionId}
                                onSessionSelect={onSessionSelect}
                                onDeleteSession={onDeleteSession}
                                onRenameSession={onRenameSession}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </Box>

            {/* Footer */}
            <Divider/>
            <Box sx={{p: 1.5}}>
                <Typography variant="caption" color="text.disabled" textAlign="center" display="block">
                    {groups.reduce((sum, g) => sum + g.sessions.length, 0)} conversations
                </Typography>
            </Box>
        </Box>
    );
}

export default SessionList;
